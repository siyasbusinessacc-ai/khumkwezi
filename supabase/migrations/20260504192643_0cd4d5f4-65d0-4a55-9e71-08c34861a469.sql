
-- =========================================================
-- PHASE 2: OFFERS, BROADCASTS, SLOTS, ANALYTICS
-- =========================================================

-- --- OFFERS ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','flat')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  max_redemptions integer,
  current_redemptions integer NOT NULL DEFAULT 0,
  per_user_limit integer NOT NULL DEFAULT 1,
  applicable_plan_ids uuid[] NOT NULL DEFAULT '{}',
  min_subtotal_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage offers" ON public.offers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Active offers readable" ON public.offers
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE TRIGGER trg_offers_updated BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --- OFFER REDEMPTIONS ---------------------------------------
CREATE TABLE IF NOT EXISTS public.offer_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  applied_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.offer_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own offer redemptions" ON public.offer_redemptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_offer_redemptions_user ON public.offer_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_offer_redemptions_offer ON public.offer_redemptions(offer_id);

-- --- BROADCASTS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  target text NOT NULL DEFAULT 'all' CHECK (target IN ('all','tier')),
  target_tier public.user_tier,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage broadcasts" ON public.broadcasts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Students read targeted broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated
  USING (
    target = 'all'
    OR (target = 'tier' AND target_tier = (SELECT tier FROM public.profiles WHERE user_id = auth.uid()))
    OR public.has_role(auth.uid(),'admin')
  );

CREATE TABLE IF NOT EXISTS public.broadcast_reads (
  user_id uuid NOT NULL,
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, broadcast_id)
);
ALTER TABLE public.broadcast_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reads" ON public.broadcast_reads
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- --- MEAL SLOTS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  weekdays integer[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meal_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage slots" ON public.meal_slots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Slots readable" ON public.meal_slots
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_meal_slots_updated BEFORE UPDATE ON public.meal_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add slot_id to meal_redemptions (nullable for backward compat)
ALTER TABLE public.meal_redemptions
  ADD COLUMN IF NOT EXISTS slot_id uuid REFERENCES public.meal_slots(id);
CREATE INDEX IF NOT EXISTS idx_meal_redemptions_slot_day ON public.meal_redemptions(slot_id, redeemed_on);

-- =========================================================
-- FUNCTIONS
-- =========================================================

-- Update apply_wallet_credit_to_subscription to honor already-applied offer
CREATE OR REPLACE FUNCTION public.apply_wallet_credit_to_subscription(_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _plan public.meal_plans%ROWTYPE;
  _cap int; _bal int; _apply int;
  _already_offer int;
  _remaining_cap int;
BEGIN
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  IF _sub.user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _sub.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  SELECT * INTO _plan FROM public.meal_plans WHERE id = _sub.plan_id;
  SELECT COALESCE(max_credit_cents,0) INTO _cap FROM public.credit_caps WHERE plan_id = _sub.plan_id;
  SELECT discount_wallet_balance_cents INTO _bal FROM public.profiles WHERE user_id = _sub.user_id;
  SELECT COALESCE(SUM(applied_cents),0) INTO _already_offer FROM public.offer_redemptions WHERE subscription_id = _subscription_id;

  _remaining_cap := GREATEST(0, COALESCE(_cap,0) - _already_offer);
  _apply := LEAST(_remaining_cap, COALESCE(_bal,0), _sub.amount_cents);
  IF _apply <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'applied_cents', 0, 'new_amount_cents', _sub.amount_cents);
  END IF;

  UPDATE public.subscriptions
    SET amount_cents = amount_cents - _apply, updated_at = now()
    WHERE id = _subscription_id;

  PERFORM public.credit_wallet(_sub.user_id, -_apply, 'checkout_redeem', _subscription_id, 'Applied at checkout');

  RETURN jsonb_build_object('ok', true, 'applied_cents', _apply,
    'new_amount_cents', _sub.amount_cents - _apply);
END $$;

-- Redeem an offer code against a pending subscription
CREATE OR REPLACE FUNCTION public.redeem_offer_code(_code text, _subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _sub public.subscriptions%ROWTYPE;
  _offer public.offers%ROWTYPE;
  _user_used int;
  _cap int;
  _already_wallet int;
  _already_offer int;
  _remaining_cap int;
  _raw_discount int;
  _apply int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  IF _sub.user_id <> _uid THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _sub.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  SELECT * INTO _offer FROM public.offers WHERE upper(code) = upper(trim(_code)) AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  IF _offer.starts_at > now() OR (_offer.ends_at IS NOT NULL AND _offer.ends_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_in_window');
  END IF;

  IF _offer.max_redemptions IS NOT NULL AND _offer.current_redemptions >= _offer.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sold_out');
  END IF;

  IF array_length(_offer.applicable_plan_ids,1) IS NOT NULL
     AND NOT (_sub.plan_id = ANY(_offer.applicable_plan_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plan_not_eligible');
  END IF;

  IF _sub.amount_cents < _offer.min_subtotal_cents THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'below_minimum');
  END IF;

  SELECT count(*) INTO _user_used FROM public.offer_redemptions
    WHERE offer_id = _offer.id AND user_id = _uid;
  IF _user_used >= _offer.per_user_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'per_user_limit');
  END IF;

  -- Compute raw discount
  IF _offer.discount_type = 'percent' THEN
    _raw_discount := (_sub.amount_cents * _offer.discount_value) / 100;
  ELSE
    _raw_discount := _offer.discount_value;
  END IF;

  -- Stack rule: combined wallet + offer total cannot exceed plan's credit cap
  SELECT COALESCE(max_credit_cents, _sub.amount_cents) INTO _cap FROM public.credit_caps WHERE plan_id = _sub.plan_id;
  _cap := COALESCE(_cap, _sub.amount_cents);

  -- How much wallet/offer already applied to this sub?
  SELECT COALESCE(SUM(applied_cents),0) INTO _already_offer FROM public.offer_redemptions WHERE subscription_id = _subscription_id;
  -- Wallet applied = sum of negative wallet_transactions referencing this sub
  SELECT COALESCE(SUM(-delta_cents),0) INTO _already_wallet
    FROM public.wallet_transactions
    WHERE reference_id = _subscription_id AND reason = 'checkout_redeem';

  _remaining_cap := GREATEST(0, _cap - _already_offer - _already_wallet);
  _apply := LEAST(_raw_discount, _remaining_cap, _sub.amount_cents);

  IF _apply <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cap_reached');
  END IF;

  INSERT INTO public.offer_redemptions(offer_id, user_id, subscription_id, applied_cents)
  VALUES (_offer.id, _uid, _subscription_id, _apply);

  UPDATE public.offers SET current_redemptions = current_redemptions + 1 WHERE id = _offer.id;

  UPDATE public.subscriptions
    SET amount_cents = amount_cents - _apply, updated_at = now()
    WHERE id = _subscription_id;

  RETURN jsonb_build_object('ok', true, 'applied_cents', _apply,
    'new_amount_cents', _sub.amount_cents - _apply,
    'offer_name', _offer.name);
END $$;

-- Slot capacity check
CREATE OR REPLACE FUNCTION public.slot_remaining_capacity(_slot_id uuid, _date date)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.capacity - COALESCE(
    (SELECT count(*) FROM public.meal_redemptions
      WHERE slot_id = _slot_id AND redeemed_on = _date), 0)::int
  FROM public.meal_slots s WHERE s.id = _slot_id;
$$;

-- Serve meal with slot enforcement
CREATE OR REPLACE FUNCTION public.serve_meal_by_pass_with_slot(_pass_code text, _slot_id uuid, _kitchen_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _verdict jsonb;
  _sub_id uuid; _user_id uuid;
  _today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
  _today_iso int := EXTRACT(ISODOW FROM _today)::int;
  _slot public.meal_slots%ROWTYPE;
  _used int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'kitchen') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Forbidden: kitchen or admin only';
  END IF;

  SELECT * INTO _slot FROM public.meal_slots WHERE id = _slot_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'invalid_slot', 'message', 'Slot not found or inactive');
  END IF;
  IF NOT (_today_iso = ANY(_slot.weekdays)) THEN
    RETURN jsonb_build_object('ok', false, 'status', 'slot_unavailable', 'message', 'Slot not active today');
  END IF;

  SELECT count(*) INTO _used FROM public.meal_redemptions WHERE slot_id = _slot_id AND redeemed_on = _today;
  IF _used >= _slot.capacity THEN
    RETURN jsonb_build_object('ok', false, 'status', 'slot_full',
      'message', 'Slot at capacity (' || _slot.capacity || ')');
  END IF;

  _verdict := public.verify_pass(_pass_code);
  IF (_verdict->>'ok')::boolean IS NOT TRUE THEN RETURN _verdict; END IF;

  _sub_id := (_verdict->>'subscription_id')::uuid;
  _user_id := (_verdict->>'user_id')::uuid;

  BEGIN
    INSERT INTO public.meal_redemptions (user_id, subscription_id, redeemed_by, slot_id)
    VALUES (_user_id, _sub_id, COALESCE(_kitchen_user_id, auth.uid()), _slot_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_set(jsonb_set(_verdict,'{ok}','false'::jsonb),'{status}','"already_served"'::jsonb)
      || jsonb_build_object('message','Already served today');
  END;

  RETURN _verdict || jsonb_build_object('message','Meal recorded','slot_label',_slot.label);
END $$;

-- Broadcasts: list with read state
CREATE OR REPLACE FUNCTION public.list_my_broadcasts()
RETURNS TABLE(id uuid, title text, body text, created_at timestamptz, is_read boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.title, b.body, b.created_at,
    EXISTS(SELECT 1 FROM public.broadcast_reads r WHERE r.user_id = auth.uid() AND r.broadcast_id = b.id) AS is_read
  FROM public.broadcasts b
  WHERE b.target = 'all'
     OR (b.target = 'tier' AND b.target_tier = (SELECT tier FROM public.profiles WHERE user_id = auth.uid()))
  ORDER BY b.created_at DESC
  LIMIT 50;
$$;

-- Analytics summary
CREATE OR REPLACE FUNCTION public.admin_analytics_summary(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _from date := (now() AT TIME ZONE 'Africa/Johannesburg')::date - _days;
  _redemptions_by_day jsonb;
  _revenue_by_day jsonb;
  _tier_dist jsonb;
  _funnel jsonb;
  _top_offers jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'count', c) ORDER BY d), '[]'::jsonb)
  INTO _redemptions_by_day
  FROM (
    SELECT redeemed_on AS d, count(*)::int AS c
    FROM public.meal_redemptions
    WHERE redeemed_on >= _from
    GROUP BY redeemed_on
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'cents', c) ORDER BY d), '[]'::jsonb)
  INTO _revenue_by_day
  FROM (
    SELECT (activated_at AT TIME ZONE 'Africa/Johannesburg')::date AS d, SUM(amount_cents)::bigint AS c
    FROM public.subscriptions
    WHERE status = 'active' AND activated_at >= (_from::timestamp)
    GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('tier', tier, 'count', c)), '[]'::jsonb)
  INTO _tier_dist
  FROM (SELECT tier, count(*)::int c FROM public.profiles GROUP BY tier) x;

  SELECT jsonb_build_object(
    'codes_generated', (SELECT count(*) FROM public.referral_codes),
    'links_redeemed', (SELECT count(*) FROM public.referrals),
    'signed_up', (SELECT count(*) FROM public.referrals WHERE status IN ('signed_up','paid','rewarded')),
    'paid', (SELECT count(*) FROM public.referrals WHERE status = 'rewarded')
  ) INTO _funnel;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top_offers FROM (
    SELECT o.code, o.name, o.current_redemptions,
      COALESCE(SUM(orx.applied_cents),0)::bigint AS total_discount_cents
    FROM public.offers o
    LEFT JOIN public.offer_redemptions orx ON orx.offer_id = o.id
    GROUP BY o.id ORDER BY o.current_redemptions DESC LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'redemptions_by_day', _redemptions_by_day,
    'revenue_by_day', _revenue_by_day,
    'tier_distribution', _tier_dist,
    'referral_funnel', _funnel,
    'top_offers', _top_offers
  );
END $$;
