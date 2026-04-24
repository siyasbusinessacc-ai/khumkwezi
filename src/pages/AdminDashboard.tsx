import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

type Stats = {
  meals_today: number;
  meals_week: number;
  active_subscriptions: number;
  pending_subscriptions: number;
  total_students: number;
  month_revenue_cents: number;
};

type AdminUser = {
  user_id: string;
  name: string | null;
  surname: string | null;
  email: string | null;
  student_number: string | null;
  roles: AppRole[];
  active_subscription_id: string | null;
  active_plan_name: string | null;
  active_end_date: string | null;
};

type MealPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  allowed_weekdays: number[];
  duration_days: number;
  is_active: boolean;
};

type Redemption = {
  id: string;
  user_id: string;
  name: string | null;
  surname: string | null;
  student_number: string | null;
  redeemed_at: string;
  redeemed_on: string;
  served_by_name: string | null;
};

const WEEKDAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

const formatRand = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// =====================================================
// Overview
// =====================================================
const Overview = ({ stats, refresh }: { stats: Stats | null; refresh: () => void }) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
    {[
      { label: "Meals served today", value: stats?.meals_today ?? "—" },
      { label: "Meals this week", value: stats?.meals_week ?? "—" },
      { label: "Active subscriptions", value: stats?.active_subscriptions ?? "—" },
      { label: "Pending subscriptions", value: stats?.pending_subscriptions ?? "—" },
      { label: "Total students", value: stats?.total_students ?? "—" },
      { label: "Revenue this month", value: stats ? formatRand(stats.month_revenue_cents) : "—" },
    ].map((s) => (
      <div
        key={s.label}
        className="bg-card rounded-2xl p-5 ring-1 ring-border shadow-[0_0_40px_-20px_hsl(var(--amber-glow)/0.2)]"
      >
        <p className="text-toast text-xs uppercase tracking-wide">{s.label}</p>
        <p className="font-serif text-3xl text-foreground mt-2 tabular-nums">{s.value}</p>
      </div>
    ))}
    <div className="col-span-2 lg:col-span-3">
      <Button variant="secondary" onClick={refresh} className="w-full sm:w-auto">
        Refresh stats
      </Button>
    </div>
  </div>
);

// =====================================================
// Users / Roles tab
// =====================================================
const UsersTab = ({ plans, refreshStats }: { plans: MealPlan[]; refreshStats: () => void }) => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_users", {
      _search: search || null,
      _limit: 50,
    });
    if (error) toast({ title: "Could not load users", description: error.message, variant: "destructive" });
    setUsers((data as AdminUser[]) ?? []);
    setLoading(false);
  }, [search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const grant = async (uid: string, role: AppRole) => {
    const { error } = await supabase.rpc("admin_grant_role", { _target_user: uid, _role: role });
    if (error) return toast({ title: "Grant failed", description: error.message, variant: "destructive" });
    toast({ title: `Granted ${role}` });
    load();
  };

  const revoke = async (uid: string, role: AppRole) => {
    const { data, error } = await supabase.rpc("admin_revoke_role", { _target_user: uid, _role: role });
    if (error) return toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
    const res = data as { ok: boolean; reason?: string };
    if (!res.ok && res.reason === "last_admin") {
      return toast({ title: "Cannot remove last admin", variant: "destructive" });
    }
    toast({ title: `Revoked ${role}` });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search by name, email, student number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <Button onClick={load} disabled={loading}>
          {loading ? "…" : "Search"}
        </Button>
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.user_id} className="bg-card rounded-2xl p-5 ring-1 ring-border">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-serif text-lg text-foreground truncate">
                  {u.name ?? "—"} {u.surname ?? ""}
                </h3>
                <p className="text-toast text-sm truncate">{u.email}</p>
                {u.student_number && (
                  <p className="text-toast text-xs mt-0.5">#{u.student_number}</p>
                )}
                {u.active_plan_name && (
                  <p className="text-brass text-xs mt-2">
                    Active: {u.active_plan_name} → {u.active_end_date}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {(["admin", "kitchen", "student"] as AppRole[]).map((r) => {
                  const has = u.roles.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => (has ? revoke(u.user_id, r) : grant(u.user_id, r))}
                      className={`text-xs px-3 py-1 rounded-full ring-1 transition-colors ${
                        has
                          ? "bg-primary/20 text-brass ring-primary/40"
                          : "bg-secondary text-toast ring-border hover:text-foreground"
                      }`}
                    >
                      {has ? `✓ ${r}` : `+ ${r}`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActivateSubscriptionDialog
                user={u}
                plans={plans}
                onDone={() => {
                  load();
                  refreshStats();
                }}
              />
              {u.active_subscription_id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Cancel this active subscription?")) return;
                    const { error } = await supabase.rpc("admin_cancel_subscription", {
                      _subscription_id: u.active_subscription_id!,
                    });
                    if (error)
                      return toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
                    toast({ title: "Subscription cancelled" });
                    load();
                    refreshStats();
                  }}
                >
                  Cancel active
                </Button>
              )}
            </div>
          </div>
        ))}
        {!loading && users.length === 0 && (
          <p className="text-toast text-center py-12">No users found.</p>
        )}
      </div>
    </div>
  );
};

// =====================================================
// Activate subscription dialog
// =====================================================
const ActivateSubscriptionDialog = ({
  user,
  plans,
  onDone,
}: {
  user: AdminUser;
  plans: MealPlan[];
  onDone: () => void;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!planId) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_activate_subscription", {
      _target_user: user.user_id,
      _plan_id: planId,
      _start_date: startDate || null,
      _end_date: null,
    });
    setBusy(false);
    if (error) return toast({ title: "Activation failed", description: error.message, variant: "destructive" });
    toast({ title: "Subscription activated" });
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Activate subscription</Button>
      </DialogTrigger>
      <DialogContent className="bg-card ring-1 ring-border">
        <DialogHeader>
          <DialogTitle className="font-serif">
            Activate for {user.name ?? user.email}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatRand(p.price_cents)} / {p.duration_days}d
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start date (optional)</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <p className="text-toast text-xs">Defaults to today. End date = start + plan duration.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !planId}>
            {busy ? "…" : "Activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =====================================================
// Plans tab
// =====================================================
const PlansTab = ({ plans, reload }: { plans: MealPlan[]; reload: () => void }) => {
  const { toast } = useToast();

  const togglePlan = async (p: MealPlan) => {
    const { error } = await supabase.from("meal_plans").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    reload();
  };

  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <div key={p.id} className="bg-card rounded-2xl p-5 ring-1 ring-border">
          <div className="flex justify-between items-start gap-3 flex-wrap">
            <div>
              <h3 className="font-serif text-lg text-foreground">{p.name}</h3>
              <p className="text-toast text-sm">{p.description}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-secondary text-brass ring-1 ring-primary/30">
                  {formatRand(p.price_cents)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-secondary text-toast ring-1 ring-border">
                  {p.duration_days} days
                </span>
                {WEEKDAYS.filter((w) => p.allowed_weekdays.includes(w.n)).map((w) => (
                  <span
                    key={w.n}
                    className="px-2 py-0.5 rounded-full bg-secondary text-foreground ring-1 ring-border"
                  >
                    {w.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-toast text-xs">Active</Label>
              <Switch checked={p.is_active} onCheckedChange={() => togglePlan(p)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// =====================================================
// Redemptions tab
// =====================================================
const RedemptionsTab = ({ refreshStats }: { refreshStats: () => void }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_recent_redemptions", { _limit: 100 });
    if (error) toast({ title: "Load failed", description: error.message, variant: "destructive" });
    setItems((data as Redemption[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this redemption? The student will be eligible to claim again today.")) return;
    const { error } = await supabase.from("meal_redemptions").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Redemption removed" });
    load();
    refreshStats();
  };

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
        {loading ? "…" : "Refresh"}
      </Button>
      <div className="bg-card rounded-2xl ring-1 ring-border divide-y divide-border overflow-hidden">
        {items.map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-foreground truncate">
                {r.name ?? "—"} {r.surname ?? ""}
                {r.student_number && (
                  <span className="text-toast text-xs ml-2">#{r.student_number}</span>
                )}
              </p>
              <p className="text-toast text-xs">
                {new Date(r.redeemed_at).toLocaleString("en-ZA")} • by {r.served_by_name ?? "—"}
              </p>
            </div>
            <button
              onClick={() => remove(r.id)}
              className="text-xs text-destructive-foreground bg-destructive/20 px-3 py-1.5 rounded-full ring-1 ring-destructive/40 hover:bg-destructive/30"
            >
              Remove
            </button>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <p className="text-toast text-center py-12">No redemptions yet.</p>
        )}
      </div>
    </div>
  );
};

// =====================================================
// Main
// =====================================================
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [claiming, setClaiming] = useState(false);

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_dashboard_stats");
    if (error) return;
    setStats(data as Stats);
  }, []);

  const loadPlans = useCallback(async () => {
    const { data } = await supabase.from("meal_plans").select("*").order("price_cents", { ascending: false });
    setPlans((data as MealPlan[]) ?? []);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadStats();
      loadPlans();
    }
  }, [isAdmin, loadStats, loadPlans]);

  const claimAdmin = async () => {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_first_admin");
    setClaiming(false);
    if (error) return toast({ title: "Could not claim", description: error.message, variant: "destructive" });
    const res = data as { ok: boolean; reason?: string };
    if (res.ok) {
      toast({ title: "You're now admin. Reloading…" });
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast({
        title: "Admin already exists",
        description: "Ask an existing admin to grant you the role.",
        variant: "destructive",
      });
    }
  };

  if (rolesLoading) {
    return <div className="min-h-dvh bg-background flex items-center justify-center text-toast">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo size={64} />
        <h1 className="font-serif text-2xl text-foreground">Admin access only</h1>
        <p className="text-toast max-w-md">
          If you're the first user setting up Khumkhwez, you can claim the admin role now. Otherwise ask an existing
          admin.
        </p>
        <div className="flex gap-2">
          <Button onClick={claimAdmin} disabled={claiming}>
            {claiming ? "…" : "Claim first admin"}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="px-5 pt-8 pb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <div>
            <p className="text-toast text-xs font-medium tracking-wide uppercase">Admin</p>
            <h1 className="font-serif text-2xl text-foreground leading-tight">Khumkhwez Console</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/kitchen")}>
            Kitchen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate("/auth"))}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="px-5 mt-2">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Overview stats={stats} refresh={loadStats} />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab plans={plans} refreshStats={loadStats} />
          </TabsContent>
          <TabsContent value="plans">
            <PlansTab plans={plans} reload={loadPlans} />
          </TabsContent>
          <TabsContent value="redemptions">
            <RedemptionsTab refreshStats={loadStats} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
