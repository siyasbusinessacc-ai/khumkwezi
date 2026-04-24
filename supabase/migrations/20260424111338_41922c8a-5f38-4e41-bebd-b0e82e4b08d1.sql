
-- =========================================================
-- Admin policies
-- =========================================================

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update subscriptions (cancel, etc) - actual mutations done via SECURITY DEFINER funcs
CREATE POLICY "Admins can update subscriptions"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can manage meal_plans
CREATE POLICY "Admins can insert meal plans"
ON public.meal_plans
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update meal plans"
ON public.meal_plans
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete redemptions (corrections)
CREATE POLICY "Admins can delete redemptions"
ON public.meal_redemptions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Bootstrap function: claim first admin
-- (Allows the very first user to become admin if no admin exists.)
-- =========================================================
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing_admins int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(*) INTO _existing_admins FROM public.user_roles WHERE role = 'admin';

  IF _existing_admins > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'admin_exists');
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =========================================================
-- Admin: grant role by user_id
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_grant_role(_target_user uuid, _role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =========================================================
-- Admin: revoke role
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_revoke_role(_target_user uuid, _role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  -- Prevent removing the last admin
  IF _role = 'admin' THEN
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'last_admin');
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user AND role = _role;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =========================================================
-- Admin: find user by email (returns user_id from profiles)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_find_user_by_email(_email text)
RETURNS TABLE(user_id uuid, name text, surname text, email text, student_number text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.name, p.surname, p.email, p.student_number
  FROM public.profiles p
  WHERE public.has_role(auth.uid(), 'admin')
    AND lower(p.email) = lower(_email)
  LIMIT 1;
$$;

-- =========================================================
-- Admin: list users (search)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_list_users(_search text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE(
  user_id uuid,
  name text,
  surname text,
  email text,
  student_number text,
  roles app_role[],
  active_subscription_id uuid,
  active_plan_name text,
  active_end_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.name,
    p.surname,
    p.email,
    p.student_number,
    COALESCE(
      (SELECT array_agg(ur.role) FROM public.user_roles ur WHERE ur.user_id = p.user_id),
      '{}'::app_role[]
    ) AS roles,
    s.id AS active_subscription_id,
    mp.name AS active_plan_name,
    s.end_date AS active_end_date
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT id, plan_id, end_date
    FROM public.subscriptions
    WHERE user_id = p.user_id AND status = 'active'
    ORDER BY created_at DESC LIMIT 1
  ) s ON TRUE
  LEFT JOIN public.meal_plans mp ON mp.id = s.plan_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (
      _search IS NULL OR _search = '' OR
      lower(p.email) LIKE '%' || lower(_search) || '%' OR
      lower(coalesce(p.name,'')) LIKE '%' || lower(_search) || '%' OR
      lower(coalesce(p.surname,'')) LIKE '%' || lower(_search) || '%' OR
      lower(coalesce(p.student_number,'')) LIKE '%' || lower(_search) || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT _limit;
$$;

-- =========================================================
-- Admin: manually activate a subscription (e.g. cash payment)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_activate_subscription(
  _target_user uuid,
  _plan_id uuid,
  _start_date date DEFAULT NULL,
  _end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan public.meal_plans%ROWTYPE;
  _start date;
  _end date;
  _new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT * INTO _plan FROM public.meal_plans WHERE id = _plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  _start := COALESCE(_start_date, (now() AT TIME ZONE 'Africa/Johannesburg')::date);
  _end := COALESCE(_end_date, _start + (_plan.duration_days || ' days')::interval);

  -- Cancel any existing active subscription for this user
  UPDATE public.subscriptions
  SET status = 'cancelled', updated_at = now()
  WHERE user_id = _target_user AND status = 'active';

  INSERT INTO public.subscriptions (user_id, plan_id, status, amount_cents, start_date, end_date, activated_at)
  VALUES (_target_user, _plan_id, 'active', _plan.price_cents, _start, _end, now())
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('ok', true, 'subscription_id', _new_id);
END;
$$;

-- =========================================================
-- Admin: cancel subscription
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_cancel_subscription(_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  UPDATE public.subscriptions
  SET status = 'cancelled', updated_at = now()
  WHERE id = _subscription_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =========================================================
-- Admin: dashboard stats
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
  _week_start date := _today - 6;
  _meals_today int;
  _meals_week int;
  _active_subs int;
  _pending_subs int;
  _total_students int;
  _revenue_cents bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT count(*) INTO _meals_today FROM public.meal_redemptions WHERE redeemed_on = _today;
  SELECT count(*) INTO _meals_week  FROM public.meal_redemptions WHERE redeemed_on >= _week_start;
  SELECT count(*) INTO _active_subs FROM public.subscriptions WHERE status = 'active';
  SELECT count(*) INTO _pending_subs FROM public.subscriptions WHERE status = 'pending';
  SELECT count(*) INTO _total_students FROM public.profiles;
  SELECT COALESCE(sum(amount_cents), 0) INTO _revenue_cents
    FROM public.subscriptions
    WHERE status = 'active' AND activated_at >= (date_trunc('month', now()));

  RETURN jsonb_build_object(
    'meals_today', _meals_today,
    'meals_week', _meals_week,
    'active_subscriptions', _active_subs,
    'pending_subscriptions', _pending_subs,
    'total_students', _total_students,
    'month_revenue_cents', _revenue_cents
  );
END;
$$;

-- =========================================================
-- Admin: recent redemptions
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_recent_redemptions(_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  surname text,
  student_number text,
  redeemed_at timestamptz,
  redeemed_on date,
  served_by_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.user_id,
    p.name,
    p.surname,
    p.student_number,
    r.redeemed_at,
    r.redeemed_on,
    sp.name AS served_by_name
  FROM public.meal_redemptions r
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  LEFT JOIN public.profiles sp ON sp.user_id = r.redeemed_by
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY r.redeemed_at DESC
  LIMIT _limit;
$$;
