-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'kitchen', 'student');
CREATE TYPE public.subscription_status AS ENUM ('pending', 'active', 'expired', 'failed', 'cancelled');

-- ============ MEAL PLANS ============
CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  -- ISO weekdays the plan covers: 1=Mon ... 7=Sun
  allowed_weekdays SMALLINT[] NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans are viewable by authenticated users"
  ON public.meal_plans FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.meal_plans (code, name, description, price_cents, allowed_weekdays, duration_days) VALUES
  ('full_week', 'Full Week', 'One meal per day, Monday through Sunday.', 100000, ARRAY[1,2,3,4,5,6,7]::SMALLINT[], 30),
  ('weekday',   'Weekday',   'One meal per day, Monday through Friday.', 70000,  ARRAY[1,2,3,4,5]::SMALLINT[],   30),
  ('weekend',   'Weekend',   'One meal per day, Friday through Sunday.', 35000,  ARRAY[5,6,7]::SMALLINT[],       30);

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  yoco_checkout_id TEXT UNIQUE,
  yoco_payment_id TEXT,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
-- Enforce: only one active subscription per user
CREATE UNIQUE INDEX uniq_active_subscription_per_user
  ON public.subscriptions(user_id) WHERE status = 'active';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pending subscriptions"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Note: no UPDATE policy for end users. Activation/expiration handled by the
-- webhook edge function using the service role (bypasses RLS).

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ MEAL REDEMPTIONS ============
CREATE TABLE public.meal_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  redeemed_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Johannesburg')::date,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_by UUID,
  UNIQUE (subscription_id, redeemed_on)
);

CREATE INDEX idx_redemptions_user ON public.meal_redemptions(user_id);
CREATE INDEX idx_redemptions_date ON public.meal_redemptions(redeemed_on);

ALTER TABLE public.meal_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own redemptions"
  ON public.meal_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Kitchen and admins can view all redemptions"
  ON public.meal_redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'kitchen') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Kitchen and admins can record redemptions"
  ON public.meal_redemptions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'kitchen') OR public.has_role(auth.uid(), 'admin'));