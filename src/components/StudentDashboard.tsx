import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import type { Tables } from "@/integrations/supabase/types";
import menuRibeye from "@/assets/menu-ribeye.jpg";
import menuArancini from "@/assets/menu-arancini.jpg";
import shishaPairing from "@/assets/shisha-pairing.jpg";

type Profile = Tables<"profiles">;
type MealPlan = Tables<"meal_plans">;

type ActiveSub = {
  id: string;
  status: string;
  end_date: string | null;
  start_date: string | null;
  plan: {
    name: string;
    code: string;
    allowed_weekdays: number[];
    duration_days: number;
    price_cents: number;
  } | null;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const formatRand = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const isoWeekdayToday = () => ((new Date().getDay() + 6) % 7) + 1; // 1=Mon..7=Sun

const daysBetween = (end: string) => {
  const e = new Date(end + "T00:00:00");
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((e.getTime() - t.getTime()) / 86400000));
};

// =====================================================
// Active pass card — shows real subscription + QR
// =====================================================
const ActivePassCard = ({
  userId,
  sub,
  redeemedToday,
}: {
  userId: string;
  sub: ActiveSub;
  redeemedToday: boolean;
}) => {
  const today = isoWeekdayToday();
  const planCoversToday = sub.plan?.allowed_weekdays.includes(today) ?? false;
  const daysLeft = sub.end_date ? daysBetween(sub.end_date) : null;

  const status = redeemedToday
    ? { label: "Served Today", tone: "served" }
    : planCoversToday
      ? { label: "Eligible Today", tone: "eligible" }
      : { label: "Plan Off Today", tone: "off" };

  return (
    <div className="bg-card rounded-3xl p-6 sm:p-8 ring-1 ring-border shadow-[0_0_60px_-15px_hsl(var(--amber-glow)/0.15)] relative overflow-hidden">
      <div className="absolute -top-24 -right-24 size-64 bg-amber-dim rounded-full blur-[80px] opacity-30 animate-pulse-glow" />
      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex justify-between items-start gap-3">
          <div>
            <p className="text-toast text-sm font-medium mb-1">Your Plan</p>
            <h2 className="font-serif text-3xl text-foreground leading-tight">
              {sub.plan?.name ?? "Active"}
            </h2>
            {daysLeft !== null && (
              <p className="text-toast text-sm mt-1">
                {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining
              </p>
            )}
          </div>
          <div
            className={`px-3 py-1 rounded-full ring-1 text-xs font-medium uppercase tracking-wide ${
              status.tone === "eligible"
                ? "bg-secondary text-brass ring-primary/40"
                : status.tone === "served"
                  ? "bg-destructive/20 text-destructive-foreground ring-destructive/40"
                  : "bg-secondary text-toast ring-border"
            }`}
          >
            {status.label}
          </div>
        </div>

        {/* Plan day badges */}
        {sub.plan && (
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((d, i) => {
              const active = sub.plan!.allowed_weekdays.includes(i + 1);
              const isToday = i + 1 === today;
              return (
                <span
                  key={d}
                  className={`px-2.5 py-1 rounded-full text-xs ring-1 transition-colors ${
                    active
                      ? isToday
                        ? "bg-primary text-primary-foreground ring-primary"
                        : "bg-secondary text-foreground ring-border"
                      : "bg-background text-toast/50 ring-border"
                  }`}
                >
                  {d}
                </span>
              );
            })}
          </div>
        )}

        {/* QR Code */}
        <div className="bg-background rounded-2xl p-6 ring-1 ring-border flex flex-col items-center justify-center gap-4">
          <div className="bg-parchment p-3 rounded-xl">
            <QRCodeSVG value={userId} size={160} bgColor="#F5EBD9" fgColor="#0a0807" level="M" />
          </div>
          <p className="text-toast text-sm text-center max-w-[26ch]">
            {redeemedToday
              ? "You've already claimed today's meal. See you tomorrow!"
              : planCoversToday
                ? "Show this code at the kitchen to claim today's meal"
                : "Your plan doesn't cover today. Come back on a covered day."}
          </p>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// Pending pass — payment in progress / awaiting activation
// =====================================================
const PendingPassCard = ({ planName }: { planName: string }) => (
  <div className="bg-card rounded-3xl p-6 sm:p-8 ring-1 ring-border text-center">
    <p className="text-toast text-xs font-medium uppercase tracking-wide mb-2">Awaiting Activation</p>
    <h2 className="font-serif text-2xl text-foreground">{planName}</h2>
    <p className="text-toast text-sm mt-3 max-w-md mx-auto">
      Your subscription is pending. Once payment clears (or an admin confirms a cash payment), your meal pass will
      activate automatically.
    </p>
  </div>
);

// =====================================================
// Plan selector — payment-ready stub
// =====================================================
const PlanSelector = ({
  plans,
  userId,
  onCreated,
}: {
  plans: MealPlan[];
  userId: string;
  onCreated: () => void;
}) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const choosePlan = async (plan: MealPlan) => {
    setBusy(plan.id);
    try {
      // Create a pending subscription. Once Yoco is wired in, this row will be
      // updated to "active" by the payment webhook; for now an admin can also
      // activate it manually from the Admin → Users tab.
      const { error } = await supabase.from("subscriptions").insert({
        user_id: userId,
        plan_id: plan.id,
        amount_cents: plan.price_cents,
        status: "pending",
      });
      if (error) throw error;
      toast({
        title: "Plan reserved",
        description: "Pay at the counter or wait for online payment to be enabled. Admin can activate manually.",
      });
      onCreated();
    } catch (e: any) {
      toast({ title: "Could not reserve plan", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-2xl text-foreground">Choose Your Plan</h2>
        <p className="text-toast text-sm mt-1">All plans run for 30 days from activation.</p>
      </div>
      <div className="grid gap-3">
        {plans
          .filter((p) => p.is_active)
          .map((plan) => {
            const isBest = plan.code === "full_week";
            return (
              <div
                key={plan.id}
                className={`bg-card rounded-2xl p-5 ring-1 ${
                  isBest ? "ring-primary/40 shadow-[0_0_40px_-15px_hsl(var(--amber-glow)/0.3)]" : "ring-border"
                }`}
              >
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-xl text-foreground">{plan.name}</h3>
                      {isBest && (
                        <span className="text-[10px] uppercase tracking-wider text-brass bg-secondary px-2 py-0.5 rounded-full ring-1 ring-primary/40">
                          Best Value
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-toast text-sm mt-1">{plan.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-serif text-2xl text-brass tabular-nums">{formatRand(plan.price_cents)}</p>
                    <p className="text-toast text-xs">/ {plan.duration_days} days</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {WEEKDAY_LABELS.map((d, i) => {
                    const on = plan.allowed_weekdays.includes(i + 1);
                    return (
                      <span
                        key={d}
                        className={`px-2 py-0.5 rounded-full text-xs ring-1 ${
                          on
                            ? "bg-secondary text-foreground ring-border"
                            : "bg-background text-toast/40 ring-border"
                        }`}
                      >
                        {d}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={() => choosePlan(plan)}
                  disabled={busy !== null}
                  className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {busy === plan.id ? "Reserving…" : "Choose this plan"}
                </button>
              </div>
            );
          })}
      </div>
      <p className="text-toast text-xs text-center px-4">
        Online card payments coming soon. Reserve a plan now and pay in person, or have an admin activate it.
      </p>
    </div>
  );
};

// =====================================================
// Menu preview (kept — visual only)
// =====================================================
const menuItems = [
  {
    name: "Suya-Spiced Ribeye",
    desc: "Charred over open coals, with smoked plantain puree and wild rocket.",
    image: menuRibeye,
    tag: "Main",
  },
  {
    name: "Jollof Arancini",
    desc: "Crispy rice spheres with braised ox-tail and spicy tomato emulsion.",
    image: menuArancini,
    tag: "Starter",
  },
];

const MenuPreview = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-baseline justify-between">
      <h2 className="font-serif text-xl text-foreground">Tonight's Offerings</h2>
      <span className="text-toast text-xs uppercase tracking-wide">Sample menu</span>
    </div>
    <div className="flex flex-col gap-3">
      {menuItems.map((item) => (
        <div
          key={item.name}
          className="group flex gap-4 items-center bg-card/50 hover:bg-card p-3 rounded-2xl transition-colors ring-1 ring-transparent hover:ring-border"
        >
          <div className="size-20 shrink-0 bg-secondary rounded-xl overflow-hidden ring-1 ring-border">
            <img
              src={item.image}
              loading="lazy"
              width={640}
              height={640}
              className="w-full h-full object-cover opacity-80 mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-500"
              alt={item.name}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-foreground font-medium truncate">{item.name}</h3>
            <p className="text-toast text-sm mt-1 line-clamp-2 leading-relaxed">{item.desc}</p>
          </div>
        </div>
      ))}
      <div className="group flex gap-4 items-center bg-card/50 hover:bg-card p-3 rounded-2xl transition-colors ring-1 ring-transparent hover:ring-border mt-1">
        <div className="size-20 shrink-0 rounded-xl overflow-hidden ring-1 ring-primary/20">
          <img
            src={shishaPairing}
            loading="lazy"
            width={640}
            height={640}
            className="w-full h-full object-cover opacity-80 mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-500"
            alt="Shisha pairing"
          />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-primary tracking-wide uppercase px-2 py-0.5 rounded-sm bg-accent/30">
            Pairing
          </span>
          <h3 className="text-foreground font-medium mt-1 truncate">Cardamom & Honey</h3>
          <p className="text-toast text-sm truncate">Slow-burning dark leaf blend.</p>
        </div>
      </div>
    </div>
  </div>
);

// =====================================================
// Bottom nav
// =====================================================
const BottomNav = ({ isKitchen, isAdmin }: { isKitchen: boolean; isAdmin: boolean }) => {
  const navigate = useNavigate();
  const items = [
    { label: "Pass", path: "/", active: true },
    { label: "Refer", path: "/refer", active: false },
    ...(isKitchen ? [{ label: "Kitchen", path: "/kitchen", active: false }] : []),
    ...(isAdmin ? [{ label: "Admin", path: "/admin", active: false }] : []),
    { label: "Profile", path: "/profile", active: false },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 w-full bg-card/95 backdrop-blur-lg border-t border-border z-50"
      style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => navigate(item.path)}
          className={`py-4 flex flex-col items-center gap-1 text-sm font-semibold transition-colors ${
            item.active ? "text-primary" : "text-toast hover:text-foreground"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
};

// =====================================================
// Main
// =====================================================
const StudentDashboard = () => {
  const { user } = useAuth();
  const { isKitchen, isAdmin } = useUserRoles();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeSub, setActiveSub] = useState<ActiveSub | null>(null);
  const [pendingPlanName, setPendingPlanName] = useState<string | null>(null);
  const [redeemedToday, setRedeemedToday] = useState(false);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [loadingSub, setLoadingSub] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoadingSub(true);

    const [{ data: prof }, { data: subs }, { data: planRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("id, status, end_date, start_date, meal_plans(name, code, allowed_weekdays, duration_days, price_cents)")
        .eq("user_id", user.id)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false }),
      supabase.from("meal_plans").select("*").eq("is_active", true).order("price_cents"),
    ]);

    if (prof) setProfile(prof as Profile);
    setPlans((planRows as MealPlan[]) ?? []);

    const subList = (subs as any[]) ?? [];
    const active = subList.find((s) => s.status === "active");
    const pending = subList.find((s) => s.status === "pending");

    if (active) {
      setActiveSub({
        id: active.id,
        status: active.status,
        end_date: active.end_date,
        start_date: active.start_date,
        plan: active.meal_plans
          ? {
              name: active.meal_plans.name,
              code: active.meal_plans.code,
              allowed_weekdays: active.meal_plans.allowed_weekdays,
              duration_days: active.meal_plans.duration_days,
              price_cents: active.meal_plans.price_cents,
            }
          : null,
      });

      const today = new Date().toISOString().slice(0, 10);
      const { data: red } = await supabase
        .from("meal_redemptions")
        .select("id")
        .eq("subscription_id", active.id)
        .eq("redeemed_on", today)
        .maybeSingle();
      setRedeemedToday(!!red);
    } else {
      setActiveSub(null);
      setRedeemedToday(false);
    }

    setPendingPlanName(pending?.meal_plans?.name ?? null);
    setLoadingSub(false);
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const initials = profile
    ? `${(profile.name?.[0] || "").toUpperCase()}${(profile.surname?.[0] || "").toUpperCase()}` || "?"
    : "?";

  const greeting =
    new Date().getHours() < 12 ? "Good Morning" : new Date().getHours() < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="px-5 pt-8 pb-4 flex flex-col items-center gap-4">
        <Logo size={120} />
        <div className="text-center">
          <p className="text-toast text-sm font-medium tracking-wide uppercase mb-1">
            {greeting}
            {profile?.name ? `, ${profile.name}` : ""}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-foreground leading-tight">
            Khumkhwez Now
          </h1>
        </div>
        {/* Hidden initials for accessibility / tests */}
        <span className="sr-only" data-testid="user-initials">{initials}</span>
      </header>

      <main className="px-5 flex flex-col gap-8 mt-2">
        {loadingSub ? (
          <div className="bg-card rounded-3xl p-8 ring-1 ring-border text-center">
            <p className="text-toast text-sm">Loading your pass…</p>
          </div>
        ) : activeSub ? (
          <ActivePassCard userId={user!.id} sub={activeSub} redeemedToday={redeemedToday} />
        ) : pendingPlanName ? (
          <>
            <PendingPassCard planName={pendingPlanName} />
            <PlanSelector plans={plans} userId={user!.id} onCreated={loadAll} />
          </>
        ) : (
          <PlanSelector plans={plans} userId={user!.id} onCreated={loadAll} />
        )}
        <MenuPreview />
      </main>

      <BottomNav isKitchen={isKitchen} isAdmin={isAdmin} />
    </div>
  );
};

export default StudentDashboard;
