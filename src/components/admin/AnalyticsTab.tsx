import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Summary = {
  redemptions_by_day: { day: string; count: number }[];
  revenue_by_day: { day: string; cents: number }[];
  tier_distribution: { tier: string; count: number }[];
  referral_funnel: { codes_generated: number; links_redeemed: number; signed_up: number; paid: number };
  top_offers: { code: string; name: string; current_redemptions: number; total_discount_cents: number }[];
};

const TIER_COLORS: Record<string, string> = { bronze: "#a16207", silver: "#94a3b8", gold: "#eab308", elite: "#d97706" };

export const AnalyticsTab = () => {
  const { toast } = useToast();
  const [data, setData] = useState<Summary | null>(null);
  const [days, setDays] = useState(30);

  const load = async () => {
    const { data, error } = await supabase.rpc("admin_analytics_summary", { _days: days });
    if (error) return toast({ title: "Load failed", description: error.message, variant: "destructive" });
    setData(data as Summary);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  if (!data) return <p className="text-toast text-center py-12">Loading analytics…</p>;

  const f = data.referral_funnel;
  const revenueData = data.revenue_by_day.map(r => ({ day: r.day.slice(5), rand: r.cents / 100 }));
  const redemptionData = data.redemptions_by_day.map(r => ({ day: r.day.slice(5), meals: r.count }));

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[7, 30, 90].map(n => (
          <button key={n} onClick={() => setDays(n)}
            className={`text-xs px-3 py-1 rounded-full ring-1 ${days === n ? "bg-primary/20 text-brass ring-primary/40" : "bg-secondary text-toast ring-border"}`}>
            {n}d
          </button>
        ))}
      </div>

      <div className="bg-card rounded-2xl p-4 ring-1 ring-border">
        <h3 className="font-serif text-lg text-foreground mb-3">Meals served</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={redemptionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" stroke="hsl(var(--toast))" fontSize={11} />
            <YAxis stroke="hsl(var(--toast))" fontSize={11} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Line type="monotone" dataKey="meals" stroke="hsl(var(--primary))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-2xl p-4 ring-1 ring-border">
        <h3 className="font-serif text-lg text-foreground mb-3">Revenue (R)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revenueData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" stroke="hsl(var(--toast))" fontSize={11} />
            <YAxis stroke="hsl(var(--toast))" fontSize={11} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Bar dataKey="rand" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl p-4 ring-1 ring-border">
          <h3 className="font-serif text-lg text-foreground mb-3">Tier distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.tier_distribution} dataKey="count" nameKey="tier" cx="50%" cy="50%" outerRadius={80} label>
                {data.tier_distribution.map((e, i) => <Cell key={i} fill={TIER_COLORS[e.tier] || "#888"} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-2xl p-4 ring-1 ring-border">
          <h3 className="font-serif text-lg text-foreground mb-3">Referral funnel</h3>
          <div className="space-y-2 text-sm">
            <Row label="Codes generated" value={f.codes_generated} />
            <Row label="Links redeemed" value={f.links_redeemed} />
            <Row label="Signed up" value={f.signed_up} />
            <Row label="Paid (rewarded)" value={f.paid} highlight />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl p-4 ring-1 ring-border">
        <h3 className="font-serif text-lg text-foreground mb-3">Top offers</h3>
        {data.top_offers.length === 0 ? (
          <p className="text-toast text-sm">No offers used yet.</p>
        ) : (
          <div className="space-y-2">
            {data.top_offers.map(o => (
              <div key={o.code} className="flex justify-between text-sm">
                <span className="text-foreground"><span className="font-mono text-brass">{o.code}</span> {o.name}</span>
                <span className="text-toast">{o.current_redemptions} uses · R{(o.total_discount_cents / 100).toFixed(0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Row = ({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) => (
  <div className="flex justify-between">
    <span className="text-toast">{label}</span>
    <span className={highlight ? "text-brass font-serif text-lg" : "text-foreground font-medium"}>{value}</span>
  </div>
);
