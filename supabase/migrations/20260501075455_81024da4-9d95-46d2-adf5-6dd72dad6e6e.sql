
-- 1. Add pass code column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qr_code_pass text UNIQUE;

-- 2. Helper to generate a friendly 8-char code (no ambiguous chars)
CREATE OR REPLACE FUNCTION public.generate_qr_pass_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text;
  i int;
  attempts int := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    -- Ensure uniqueness
    PERFORM 1 FROM public.profiles WHERE qr_code_pass = result;
    IF NOT FOUND THEN
      RETURN result;
    END IF;
    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate unique pass code';
    END IF;
  END LOOP;
END;
$$;

-- 3. Backfill existing profiles
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT user_id FROM public.profiles WHERE qr_code_pass IS NULL LOOP
    UPDATE public.profiles
      SET qr_code_pass = public.generate_qr_pass_code()
      WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- 4. Trigger to auto-generate for new profiles
CREATE OR REPLACE FUNCTION public.set_qr_code_pass_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.qr_code_pass IS NULL THEN
    NEW.qr_code_pass := public.generate_qr_pass_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_qr_code_pass ON public.profiles;
CREATE TRIGGER profiles_set_qr_code_pass
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_qr_code_pass_on_insert();

-- 5. verify_pass: kitchen/admin only, returns jsonb shaped like VerifyResult
CREATE OR REPLACE FUNCTION public.verify_pass(_pass_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _sub record;
  _today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
  _today_iso int := EXTRACT(ISODOW FROM _today)::int;
  _already_served boolean;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'kitchen') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Forbidden: kitchen or admin only';
  END IF;

  SELECT * INTO _profile FROM public.profiles
    WHERE qr_code_pass = upper(trim(_pass_code))
       OR qr_code_pass = trim(_pass_code)
       OR user_id::text = trim(_pass_code)
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'invalid',
      'name', null, 'surname', null,
      'plan_name', null, 'valid_until', null,
      'subscription_id', null, 'user_id', null,
      'message', 'QR code not recognised'
    );
  END IF;

  SELECT s.id, s.end_date, s.start_date, mp.name AS plan_name, mp.allowed_weekdays
  INTO _sub
  FROM public.subscriptions s
  JOIN public.meal_plans mp ON mp.id = s.plan_id
  WHERE s.user_id = _profile.user_id AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'unpaid',
      'name', _profile.name, 'surname', _profile.surname,
      'plan_name', null, 'valid_until', null,
      'subscription_id', null, 'user_id', _profile.user_id,
      'message', 'No active subscription'
    );
  END IF;

  IF _sub.end_date IS NOT NULL AND _sub.end_date < _today THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'unpaid',
      'name', _profile.name, 'surname', _profile.surname,
      'plan_name', _sub.plan_name, 'valid_until', _sub.end_date,
      'subscription_id', _sub.id, 'user_id', _profile.user_id,
      'message', 'Subscription expired'
    );
  END IF;

  IF NOT (_today_iso = ANY(_sub.allowed_weekdays)) THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'not_eligible',
      'name', _profile.name, 'surname', _profile.surname,
      'plan_name', _sub.plan_name, 'valid_until', _sub.end_date,
      'subscription_id', _sub.id, 'user_id', _profile.user_id,
      'message', 'Plan does not cover today'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.meal_redemptions
    WHERE subscription_id = _sub.id AND redeemed_on = _today
  ) INTO _already_served;

  IF _already_served THEN
    RETURN jsonb_build_object(
      'ok', false, 'status', 'already_served',
      'name', _profile.name, 'surname', _profile.surname,
      'plan_name', _sub.plan_name, 'valid_until', _sub.end_date,
      'subscription_id', _sub.id, 'user_id', _profile.user_id,
      'message', 'Already served today'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'eligible',
    'name', _profile.name, 'surname', _profile.surname,
    'plan_name', _sub.plan_name, 'valid_until', _sub.end_date,
    'subscription_id', _sub.id, 'user_id', _profile.user_id,
    'message', 'Eligible to be served'
  );
END;
$$;

-- 6. serve_meal_by_pass: atomic verify + insert
CREATE OR REPLACE FUNCTION public.serve_meal_by_pass(_pass_code text, _kitchen_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _verdict jsonb;
  _sub_id uuid;
  _user_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'kitchen') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Forbidden: kitchen or admin only';
  END IF;

  _verdict := public.verify_pass(_pass_code);

  IF (_verdict->>'ok')::boolean IS NOT TRUE THEN
    RETURN _verdict;
  END IF;

  _sub_id := (_verdict->>'subscription_id')::uuid;
  _user_id := (_verdict->>'user_id')::uuid;

  BEGIN
    INSERT INTO public.meal_redemptions (user_id, subscription_id, redeemed_by)
    VALUES (_user_id, _sub_id, COALESCE(_kitchen_user_id, auth.uid()));
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_set(
      jsonb_set(_verdict, '{ok}', 'false'::jsonb),
      '{status}', '"already_served"'::jsonb
    ) || jsonb_build_object('message', 'Already served today');
  END;

  RETURN _verdict || jsonb_build_object('message', 'Meal recorded');
END;
$$;

-- 7. admin_reissue_pass_code
CREATE OR REPLACE FUNCTION public.admin_reissue_pass_code(_target_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  _new := public.generate_qr_pass_code();
  UPDATE public.profiles SET qr_code_pass = _new WHERE user_id = _target_user;

  RETURN jsonb_build_object('ok', true, 'qr_code_pass', _new);
END;
$$;
