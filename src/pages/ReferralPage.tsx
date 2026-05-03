import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import { Sidebar } from "@/components/Sidebar";

type ReferralRow = {
  id: string;
  status: string;
  reward_cents: number;
  created_at: string;
  completed_at: string | null;
  referred_user_id: string;
};

type WalletSummary = {
  balance_cents: number;
  tier: "bronze" | "silver" | "gold" | "elite";
  paid_referrals: number;
  current_tier_min: number;
  next_tier: "bronze" | "silver" | "gold" | "elite" | null;
  next_tier_min: number | null;
};

const TIER_STYLES: Record<WalletSummary["tier"], string> = {
  bronze: "bg-amber-900/30 text-amber-200 ring-amber-700/40",
  silver: "bg-slate-500/20 text-slate-100 ring-slate-400/40",
  gold: "bg-amber-500/20 text-amber-200 ring-amber-400/50",
  elite: "bg-gradient-to-r from-amber-500/30 to-amber-200/20 text-amber-100 ring-amber-300/60",
};

const formatRand = (cents: number) =>
  `R${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const ReferralPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: codeData, error: codeErr } = await supabase.rpc("get_or_create_referral_code");
      if (codeErr) {
        toast({ title: "Could not load code", description: codeErr.message, variant: "destructive" });
      } else if (!cancelled) {
        setCode(codeData as string);
      }

      const { data: refs } = await supabase
        .from("referrals")
        .select("id, status, reward_cents, created_at, completed_at, referred_user_id")
        .eq("referrer_user_id", user.id)
        .order("created_at", { ascending: false });

      const { data: ws } = await (supabase as any).rpc("get_my_wallet_summary");

      if (!cancelled) {
        setReferrals((refs ?? []) as ReferralRow[]);
        if (ws) setWallet(ws as WalletSummary);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, toast]);

  const shareLink = code ? `${window.location.origin}/auth?ref=${code}` : "";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const completedCount = referrals.filter((r) => r.status === "completed").length;
  const pendingCount = referrals.filter((r) => r.status === "pending").length;
  const totalRewardRand = referrals.reduce((s, r) => s + (r.status === "completed" ? r.reward_cents : 0), 0) / 100;

  return (
    <div className="min-h-dvh bg-background pb-24">
      <Sidebar />
      <header className="px-5 pt-8 pb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <h1 className="font-serif text-xl text-foreground">Refer a friend</h1>
        </div>
      </header>

      <main className="px-5 flex flex-col gap-6 mt-2 max-w-2xl mx-auto">
        {wallet && (
          <section className="bg-card rounded-3xl p-5 sm:p-6 ring-1 ring-border flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-toast text-xs uppercase tracking-wide font-medium">Wallet</p>
                <p className="font-serif text-3xl text-brass tabular-nums mt-1">{formatRand(wallet.balance_cents)}</p>
              </div>
              <div className={`px-3 py-1.5 rounded-full ring-1 text-xs font-semibold uppercase tracking-wider ${TIER_STYLES[wallet.tier]}`}>
                {wallet.tier}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-toast mb-1.5">
                <span>{wallet.paid_referrals} paid referral{wallet.paid_referrals === 1 ? "" : "s"}</span>
                {wallet.next_tier && wallet.next_tier_min !== null && (
                  <span>{wallet.next_tier_min - wallet.paid_referrals} to {wallet.next_tier}</span>
                )}
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${
                      wallet.next_tier && wallet.next_tier_min
                        ? Math.min(100, Math.round((wallet.paid_referrals / wallet.next_tier_min) * 100))
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Code card */}
        <section className="bg-card rounded-3xl p-6 ring-1 ring-border relative overflow-hidden">
          <div className="absolute -top-24 -right-24 size-64 bg-amber-dim rounded-full blur-[80px] opacity-25" />
          <div className="relative z-10">
            <p className="text-toast text-sm mb-2">Your code</p>
            <div className="flex items-center justify-between gap-3 mb-5">
              <span className="font-serif text-4xl tracking-[0.25em] text-brass tabular-nums">
                {loading ? "…" : code ?? "—"}
              </span>
              <button
                onClick={() => code && copy(code, "Code")}
                disabled={!code}
                className="px-4 py-2 rounded-xl bg-secondary ring-1 ring-border text-foreground text-sm hover:ring-primary/40 disabled:opacity-50"
              >
                Copy
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-toast text-xs uppercase tracking-wide">Share link</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareLink}
                  className="flex-1 bg-input text-foreground rounded-xl px-3 py-2 text-sm ring-1 ring-border font-mono truncate"
                />
                <button
                  onClick={() => copy(shareLink, "Link")}
                  disabled={!code}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-3 gap-3">
          {[
            { label: "Completed", value: completedCount },
            { label: "Pending", value: pendingCount },
            { label: "Rewards", value: `R${totalRewardRand.toFixed(0)}` },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-2xl p-4 ring-1 ring-border text-center">
              <p className="font-serif text-2xl text-foreground tabular-nums">{s.value}</p>
              <p className="text-toast text-xs uppercase tracking-wide mt-1">{s.label}</p>
            </div>
          ))}
        </section>

        {/* History */}
        <section>
          <h2 className="font-serif text-lg text-foreground mb-3">Your referrals</h2>
          {loading ? (
            <p className="text-toast text-sm">Loading…</p>
          ) : referrals.length === 0 ? (
            <div className="bg-card rounded-2xl p-6 ring-1 ring-border text-center">
              <p className="text-toast text-sm">No referrals yet. Share your code to start.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {referrals.map((r) => (
                <li
                  key={r.id}
                  className="bg-card rounded-2xl p-4 ring-1 ring-border flex items-center justify-between"
                >
                  <div>
                    <p className="text-foreground text-sm font-mono">
                      {r.referred_user_id.slice(0, 8)}…
                    </p>
                    <p className="text-toast text-xs mt-1">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ring-1 ${
                      r.status === "completed"
                        ? "bg-secondary text-brass ring-primary/40"
                        : r.status === "pending"
                        ? "bg-secondary text-toast ring-border"
                        : "bg-destructive/20 text-foreground ring-destructive/40"
                    }`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};

export default ReferralPage;
