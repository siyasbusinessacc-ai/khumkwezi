import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";

type LookupResult = {
  profile: {
    user_id: string;
    name: string | null;
    surname: string | null;
    student_number: string | null;
  };
  subscription: {
    id: string;
    plan_name: string;
    allowed_weekdays: number[];
    end_date: string | null;
  } | null;
  todayRedemption: { id: string } | null;
};

const SCANNER_ID = "kitchen-qr-scanner";

const KitchenDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isKitchen, isAdmin, loading: rolesLoading } = useUserRoles();
  const { toast } = useToast();

  const [scanning, setScanning] = useState(false);
  const [manualId, setManualId] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, []);

  const lookupStudent = async (userId: string) => {
    setBusy(true);
    setLookup(null);
    try {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, name, surname, student_number")
        .eq("user_id", userId)
        .maybeSingle();

      if (pErr) throw pErr;
      if (!profile) {
        toast({ title: "Student not found", variant: "destructive" });
        return;
      }

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, end_date, meal_plans(name, allowed_weekdays)")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      const today = new Date().toISOString().slice(0, 10);
      const { data: red } = sub
        ? await supabase
            .from("meal_redemptions")
            .select("id")
            .eq("subscription_id", sub.id)
            .eq("redeemed_on", today)
            .maybeSingle()
        : { data: null };

      setLookup({
        profile,
        subscription: sub
          ? {
              id: sub.id,
              plan_name: (sub as any).meal_plans?.name ?? "Plan",
              allowed_weekdays: (sub as any).meal_plans?.allowed_weekdays ?? [],
              end_date: sub.end_date,
            }
          : null,
        todayRedemption: red,
      });
    } catch (e: any) {
      toast({ title: "Lookup failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const startScanner = async () => {
    setScanning(true);
    setLookup(null);
    // Wait for the DOM node to mount
    await new Promise((r) => setTimeout(r, 50));
    try {
      const qr = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = qr;
      await qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          await qr.stop();
          qr.clear();
          scannerRef.current = null;
          setScanning(false);
          await lookupStudent(decoded.trim());
        },
        () => {}
      );
    } catch (e: any) {
      setScanning(false);
      toast({ title: "Camera unavailable", description: e.message, variant: "destructive" });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear();
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const redeem = async () => {
    if (!lookup?.subscription || !user) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("meal_redemptions").insert({
        subscription_id: lookup.subscription.id,
        user_id: lookup.profile.user_id,
        redeemed_on: today,
        redeemed_by: user.id,
      });
      if (error) throw error;
      toast({ title: "Meal served", description: `${lookup.profile.name ?? "Student"}'s meal recorded.` });
      await lookupStudent(lookup.profile.user_id);
    } catch (e: any) {
      toast({
        title: "Could not record meal",
        description: e.message?.includes("duplicate") ? "Already redeemed today." : e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (rolesLoading) {
    return <div className="min-h-dvh bg-background flex items-center justify-center text-toast">Loading…</div>;
  }
  if (!isKitchen) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo size={56} />
        <h1 className="font-serif text-2xl text-foreground">Kitchen access only</h1>
        <p className="text-toast max-w-md">Your account doesn't have kitchen permissions. Ask an admin to grant you the kitchen role.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-2 px-5 py-3 rounded-xl bg-secondary ring-1 ring-border text-foreground hover:ring-primary/40"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  // Validate the plan covers today
  const today = new Date();
  const isoWeekday = ((today.getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
  const planCoversToday = lookup?.subscription?.allowed_weekdays?.includes(isoWeekday) ?? false;
  const subActiveByDate =
    lookup?.subscription?.end_date ? new Date(lookup.subscription.end_date) >= today : true;

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="px-5 pt-8 pb-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="text-toast text-xs font-medium tracking-wide uppercase">Kitchen</p>
            <h1 className="font-serif text-xl text-foreground leading-tight">Service Console</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => navigate("/admin")}
              className="text-toast hover:text-brass text-sm"
            >
              Admin
            </button>
          )}
          <button
            onClick={() => signOut().then(() => navigate("/auth"))}
            className="text-toast hover:text-brass text-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="px-5 flex flex-col gap-6 mt-2">
        {/* Scanner */}
        <section className="bg-card rounded-3xl p-6 ring-1 ring-border">
          <h2 className="font-serif text-lg text-foreground mb-4">Scan student QR</h2>
          {!scanning ? (
            <button
              onClick={startScanner}
              className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl hover:opacity-90"
            >
              Open camera
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div id={SCANNER_ID} className="w-full aspect-square bg-background rounded-2xl overflow-hidden ring-1 ring-border" />
              <button
                onClick={stopScanner}
                className="w-full bg-secondary ring-1 ring-border py-3 rounded-xl text-toast hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </section>

        {/* Manual lookup */}
        <section className="bg-card rounded-3xl p-6 ring-1 ring-border">
          <h2 className="font-serif text-lg text-foreground mb-3">Manual lookup</h2>
          <p className="text-toast text-sm mb-4">Paste a student's user ID if their phone is offline.</p>
          <div className="flex gap-2">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="user_id"
              className="flex-1 bg-input text-foreground rounded-xl px-4 py-3 ring-1 ring-border focus:ring-primary outline-none font-mono text-sm"
            />
            <button
              onClick={() => manualId.trim() && lookupStudent(manualId.trim())}
              disabled={!manualId.trim() || busy}
              className="px-5 py-3 rounded-xl bg-secondary ring-1 ring-border text-foreground hover:ring-primary/40 disabled:opacity-50"
            >
              Look up
            </button>
          </div>
        </section>

        {/* Result */}
        {lookup && (
          <section className="bg-card rounded-3xl p-6 ring-1 ring-border">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-serif text-2xl text-foreground">
                  {lookup.profile.name ?? ""} {lookup.profile.surname ?? ""}
                </h3>
                {lookup.profile.student_number && (
                  <p className="text-toast text-sm mt-1">#{lookup.profile.student_number}</p>
                )}
              </div>
              {lookup.todayRedemption ? (
                <span className="px-3 py-1 rounded-full bg-destructive/20 text-destructive-foreground text-xs font-medium ring-1 ring-destructive/40">
                  Already served today
                </span>
              ) : lookup.subscription && planCoversToday && subActiveByDate ? (
                <span className="px-3 py-1 rounded-full bg-secondary text-brass text-xs font-medium ring-1 ring-primary/40 uppercase tracking-wide">
                  Eligible
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-secondary text-toast text-xs font-medium ring-1 ring-border">
                  Not eligible
                </span>
              )}
            </div>

            {lookup.subscription ? (
              <div className="space-y-2 mb-5 text-sm">
                <div className="flex justify-between text-toast">
                  <span>Plan</span>
                  <span className="text-foreground">{lookup.subscription.plan_name}</span>
                </div>
                <div className="flex justify-between text-toast">
                  <span>Valid through</span>
                  <span className="text-foreground">{lookup.subscription.end_date ?? "—"}</span>
                </div>
                <div className="flex justify-between text-toast">
                  <span>Today covered?</span>
                  <span className={planCoversToday ? "text-brass" : "text-foreground"}>
                    {planCoversToday ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-toast text-sm mb-5">No active subscription.</p>
            )}

            <button
              onClick={redeem}
              disabled={
                busy ||
                !lookup.subscription ||
                !!lookup.todayRedemption ||
                !planCoversToday ||
                !subActiveByDate
              }
              className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Recording…" : "Serve meal"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
};

export default KitchenDashboard;
