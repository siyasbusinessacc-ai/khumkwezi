import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

type Offer = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: "percent" | "flat";
  discount_value: number;
  starts_at: string;
  ends_at: string | null;
  max_redemptions: number | null;
  current_redemptions: number;
  per_user_limit: number;
  applicable_plan_ids: string[];
  min_subtotal_cents: number;
  is_active: boolean;
};

type Plan = { id: string; name: string };

const fmtRand = (cents: number) => `R${(cents / 100).toFixed(2)}`;

export const OffersTab = ({ plans }: { plans: Plan[] }) => {
  const { toast } = useToast();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    discount_type: "percent" as "percent" | "flat",
    discount_value: 10,
    ends_at: "",
    max_redemptions: "",
    per_user_limit: 1,
    min_subtotal_cents: 0,
    applicable_plan_ids: [] as string[],
  });

  const load = async () => {
    const { data, error } = await supabase.from("offers").select("*").order("created_at", { ascending: false });
    if (error) return toast({ title: "Could not load offers", description: error.message, variant: "destructive" });
    setOffers((data as Offer[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      return toast({ title: "Code and name required", variant: "destructive" });
    }
    setBusy(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: form.discount_type === "flat" ? form.discount_value * 100 : form.discount_value,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      per_user_limit: form.per_user_limit,
      min_subtotal_cents: form.min_subtotal_cents * 100,
      applicable_plan_ids: form.applicable_plan_ids,
    };
    const { error } = await supabase.from("offers").insert(payload);
    setBusy(false);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    toast({ title: "Offer created" });
    setOpen(false);
    setForm({ ...form, code: "", name: "", description: "" });
    load();
  };

  const toggle = async (o: Offer) => {
    const { error } = await supabase.from("offers").update({ is_active: !o.is_active }).eq("id", o.id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this offer? Redemption history will remain.")) return;
    const { error } = await supabase.from("offers").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-serif text-xl text-foreground">Discount Offers</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ New Offer</Button></DialogTrigger>
          <DialogContent className="bg-card ring-1 ring-border max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-serif">New Offer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WELCOME10" /></div>
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Welcome 10%" /></div>
              </div>
              <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.discount_type} onValueChange={(v: "percent" | "flat") => setForm({ ...form, discount_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="flat">Flat (Rand)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Value</Label>
                  <Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ends at</Label><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
                <div><Label>Max redemptions</Label><Input type="number" value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })} placeholder="Unlimited" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Per-user limit</Label><Input type="number" value={form.per_user_limit} onChange={(e) => setForm({ ...form, per_user_limit: Number(e.target.value) })} /></div>
                <div><Label>Min subtotal (R)</Label><Input type="number" value={form.min_subtotal_cents} onChange={(e) => setForm({ ...form, min_subtotal_cents: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label>Applicable plans (none = all)</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {plans.map((p) => {
                    const on = form.applicable_plan_ids.includes(p.id);
                    return (
                      <button key={p.id} type="button"
                        onClick={() => setForm({ ...form, applicable_plan_ids: on ? form.applicable_plan_ids.filter(x => x !== p.id) : [...form.applicable_plan_ids, p.id] })}
                        className={`text-xs px-3 py-1 rounded-full ring-1 ${on ? "bg-primary/20 text-brass ring-primary/40" : "bg-secondary text-toast ring-border"}`}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Create Offer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {offers.map((o) => (
          <div key={o.id} className="bg-card rounded-2xl p-4 ring-1 ring-border">
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="font-serif text-lg text-foreground">{o.name} <span className="text-brass text-sm font-mono">{o.code}</span></p>
                <p className="text-toast text-sm">
                  {o.discount_type === "percent" ? `${o.discount_value}% off` : `${fmtRand(o.discount_value)} off`}
                  {o.ends_at && ` · ends ${new Date(o.ends_at).toLocaleDateString()}`}
                </p>
                <p className="text-toast text-xs mt-1">
                  Used {o.current_redemptions}{o.max_redemptions ? ` / ${o.max_redemptions}` : ""} · per user {o.per_user_limit}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={o.is_active} onCheckedChange={() => toggle(o)} />
                <button onClick={() => remove(o.id)} className="p-2 text-toast hover:text-destructive"><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        ))}
        {offers.length === 0 && <p className="text-toast text-center py-8">No offers yet.</p>}
      </div>
    </div>
  );
};
