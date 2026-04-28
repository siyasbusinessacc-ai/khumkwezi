import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const BOOTSTRAP_EMAIL = "siyasbusinessacc@gmail.com";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleBootstrap = async (user: User | null) => {
      if (user?.email?.toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase()) {
        console.log("Admin bootstrap & repair detected for:", user.email);
        try {
          // 1. Claim Admin Role
          await supabase.rpc("claim_first_admin");
          
          // 2. Database Repair: Ensure verify_pass exists
          // We use a raw SQL approach through a temporary RPC if possible, 
          // but since we can't run arbitrary SQL easily without a pre-existing RPC,
          // we'll try to trigger the existing one and log the specific error.
          const { error: verifyError } = await supabase.rpc("verify_pass", { _pass_code: "test" });
          
          if (verifyError?.message?.includes("could not find the function")) {
            console.log("Schema cache issue detected. Please contact support or run migration.");
            // Note: In a real scenario without SQL access, we'd need to use a 'system' level 
            // migration tool. For this specific case, the error usually resolves after a 
            // few minutes of the 'Ready' deployment or by refreshing the Supabase schema cache.
          }
        } catch (e) {
          console.error("Bootstrap exception:", e);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
        if (session?.user) {
          handleBootstrap(session.user);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        handleBootstrap(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
