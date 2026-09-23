import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, Edit3, ImagePlus, Plus, Send, X } from "lucide-react";

type CatalogBadge = any;
const emptyForm = {
  name: "", description: "", category: "achievement", achievementType: "tiered",
  triggerType: "metric", triggerKey: "", triggerConfig: "{}", imagePath: "",
  lockedHint: "", tiers: "[]",
};

export default function BadgeCatalogAdmin() {
  const client = useQueryClient();
  const { data: catalog = [], isLoading } = useQuery<CatalogBadge[]>({ queryKey: ["/api/admin/badges/catalog"] });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        triggerConfig: JSON.parse(form.triggerConfig || "{}"),
        tiers: JSON.parse(form.tiers || "[]"),
        achievementType: form.category === "achievement" ? form.achievementType : null,
      };
      const response = await apiRequest(editingId ? "PATCH" : "POST", editingId ? `/api/admin/badges/catalog/${editingId}` : "/api/admin/badges/catalog", payload);
      if (!response.ok) throw new Error((await response.json()).message || "Could not save badge");
    },
    onSuccess: () => { setForm(emptyForm); setEditingId(null); setError(""); client.invalidateQueries({ queryKey: ["/api/admin/badges/catalog"] }); },
    onError: (reason: any) => setError(reason.message),
  });
  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => apiRequest("POST", `/api/admin/badges/catalog/${id}/${action}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["/api/admin/badges/catalog"] }),
  });
  const active = useMemo(() => catalog.filter((badge) => badge.status !== "archived"), [catalog]);

  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const edit = (badge: CatalogBadge) => {
    setEditingId(badge.id);
    setForm({
      name: badge.name, description: badge.description, category: badge.category,
      achievementType: badge.achievementType || "tiered", triggerType: badge.triggerType,
      triggerKey: badge.triggerKey || "", triggerConfig: JSON.stringify(badge.triggerConfig || {}),
      imagePath: badge.imagePath || "", lockedHint: badge.lockedHint || "",
      tiers: JSON.stringify((badge.tiers || []).map((tier: any) => ({ tier: tier.tier, threshold: tier.threshold, imagePath: tier.imagePath || "", color: tier.color || "" }))),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const getUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/admin/badges/artwork/upload");
    const result = await response.json();
    return { method: "PUT" as const, url: result.uploadURL, path: result.path };
  };

  return (
    <div className="min-h-screen bg-[#0a1520] px-4 py-7 text-[#e8e4dc] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[.28em] text-[#c9a84c]">Administration</p><h1 className="mt-2 text-3xl font-bold">Badge Catalog</h1><p className="mt-2 text-sm text-[#8096aa]">Create and publish artwork, categories, triggers, and tier thresholds without a deployment.</p></div>
          <a href="/trophy-case" className="text-sm text-[#c9a84c]">View Trophy Case</a>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="rounded-2xl border border-[#29425b] bg-[#0d1b2a] p-5">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-semibold">{editingId ? "Edit badge definition" : "New badge definition"}</h2>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="text-[#8096aa]"><X size={18} /></button>}</div>
          <div className="grid gap-4 md:grid-cols-2">
            {(["name", "description", "lockedHint", "triggerKey"] as const).map((key) => <label key={key} className="text-xs uppercase tracking-wider text-[#8096aa]">{key === "lockedHint" ? "Locked hint" : key.replace(/[A-Z]/g, (letter) => ` ${letter}`)}<input value={form[key]} onChange={(event) => setField(key, event.target.value)} className="mt-1 w-full rounded-lg border border-[#29425b] bg-[#101f2e] px-3 py-2 text-sm text-white outline-none focus:border-[#c9a84c]" required={key === "name" || key === "description"} /></label>)}
             <label className="text-xs uppercase tracking-wider text-[#8096aa]">
               Category
               <Select value={form.category} onValueChange={(value) => setField("category", value)}>
                 <SelectTrigger className="mt-1 w-full border-[#29425b] bg-[#101f2e] text-sm text-white">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent className="border-[#29425b] bg-[#101f2e] text-white">
                   <SelectItem value="nhl_trophy" className="focus:bg-[#263c52] focus:text-white">League Awards</SelectItem>
                   <SelectItem value="team_badge" className="focus:bg-[#263c52] focus:text-white">Team Awards</SelectItem>
                   <SelectItem value="achievement" className="focus:bg-[#263c52] focus:text-white">Achievements</SelectItem>
                 </SelectContent>
               </Select>
             </label>
             <label className="text-xs uppercase tracking-wider text-[#8096aa]">
               Achievement type
               <Select value={form.achievementType} onValueChange={(value) => setField("achievementType", value)} disabled={form.category !== "achievement"}>
                 <SelectTrigger className="mt-1 w-full border-[#29425b] bg-[#101f2e] text-sm text-white">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent className="border-[#29425b] bg-[#101f2e] text-white">
                   <SelectItem value="tiered" className="focus:bg-[#263c52] focus:text-white">Tiered</SelectItem>
                   <SelectItem value="multiplier" className="focus:bg-[#263c52] focus:text-white">Multiplier</SelectItem>
                   <SelectItem value="onetime" className="focus:bg-[#263c52] focus:text-white">One-time</SelectItem>
                 </SelectContent>
               </Select>
             </label>
             <label className="text-xs uppercase tracking-wider text-[#8096aa]">
               Trigger type
               <Select value={form.triggerType} onValueChange={(value) => setField("triggerType", value)}>
                 <SelectTrigger className="mt-1 w-full border-[#29425b] bg-[#101f2e] text-sm text-white">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent className="border-[#29425b] bg-[#101f2e] text-white">
                   <SelectItem value="metric" className="focus:bg-[#263c52] focus:text-white">Metric</SelectItem>
                   <SelectItem value="event" className="focus:bg-[#263c52] focus:text-white">Event</SelectItem>
                   <SelectItem value="manual" className="focus:bg-[#263c52] focus:text-white">Manual</SelectItem>
                 </SelectContent>
               </Select>
             </label>
            <label className="text-xs uppercase tracking-wider text-[#8096aa]">Trigger configuration JSON<input value={form.triggerConfig} onChange={(event) => setField("triggerConfig", event.target.value)} className="mt-1 w-full rounded-lg border border-[#29425b] bg-[#101f2e] px-3 py-2 font-mono text-sm text-white" placeholder='{"threshold": 3}' /></label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-xs uppercase tracking-wider text-[#8096aa]">Artwork path<input value={form.imagePath} onChange={(event) => setField("imagePath", event.target.value)} className="mt-1 w-full rounded-lg border border-[#29425b] bg-[#101f2e] px-3 py-2 text-sm text-white" placeholder="/badge-assets/..." /></label>
            <div><span className="text-xs uppercase tracking-wider text-[#8096aa]">Upload artwork</span><ObjectUploader maxNumberOfFiles={1} maxFileSize={15728640} onGetUploadParameters={getUploadParameters} onComplete={(result: any) => result.successful?.[0]?.path && setField("imagePath", result.successful[0].path)}><span className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#c9a84c]/60 px-3 py-2 text-sm text-[#c9a84c]"><ImagePlus size={16} /> Choose image</span></ObjectUploader></div>
          </div>
          <label className="mt-4 block text-xs uppercase tracking-wider text-[#8096aa]">Tiers JSON <textarea value={form.tiers} onChange={(event) => setField("tiers", event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[#29425b] bg-[#101f2e] px-3 py-2 font-mono text-sm text-white" placeholder='[{"tier":"bronze","threshold":1,"imagePath":""}]' /></label>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={mutation.isPending} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#c9a84c] px-4 py-2 text-sm font-bold text-[#0a1520]"><Plus size={16} /> {mutation.isPending ? "Saving…" : editingId ? "Save changes" : "Create draft"}</button>
        </form>
        <div className="mt-8 space-y-3">{isLoading && <p className="text-[#8096aa]">Loading catalog…</p>}{active.map((badge) => <div key={badge.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#29425b] bg-[#0d1b2a] p-4"><div className="flex min-w-0 items-center gap-3">{badge.imagePath ? <img src={badge.imagePath} className="h-12 w-12 rounded-full object-contain" alt="" /> : <div className="h-12 w-12 rounded-full bg-[#c9a84c] p-3 text-center text-[8px] font-bold text-[#0a1520]">?</div>}<div><p className="font-semibold">{badge.name}</p><p className="text-xs uppercase tracking-wider text-[#8096aa]">{badge.category} · {badge.triggerType}{badge.triggerKey ? ` · ${badge.triggerKey}` : ""}</p></div></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] uppercase ${badge.status === "published" ? "bg-emerald-900/40 text-emerald-300" : "bg-[#263c52] text-[#a6b5c2]"}`}>{badge.status}</span><button onClick={() => edit(badge)} className="rounded-lg border border-[#29425b] p-2 text-[#a6b5c2]"><Edit3 size={15} /></button>{badge.status !== "published" && <button onClick={() => statusMutation.mutate({ id: badge.id, action: "publish" })} className="rounded-lg border border-[#c9a84c]/50 p-2 text-[#c9a84c]"><Send size={15} /></button>}{badge.status !== "archived" && <button onClick={() => statusMutation.mutate({ id: badge.id, action: "archive" })} className="rounded-lg border border-red-900/60 p-2 text-red-300"><Archive size={15} /></button>}</div></div>)}</div>
      </div>
    </div>
  );
}