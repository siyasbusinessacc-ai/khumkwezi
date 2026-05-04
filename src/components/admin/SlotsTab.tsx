import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

type Slot = {
  id: string; label: string;
  start_time: string; end_time: string;
  capacity: number; weekdays: number[]; is_active: boolean;
};
const WD = [{ n: 1, l: "Mon" }, { n: 2, l: "Tue" }, { n: 3, l: "Wed" }, { n: 4, l: "Thu" }, { n: 5, l: "Fri" }, { n: 6, l: "Sat" }, { n: 7, l: "Sun" }];

export const SlotsTab = () => {
  const { toast } = useToast();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ label: "", start_time: "12:00", end_time: "14:00", capacity: 60, weekdays: [1, 2, 3, 4, 5] as number[] });

  const load = async () => {
    const { data, error } = await supabase.from("meal_slots").select("*").order("start_time");
    if (error) return toast({ title: "Load failed", description: error.message, variant: "destructive" });
    setSlots((data as Slot[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.label.trim()) return toast({ title: "Label required", variant: "destructive" });
    setBusy(true);
    const { error } = await supabase.from("meal_slots").insert({ ...form, label: form.label.trim() });
    setBusy(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Slot created" });
    setOpen(false);
    setForm({ label: "", start_time: "12:00", end_time: "14:00", capacity: 60, weekdays: [1, 2, 3, 4, 5] });
    load();
  };

  const toggle = async (s: Slot) => {
    const { error } = await supabase.from("meal_slots").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this slot?")) return;
    const { error } = await supabase.from("meal_slots").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-serif text-xl text-foreground">Meal Slots</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ New Slot</Button></DialogTrigger>
          <DialogContent className="bg-card ring-1 ring-border">
            <DialogHeader><DialogTitle className="font-serif">New Slot</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Lunch service" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
                <div><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
              </div>
              <div><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
              <div>
                <Label>Active weekdays</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {WD.map((d) => {
                    const on = form.weekdays.includes(d.n);
                    return (
                      <button key={d.n} type="button"
                        onClick={() => setForm({ ...form, weekdays: on ? form.weekdays.filter(x => x !== d.n) : [...form.weekdays, d.n] })}
                        className={`text-xs px-3 py-1 rounded-full ring-1 ${on ? "bg-primary/20 text-brass ring-primary/40" : "bg-secondary text-toast ring-border"}`}>
                        {d.l}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {slots.map((s) => (
          <div key={s.id} className="bg-card rounded-2xl p-4 ring-1 ring-border flex justify-between items-center gap-3">
            <div>
              <p className="font-serif text-lg text-foreground">{s.label}</p>
              <p className="text-toast text-sm">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} · cap {s.capacity}</p>
              <p className="text-toast text-xs mt-1">{s.weekdays.map(n => WD[n - 1]?.l).join(" ")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={s.is_active} onCheckedChange={() => toggle(s)} />
              <button onClick={() => remove(s.id)} className="p-2 text-toast hover:text-destructive"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {slots.length === 0 && <p className="text-toast text-center py-8">No slots configured.</p>}
      </div>
    </div>
  );
};
