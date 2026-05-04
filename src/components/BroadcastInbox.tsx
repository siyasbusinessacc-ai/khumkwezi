import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type Item = { id: string; title: string; body: string; created_at: string; is_read: boolean };

export const BroadcastInbox = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("list_my_broadcasts");
    setItems((data as Item[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const unread = items.filter(i => !i.is_read).length;

  const markRead = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("broadcast_reads").upsert({ user_id: user.id, broadcast_id: id });
    setItems(items.map(i => i.id === id ? { ...i, is_read: true } : i));
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <SheetTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-secondary transition-colors" aria-label="Notifications">
          <Bell size={20} className="text-foreground" />
          {unread > 0 && (
            <span className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] min-w-4 h-4 rounded-full flex items-center justify-center px-1">{unread}</span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="bg-card border-border overflow-y-auto">
        <SheetHeader><SheetTitle className="font-serif text-foreground">Announcements</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          {items.map((b) => (
            <button key={b.id} onClick={() => markRead(b.id)}
              className={`w-full text-left bg-secondary/50 rounded-xl p-3 ring-1 ${b.is_read ? "ring-border" : "ring-primary/40"}`}>
              <div className="flex justify-between items-start gap-2">
                <p className={`font-serif text-base ${b.is_read ? "text-toast" : "text-foreground"}`}>{b.title}</p>
                {!b.is_read && <span className="bg-primary w-2 h-2 rounded-full mt-2 shrink-0" />}
              </div>
              <p className="text-toast text-sm mt-1 whitespace-pre-line">{b.body}</p>
              <p className="text-toast text-xs mt-2">{new Date(b.created_at).toLocaleString()}</p>
            </button>
          ))}
          {items.length === 0 && <p className="text-toast text-center py-8 text-sm">No announcements.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
};
