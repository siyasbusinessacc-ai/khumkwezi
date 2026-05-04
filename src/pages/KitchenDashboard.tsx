import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";

type VerifyResult = {
  ok: boolean;
  status: "eligible" | "already_served" | "unpaid" | "not_eligible" | "invalid" | "error";
  name: string | null;
  surname: string | null;
  plan_name: string | null;
  valid_until: string | null;
  subscription_id: string | null;
  user_id: string | null;
  message: string;
};

const SCANNER_ID = "kitchen-qr-scanner";

const KitchenDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isKitchen, isAdmin, loading: rolesLoading } = useUserRoles();
  const { toast } = useToast();

  const [scanning, setScanning] = useState(false);
  const [manualPass, setManualPass] = useState("");
  const [lookup, setLookup] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<{ id: string; label: string; capacity: number }[]>([]);
  const [slotId, setSlotId] = useState<string>("");
  const [slotRemaining, setSlotRemaining] = useState<number | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const today = new Date();
    const isoDow = ((today.getDay() + 6) % 7) + 1;
    supabase.from("meal_slots").select("id,label,capacity,weekdays,is_active").eq("is_active", true)
      .then(({ data }) => {
        const filtered = ((data as any[]) ?? []).filter(s => (s.weekdays as number[]).includes(isoDow));
        setSlots(filtered);
      });
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!slotId) { setSlotRemaining(null); return; }
    const today = new Date().toISOString().slice(0, 10);
    supabase.rpc("slot_remaining_capacity", { _slot_id: slotId, _date: today })
      .then(({ data }) => setSlotRemaining(typeof data === "number" ? data : null));
  }, [slotId, lookup]);


  const verifyPassCode = async (passCode: string) => {
    setBusy(true);
    setLookup(null);
    try {
      // --- RESILIENT SCANNER FIX (Option B) ---
      // We perform direct table queries instead of relying on the broken RPC function.
      
      const today = new Date().toISOString().slice(0, 10);
      const isoWeekday = ((new Date().getDay() + 6) % 7) + 1; // 1=Mon..7=Sun

      // 1. Find profile by pass code
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, name, surname")
        .eq("qr_code_pass", passCode.trim())
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        setLookup({
          ok: false,
          status: "invalid",
          message: "QR code not found",
          name: null,
          surname: null,
          plan_name: null,
          valid_until: null,
          subscription_id: null,
          user_id: null
        });
        toast({ title: "QR Code Not Found", variant: "destructive" });
        return;
      }

      // 2. Find active subscription
      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .select(`
          id, 
          end_date, 
          status,
          meal_plans (
            name,
            allowed_weekdays
          )
        `)
        .eq("user_id", profile.user_id)
        .eq("status", "active")
        .maybeSingle();

      if (subError) throw subError;

      const plan = sub?.meal_plans as any;
      const isPaid = !!sub && sub.end_date! >= today;
      const planCoversToday = plan?.allowed_weekdays?.includes(isoWeekday) ?? false;

      if (!sub || !isPaid) {
        setLookup({
          ok: false,
          status: "unpaid",
          message: "Student does not have an active subscription",
          name: profile.name,
          surname: profile.surname,
          plan_name: plan?.name || null,
          valid_until: sub?.end_date || null,
          subscription_id: sub?.id || null,
          user_id: profile.user_id
        });
        toast({ title: "Payment Required", variant: "destructive" });
        return;
      }

      if (!planCoversToday) {
        setLookup({
          ok: false,
          status: "not_eligible",
          message: "Plan does not cover today",
          name: profile.name,
          surname: profile.surname,
          plan_name: plan.name,
          valid_until: sub.end_date,
          subscription_id: sub.id,
          user_id: profile.user_id
        });
        toast({ title: "Not Eligible Today", variant: "destructive" });
        return;
      }

      // 3. Check for double redemption
      const { data: alreadyServed, error: redemptionError } = await supabase
        .from("meal_redemptions")
        .select("id")
        .eq("subscription_id", sub.id)
        .eq("redeemed_on", today)
        .maybeSingle();

      if (redemptionError) throw redemptionError;

      if (alreadyServed) {
        setLookup({
          ok: false,
          status: "already_served",
          message: "Student already ate today",
          name: profile.name,
          surname: profile.surname,
          plan_name: plan.name,
          valid_until: sub.end_date,
          subscription_id: sub.id,
          user_id: profile.user_id
        });
        toast({ title: "Already Served", variant: "destructive" });
        return;
      }

      // 4. All good!
      setLookup({
        ok: true,
        status: "eligible",
        message: "Eligible for meal",
        name: profile.name,
        surname: profile.surname,
        plan_name: plan.name,
        valid_until: sub.end_date,
        subscription_id: sub.id,
        user_id: profile.user_id
      });

    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const startScanner = async () => {
    setScanning(true);
    setLookup(null);
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
          await verifyPassCode(decoded.trim());
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

  const serveMeal = async () => {
    if (!lookup || !user) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      const { error } = await supabase
        .from("meal_redemptions")
        .insert({
          subscription_id: lookup.subscription_id,
          user_id: lookup.user_id,
          redeemed_on: today,
          redeemed_by: user.id,
          slot_id: slotId || null,
        });

      if (error) {
        if (error.code === "23505") {
          throw new Error("Student already ate today (Double-scan prevented)");
        }
        throw error;
      }

      // Capacity check (post-insert) — block if slot now over capacity
      if (slotId) {
        const { data: rem } = await supabase.rpc("slot_remaining_capacity", { _slot_id: slotId, _date: today });
        if (typeof rem === "number" && rem < 0) {
          // Roll back
          await supabase.from("meal_redemptions")
            .delete()
            .eq("subscription_id", lookup.subscription_id)
            .eq("redeemed_on", today);
          throw new Error("Slot is at capacity");
        }
        setSlotRemaining(typeof rem === "number" ? rem : null);
      }

      toast({
        title: "Meal Served",
        description: `${lookup.name ?? "Student"}'s meal recorded successfully.`,
      });
      setLookup(null);
      setManualPass("");

    } catch (e: any) {
      toast({
        title: "Could not record meal",
        description: e.message,
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

  const isPaid = lookup?.ok === true;
  const statusBadgeClass = isPaid
    ? "bg-primary text-primary-foreground"
    : "bg-destructive/20 text-destructive-foreground";

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
        {slots.length > 0 && (
          <section className="bg-card rounded-3xl p-5 ring-1 ring-border">
            <h2 className="font-serif text-lg text-foreground mb-3">Service slot</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSlotId("")}
                className={`text-xs px-3 py-2 rounded-full ring-1 ${!slotId ? "bg-primary/20 text-brass ring-primary/40" : "bg-secondary text-toast ring-border"}`}
              >No slot</button>
              {slots.map(s => (
                <button key={s.id}
                  onClick={() => setSlotId(s.id)}
                  className={`text-xs px-3 py-2 rounded-full ring-1 ${slotId === s.id ? "bg-primary/20 text-brass ring-primary/40" : "bg-secondary text-toast ring-border"}`}
                >{s.label}</button>
              ))}
            </div>
            {slotId && slotRemaining !== null && (
              <p className="text-toast text-xs mt-3">
                {slotRemaining > 0 ? `${slotRemaining} seats remaining` : <span className="text-destructive font-medium">SLOT FULL</span>}
              </p>
            )}
          </section>
        )}

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

        <section className="bg-card rounded-3xl p-6 ring-1 ring-border">
          <h2 className="font-serif text-lg text-foreground mb-3">Manual verification</h2>
          <p className="text-toast text-sm mb-4">Paste a QR pass code if their phone is offline.</p>
          <div className="flex gap-2">
            <input
              value={manualPass}
              onChange={(e) => setManualPass(e.target.value)}
              placeholder="pass_..."
              className="flex-1 bg-input text-foreground rounded-xl px-4 py-3 ring-1 ring-border focus:ring-primary outline-none font-mono text-sm"
            />
            <button
              onClick={() => manualPass.trim() && verifyPassCode(manualPass.trim())}
              disabled={!manualPass.trim() || busy}
              className="px-5 py-3 rounded-xl bg-secondary ring-1 ring-border text-foreground hover:ring-primary/40 disabled:opacity-50"
            >
              Verify
            </button>
          </div>
        </section>

        {lookup && (
          <section className="bg-card rounded-3xl p-6 ring-1 ring-border">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="font-serif text-2xl text-foreground">
                  {lookup.name ?? "?"} {lookup.surname ?? ""}
                </h3>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ring-1 ${statusBadgeClass}`}
              >
                {isPaid ? "✓ PAID" : "✗ " + lookup.status.toUpperCase()}
              </span>
            </div>

            {lookup.plan_name && (
              <div className="space-y-2 mb-5 text-sm">
                <div className="flex justify-between text-toast">
                  <span>Plan</span>
                  <span className="text-foreground">{lookup.plan_name}</span>
                </div>
                {lookup.valid_until && (
                  <div className="flex justify-between text-toast">
                    <span>Valid until</span>
                    <span className="text-foreground">{lookup.valid_until}</span>
                  </div>
                )}
              </div>
            )}

            {lookup.message && (
              <p className="text-toast text-xs mb-4 italic">{lookup.message}</p>
            )}

            <button
              onClick={serveMeal}
              disabled={!isPaid || busy}
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
