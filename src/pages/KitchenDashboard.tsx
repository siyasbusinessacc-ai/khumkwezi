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
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, []);

  const verifyPassCode = async (passCode: string) => {
    setBusy(true);
    setLookup(null);
    try {
      const { data, error } = await supabase.rpc("verify_pass", {
        _pass_code: passCode.trim(),
      });

      if (error) throw error;

      const result = data as VerifyResult;
      if (!result) {
        toast({ title: "Invalid response", variant: "destructive" });
        return;
      }

      setLookup(result);

      if (result.status === "invalid") {
        toast({
          title: "QR Code Not Found",
          description: "This QR code is not recognized.",
          variant: "destructive",
        });
      } else if (result.status === "already_served") {
        toast({
          title: "Already Served",
          description: "This student has already redeemed their meal today.",
          variant: "destructive",
        });
      } else if (result.status === "unpaid") {
        toast({
          title: "Payment Required",
          description: "This student does not have an active subscription.",
          variant: "destructive",
        });
      } else if (result.status === "not_eligible") {
        toast({
          title: "Not Eligible Today",
          description: "This student's plan does not cover today.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
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
      const { data, error } = await supabase.rpc("serve_meal_by_pass", {
        _pass_code: manualPass.trim() || lookup.user_id,
        _kitchen_user_id: user.id,
      });

      if (error) throw error;

      const result = data as any;
      if (result.ok) {
        toast({
          title: "Meal Served",
          description: `${result.name ?? "Student"}'s meal recorded successfully.`,
        });
        setLookup(null);
        setManualPass("");
      } else {
        toast({
          title: "Failed to serve meal",
          description: result.message,
          variant: "destructive",
        });
      }
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

        {/* Result */}
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
