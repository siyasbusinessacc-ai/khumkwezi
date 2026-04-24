import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Logo } from "@/components/Logo";
import type { Tables } from "@/integrations/supabase/types";
import menuRibeye from "@/assets/menu-ribeye.jpg";
import menuArancini from "@/assets/menu-arancini.jpg";
import shishaPairing from "@/assets/shisha-pairing.jpg";

type Profile = Tables<"profiles">;

const MealPassCard = ({ userId }: { userId: string }) => (
  <div className="bg-card rounded-3xl p-6 sm:p-8 ring-1 ring-border shadow-[0_0_60px_-15px_hsl(var(--amber-glow)/0.15)] relative overflow-hidden">
    <div className="absolute -top-24 -right-24 size-64 bg-amber-dim rounded-full blur-[80px] opacity-30 animate-pulse-glow" />
    <div className="relative z-10 flex flex-col gap-8">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-toast text-sm font-medium mb-2">Remaining Balance</p>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-5xl font-medium tracking-tight tabular-nums">14</span>
            <span className="text-toast">/ 20</span>
          </div>
          <p className="text-toast text-sm mt-1">Dinners & Shisha pairings</p>
        </div>
        <div className="px-3 py-1 rounded-full bg-secondary ring-1 ring-border">
          <span className="text-xs font-medium text-brass tracking-wide uppercase">Active</span>
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-background rounded-2xl p-6 ring-1 ring-border flex flex-col items-center justify-center gap-4">
        <div className="bg-parchment p-3 rounded-xl">
          <QRCodeSVG
            value={userId}
            size={160}
            bgColor="#F5EBD9"
            fgColor="#0a0807"
            level="M"
          />
        </div>
        <p className="text-toast text-sm text-center max-w-[24ch]">
          Show this code at the kitchen to claim today's meal
        </p>
      </div>

      <button className="w-full bg-gradient-to-b from-mahogany-700 to-mahogany-800 text-foreground font-medium py-4 rounded-xl ring-1 ring-border shadow-lg hover:from-mahogany-700 hover:to-mahogany-700 transition-all">
        Add Guest Pass (1 Dinner)
      </button>
    </div>
  </div>
);

const ReservationSlots = () => {
  const [selected, setSelected] = useState(1);
  const slots = [
    { time: "16:00", status: "available" },
    { time: "16:30", status: "available" },
    { time: "17:00", status: "available" },
    { time: "17:30", status: "full" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-xl text-foreground">Reserve a Slot</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {slots.map((slot, i) => (
          <button
            key={slot.time}
            onClick={() => slot.status !== "full" && setSelected(i)}
            disabled={slot.status === "full"}
            className={`py-3 rounded-xl ring-1 transition-all flex flex-col items-center justify-center gap-1 ${
              slot.status === "full"
                ? "bg-background ring-border opacity-50 cursor-not-allowed text-toast"
                : selected === i
                ? "bg-secondary ring-primary/40 text-brass shadow-[0_0_20px_-5px_hsl(var(--amber-glow)/0.2)]"
                : "bg-card ring-border text-toast hover:ring-primary/30 hover:text-brass"
            }`}
          >
            <span className="text-sm font-medium tabular-nums">{slot.time}</span>
            <span className="text-xs opacity-70">
              {slot.status === "full" ? "Full" : selected === i ? "Selected" : "Available"}
            </span>
          </button>
        ))}
      </div>
      <button className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity">
        Confirm Reservation
      </button>
    </div>
  );
};

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
      <button className="text-toast hover:text-brass text-sm transition-colors">View Full</button>
    </div>
    <div className="flex flex-col gap-3">
      {menuItems.map((item) => (
        <div key={item.name} className="group flex gap-4 items-center bg-card/50 hover:bg-card p-3 rounded-2xl transition-colors ring-1 ring-transparent hover:ring-border">
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

      {/* Shisha Pairing */}
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
          <span className="text-xs font-medium text-primary tracking-wide uppercase px-2 py-0.5 rounded-sm bg-accent/30">Pairing</span>
          <h3 className="text-foreground font-medium mt-1 truncate">Cardamom & Honey</h3>
          <p className="text-toast text-sm truncate">Slow-burning dark leaf blend.</p>
        </div>
      </div>
    </div>
  </div>
);

const BottomNav = ({ isKitchen }: { isKitchen: boolean }) => {
  const navigate = useNavigate();
  const items = [
    { label: "Pass", path: "/", active: true },
    { label: "Refer", path: "/refer", active: false },
    ...(isKitchen ? [{ label: "Kitchen", path: "/kitchen", active: false }] : []),
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

const StudentDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isKitchen } = useUserRoles();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("Profile fetch error:", error.message);
        if (data) setProfile(data);
      });
  }, [user]);

  const initials = profile
    ? `${(profile.name?.[0] || "").toUpperCase()}${(profile.surname?.[0] || "").toUpperCase()}` || "?"
    : "?";

  const greeting = new Date().getHours() < 12 ? "Good Morning" : new Date().getHours() < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="px-5 pt-8 pb-4 flex justify-between items-end">
        <div className="flex items-end gap-3">
          <Logo size={64} />
          <div>
            <p className="text-toast text-sm font-medium tracking-wide uppercase mb-1">{greeting}</p>
            <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground leading-tight">
              Welcome
            </h1>
          </div>
        </div>
        <button onClick={() => navigate("/profile")} className="size-11 rounded-full bg-secondary flex items-center justify-center shrink-0 ring-1 ring-border hover:ring-primary transition-colors">
          <span className="font-serif text-brass text-base">{initials}</span>
        </button>
      </header>

      <main className="px-5 flex flex-col gap-8 mt-2">
        {user && <MealPassCard userId={user.id} />}
        <ReservationSlots />
        <MenuPreview />
      </main>

      <BottomNav isKitchen={isKitchen} />
    </div>
  );
};

export default StudentDashboard;
