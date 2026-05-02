
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.user_tier AS ENUM ('bronze','silver','gold','elite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ PROFILES: tier + wallet ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier public.user_tier NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS discount_wallet_balance_cents integer NOT NULL DEFAULT 0;

-- ============ REFERRALS: enrich ============
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS signed_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS rewarded_at timestamptz;

-- Backfill signed_up_at for any existing rows (they exist => referred user signed up)
UPDATE public.referrals SET signed_up_at = COALESCE(signed_up_at, created_at) WHERE signed_up_at IS NULL;

-- ============ WALLET TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  reason text NOT NULL, -- 'referral_reward' | 'checkout_redeem' | 'admin_adjust' | 'expiry'
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own wallet tx" ON public.wallet_transactions;
CREATE POLICY "Users view own wallet tx"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============ TIER CONFIG (admin-editable thresholds, by paid-referral count) ============
CREATE TABLE IF NOT EXISTS public.tier_config (
  tier public.user_tier PRIMARY KEY,
  min_paid_referrals integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.tier_config (tier, min_paid_referrals) VALUES
  ('bronze', 0), ('silver', 3), ('gold', 7), ('elite', 15)
ON CONFLICT (tier) DO NOTHING;

ALTER TABLE public.tier_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tier config readable" ON public.tier_config;
CREATE POLICY "Tier config readable" ON public.tier_config
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage tier config" ON public.tier_config;
CREATE POLICY "Admins manage tier config" ON public.tier_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ CREDIT CAPS (flat per-plan tier of price) ============
-- Admin sets max wallet credit usable per plan (in cents).
CREATE TABLE IF NOT EXISTS public.credit_caps (
  plan_id uuid PRIMARY KEY,
  max_credit_cents integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sensible default caps from existing meal_plans (R50/R150/R250 buckets by price)
INSERT INTO public.credit_caps (plan_id, max_credit_cents)
SELECT mp.id,
  CASE
    WHEN mp.price_cents <= 35000 THEN 5000   -- ≤R350 → R50
    WHEN mp.price_cents <= 70000 THEN 15000  -- ≤R700 → R150
    ELSE 25000                                -- >R700 → R250
  END
FROM public.meal_plans mp
ON CONFLICT (plan_id) DO NOTHING;

ALTER TABLE public.credit_caps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Caps readable" ON public.credit_caps;
CREATE POLICY "Caps readable" ON public.credit_caps
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage caps" ON public.credit_caps;
CREATE POLICY "Admins manage caps" ON public.credit_caps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ HELPERS ============

-- Reward ladder: 1st paid R10, 2..5 R50 each, 6+ R100 each
CREATE OR REPLACE FUNCTION public.referral_reward_for_count(_count int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _count <= 0 THEN 0
    WHEN _count = 1 THEN 1000
    WHEN _count BETWEEN 2 AND 5 THEN 5000
    ELSE 10000
  END;
$$;

CREATE OR REPLACE FUNCTION public.tier_for_paid_count(_count int)
RETURNS public.user_tier LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT tier FROM public.tier_config
  WHERE min_paid_referrals <= _count
  ORDER BY min_paid_referrals DESC
  LIMIT 1;
$$;

-- Credit wallet (system-only via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.credit_wallet(_user uuid, _delta int, _reason text, _ref uuid DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new int;
BEGIN
  UPDATE public.profiles
    SET discount_wallet_balance_cents = GREATEST(0, discount_wallet_balance_cents + _delta),
        updated_at = now()
    WHERE user_id = _user
    RETURNING discount_wallet_balance_cents INTO _new;

  INSERT INTO public.wallet_transactions(user_id, delta_cents, balance_after_cents, reason, reference_id, notes)
    VALUES (_user, _delta, _new, _reason, _ref, _notes);

  RETURN _new;
END $$;

-- ============ TRIGGER: only on Paid (active) ============
-- Fires when subscription becomes 'active' for the first time.
CREATE OR REPLACE FUNCTION public.handle_subscription_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ref public.referrals%ROWTYPE;
  _paid_count int;
  _reward int;
  _new_tier public.user_tier;
BEGIN
  -- Only act on transition to active
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN RETURN NEW; END IF;

  -- Find pending referral for this user (not yet rewarded)
  SELECT * INTO _ref FROM public.referrals
    WHERE referred_user_id = NEW.user_id
      AND status IN ('pending','signed_up','paid')
      AND rewarded_at IS NULL
    LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Count referrer's already-rewarded referrals (then +1 for this one)
  SELECT count(*) INTO _paid_count FROM public.referrals
    WHERE referrer_user_id = _ref.referrer_user_id AND status = 'rewarded';
  _paid_count := _paid_count + 1;

  _reward := public.referral_reward_for_count(_paid_count);

  -- Mark referral rewarded
  UPDATE public.referrals
    SET status = 'rewarded',
        plan_id = NEW.plan_id,
        subscription_id = NEW.id,
        paid_at = COALESCE(paid_at, now()),
        rewarded_at = now(),
        reward_cents = _reward,
        completed_at = now()
    WHERE id = _ref.id;

  -- Credit referrer wallet
  IF _reward > 0 THEN
    PERFORM public.credit_wallet(_ref.referrer_user_id, _reward, 'referral_reward', _ref.id,
      'Paid referral #' || _paid_count);
  END IF;

  -- Recompute referrer tier
  _new_tier := public.tier_for_paid_count(_paid_count);
  UPDATE public.profiles SET tier = _new_tier, updated_at = now()
    WHERE user_id = _ref.referrer_user_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscription_paid ON public.subscriptions;
CREATE TRIGGER trg_subscription_paid
  AFTER INSERT OR UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_subscription_paid();

-- ============ STUDENT-FACING: wallet summary ============
CREATE OR REPLACE FUNCTION public.get_my_wallet_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal int; _tier public.user_tier; _paid int;
  _next_tier public.user_tier; _next_min int; _cur_min int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT discount_wallet_balance_cents, tier INTO _bal, _tier
    FROM public.profiles WHERE user_id = _uid;
  SELECT count(*) INTO _paid FROM public.referrals
    WHERE referrer_user_id = _uid AND status = 'rewarded';
  SELECT min_paid_referrals INTO _cur_min FROM public.tier_config WHERE tier = _tier;
  SELECT tier, min_paid_referrals INTO _next_tier, _next_min FROM public.tier_config
    WHERE min_paid_referrals > _cur_min ORDER BY min_paid_referrals ASC LIMIT 1;

  RETURN jsonb_build_object(
    'balance_cents', COALESCE(_bal,0),
    'tier', _tier,
    'paid_referrals', _paid,
    'current_tier_min', _cur_min,
    'next_tier', _next_tier,
    'next_tier_min', _next_min
  );
END $$;

-- ============ CHECKOUT: auto-apply max allowed credit ============
CREATE OR REPLACE FUNCTION public.apply_wallet_credit_to_subscription(_subscription_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _cap int; _bal int; _apply int;
BEGIN
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  IF _sub.user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _sub.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending');
  END IF;

  SELECT COALESCE(max_credit_cents,0) INTO _cap FROM public.credit_caps WHERE plan_id = _sub.plan_id;
  SELECT discount_wallet_balance_cents INTO _bal FROM public.profiles WHERE user_id = _sub.user_id;

  _apply := LEAST(COALESCE(_cap,0), COALESCE(_bal,0), _sub.amount_cents);
  IF _apply <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'applied_cents', 0, 'new_amount_cents', _sub.amount_cents);
  END IF;

  UPDATE public.subscriptions
    SET amount_cents = amount_cents - _apply, updated_at = now()
    WHERE id = _subscription_id;

  PERFORM public.credit_wallet(_sub.user_id, -_apply, 'checkout_redeem', _subscription_id,
    'Applied at checkout');

  RETURN jsonb_build_object('ok', true, 'applied_cents', _apply,
    'new_amount_cents', _sub.amount_cents - _apply);
END $$;

-- ============ ADMIN: referral tree ============
CREATE OR REPLACE FUNCTION public.admin_referral_tree(_limit int DEFAULT 200)
RETURNS TABLE(
  referrer_user_id uuid, referrer_name text, referrer_surname text, referrer_email text,
  referrer_tier public.user_tier, referrer_wallet_cents int,
  paid_referrals bigint, pending_referrals bigint, total_reward_cents bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.user_id, p.name, p.surname, p.email, p.tier, p.discount_wallet_balance_cents,
    COUNT(r.*) FILTER (WHERE r.status = 'rewarded'),
    COUNT(r.*) FILTER (WHERE r.status IN ('pending','signed_up')),
    COALESCE(SUM(r.reward_cents) FILTER (WHERE r.status = 'rewarded'), 0)
  FROM public.profiles p
  LEFT JOIN public.referrals r ON r.referrer_user_id = p.user_id
  WHERE public.has_role(auth.uid(),'admin')
  GROUP BY p.user_id, p.name, p.surname, p.email, p.tier, p.discount_wallet_balance_cents
  HAVING COUNT(r.*) > 0
  ORDER BY COUNT(r.*) FILTER (WHERE r.status = 'rewarded') DESC
  LIMIT _limit;
$$;

-- Lock down direct execution to authenticated only (no anon)
REVOKE EXECUTE ON FUNCTION public.credit_wallet(uuid,int,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_subscription_paid() FROM PUBLIC, anon;
