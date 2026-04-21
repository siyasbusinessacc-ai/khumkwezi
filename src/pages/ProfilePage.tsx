import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

const ProfilePage = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
        setLoading(false);
      });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: profile.name || null,
        surname: profile.surname || null,
        student_number: profile.student_number || null,
        primary_phone: profile.primary_phone || null,
        secondary_phone: profile.secondary_phone || null,
        email: profile.email || null,
        emergency_contact_name: profile.emergency_contact_name || null,
        emergency_contact_phone: profile.emergency_contact_phone || null,
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Profile updated successfully." });
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const update = (field: keyof Profile, value: string) =>
    setProfile((prev) => ({ ...prev, [field]: value }));

  const inputClass = "w-full bg-secondary text-foreground placeholder:text-muted-foreground px-4 py-3 rounded-xl ring-1 ring-border focus:ring-primary focus:outline-none transition-all text-sm";
  const labelClass = "text-toast text-xs font-medium uppercase tracking-wider";

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <p className="text-toast">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="px-5 pt-8 pb-4 flex justify-between items-center">
        <div>
          <button onClick={() => navigate("/")} className="text-toast hover:text-foreground text-sm transition-colors">← Back</button>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground mt-2">Your Profile</h1>
        </div>
        <div className="size-11 rounded-full bg-secondary flex items-center justify-center ring-1 ring-border">
          <span className="font-serif text-brass text-base">
            {(profile.name?.[0] || "?").toUpperCase()}{(profile.surname?.[0] || "").toUpperCase()}
          </span>
        </div>
      </header>

      <form onSubmit={handleSave} className="px-5 flex flex-col gap-5 mt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Name</label>
            <input className={inputClass} placeholder="First name" value={profile.name || ""} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Surname</label>
            <input className={inputClass} placeholder="Last name" value={profile.surname || ""} onChange={(e) => update("surname", e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Student Number</label>
          <input className={inputClass} placeholder="e.g. 202301234" value={profile.student_number || ""} onChange={(e) => update("student_number", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Email</label>
          <input type="email" className={inputClass} placeholder="student@university.ac.za" value={profile.email || ""} onChange={(e) => update("email", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Primary Phone</label>
          <input type="tel" className={inputClass} placeholder="+27 81 234 5678" value={profile.primary_phone || ""} onChange={(e) => update("primary_phone", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Secondary / Recovery Phone</label>
          <input type="tel" className={inputClass} placeholder="+27 82 345 6789" value={profile.secondary_phone || ""} onChange={(e) => update("secondary_phone", e.target.value)} />
        </div>

        <div className="h-px bg-border my-2" />
        <p className="text-toast text-xs font-medium uppercase tracking-wider">Emergency Contact</p>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Contact Name</label>
          <input className={inputClass} placeholder="Parent / Guardian" value={profile.emergency_contact_name || ""} onChange={(e) => update("emergency_contact_name", e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Contact Phone</label>
          <input type="tel" className={inputClass} placeholder="+27 83 456 7890" value={profile.emergency_contact_phone || ""} onChange={(e) => update("emergency_contact_phone", e.target.value)} />
        </div>

        <button type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm mt-2">
          {saving ? "Saving..." : "Save Profile"}
        </button>

        <button type="button" onClick={handleLogout} className="w-full bg-secondary text-destructive font-medium py-3 rounded-xl ring-1 ring-border hover:bg-destructive/10 transition-colors text-sm">
          Sign Out
        </button>
      </form>
    </div>
  );
};

export default ProfilePage;
