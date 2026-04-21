import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "We sent you a confirmation link." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        navigate("/");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ phone: phone.trim(), password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
        if (error) throw error;
      }
      setOtpSent(true);
      toast({ title: "OTP Sent", description: `Check your phone ${phone}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp,
        type: mode === "signup" ? "sms" : "sms",
      });
      if (error) throw error;
      navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-secondary text-foreground placeholder:text-muted-foreground px-4 py-3 rounded-xl ring-1 ring-border focus:ring-primary focus:outline-none transition-all text-sm";
  const btnPrimary = "w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm";

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm flex flex-col gap-8">
        {/* Brand */}
        <div className="text-center">
          <p className="text-toast text-sm font-medium tracking-wide uppercase mb-1">Welcome to</p>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            Khumkwhezi
          </h1>
          <p className="text-toast text-sm mt-1">Dine & Shisha House</p>
        </div>

        {/* Method Toggle */}
        <div className="grid grid-cols-2 gap-2 bg-secondary p-1 rounded-xl">
          <button
            onClick={() => { setMethod("email"); setOtpSent(false); }}
            className={`py-2.5 rounded-lg text-sm font-medium transition-all ${method === "email" ? "bg-card text-foreground ring-1 ring-border" : "text-toast"}`}
          >
            Email
          </button>
          <button
            onClick={() => { setMethod("phone"); setOtpSent(false); }}
            className={`py-2.5 rounded-lg text-sm font-medium transition-all ${method === "phone" ? "bg-card text-foreground ring-1 ring-border" : "text-toast"}`}
          >
            Phone
          </button>
        </div>

        {/* Email Form */}
        {method === "email" && (
          <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              minLength={6}
              required
            />
            <button type="submit" disabled={loading} className={btnPrimary}>
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        )}

        {/* Phone Form */}
        {method === "phone" && !otpSent && (
          <form onSubmit={handlePhoneSendOtp} className="flex flex-col gap-4">
            <input
              type="tel"
              placeholder="+27 81 234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              required
            />
            {mode === "signup" && (
              <input
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                minLength={6}
                required
              />
            )}
            <button type="submit" disabled={loading} className={btnPrimary}>
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        )}

        {/* OTP Verification */}
        {method === "phone" && otpSent && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <p className="text-toast text-sm text-center">Enter the code sent to {phone}</p>
            <input
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
              maxLength={6}
              required
            />
            <button type="submit" disabled={loading} className={btnPrimary}>
              {loading ? "Verifying..." : "Verify & Enter"}
            </button>
            <button type="button" onClick={() => setOtpSent(false)} className="text-toast text-sm hover:text-foreground transition-colors">
              ← Change number
            </button>
          </form>
        )}

        {/* Mode Toggle */}
        <p className="text-center text-sm text-toast">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-primary font-medium hover:underline"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
