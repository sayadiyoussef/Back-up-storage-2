import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Copy, Trash2, PlusCircle, X, CalendarDays } from "lucide-react";

/* ------------------- Types ------------------- */
type OilGrade = { id: number; name: string };
type GradeAllocation = { gradeId?: number; gradeName: string; qty: number };
type Fixing = {
  id?: string;
  vessel?: string;
  grade?: string;
  volume?: number | string;
};

type Vessel = {
  id?: string;
  name: string;
  type: string;
  dwt: number | string;
  status: string;
  eta?: string;
  origin?: string;
  destination?: string;

  // Nouveaux champs
  tender?: string;
  supplier?: string;
  quantityTotal?: number | string;
  gradeAllocations?: GradeAllocation[];
};

/* ------------------- Utils ------------------- */
const fetchJSON = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} ${t || ""}`.trim());
  return t ? JSON.parse(t) : null;
};

const formatDateFr = (value?: string) => {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return String(value);
  return day + "/" + month + "/" + year;
};

const toNumber = (v: any) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export default function Navires() {
  const qc = useQueryClient();
  const etaInputRef = useRef<HTMLInputElement | null>(null);

  /* --------- Data --------- */
  const { data: vesselsRes } = useQuery({ queryKey: ["/api/vessels"], queryFn: () => fetchJSON("/api/vessels") });
  const rows: Vessel[] = useMemo(() => (vesselsRes as any)?.data ?? [], [vesselsRes]);

  const { data: fixingsRes } = useQuery({ queryKey: ["/api/fixings"], queryFn: () => fetchJSON("/api/fixings") });
  const fixings: Fixing[] = useMemo(() => (fixingsRes as any)?.data ?? [], [fixingsRes]);

  const vesselRemainingById = useMemo(() => {
    const result = new Map<string, Array<{ gradeName: string; plannedQty: number; fixedQty: number; remainingQty: number }>>();

    for (const vessel of rows) {
      const planned = new Map<string, { gradeName: string; qty: number }>();
      for (const allocation of vessel.gradeAllocations || []) {
        const gradeName = String(allocation.gradeName || "").trim();
        if (!gradeName) continue;
        const key = gradeName.toLowerCase();
        const current = planned.get(key);
        planned.set(key, {
          gradeName,
          qty: (current?.qty || 0) + toNumber(allocation.qty),
        });
      }

      const fixed = new Map<string, number>();
      const vesselName = String(vessel.name || "").trim().toLowerCase();
      for (const fixing of fixings) {
        if (String(fixing.vessel || "").trim().toLowerCase() !== vesselName) continue;
        const gradeName = String(fixing.grade || "").trim();
        if (!gradeName) continue;
        const key = gradeName.toLowerCase();
        fixed.set(key, (fixed.get(key) || 0) + toNumber(fixing.volume));
      }

      const remaining = Array.from(planned.entries()).map(([key, value]) => {
        const fixedQty = fixed.get(key) || 0;
        return {
          gradeName: value.gradeName,
          plannedQty: value.qty,
          fixedQty,
          remainingQty: Math.max(0, value.qty - fixedQty),
        };
      });

      if (vessel.id) result.set(vessel.id, remaining);
    }

    return result;
  }, [rows, fixings]);

  const tenderGroups = useMemo(() => {
    const sorted = [...rows].sort((a: any, b: any) => {
      const tenderCmp = String(a.tender || "Sans tender").localeCompare(String(b.tender || "Sans tender"));
      if (tenderCmp !== 0) return tenderCmp;

      const dateA = a.eta ? new Date(a.eta).getTime() : Number.POSITIVE_INFINITY;
      const dateB = b.eta ? new Date(b.eta).getTime() : Number.POSITIVE_INFINITY;
      if (dateA !== dateB) return dateA - dateB;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    const groups = new Map<string, Vessel[]>();
    for (const vessel of sorted) {
      const key = String((vessel as any).tender || "").trim() || "Sans tender";
      groups.set(key, [...(groups.get(key) || []), vessel]);
    }

    return Array.from(groups.entries()).map(([tender, vessels]) => ({ tender, vessels }));
  }, [rows]);

  const { data: gradesRes } = useQuery({ queryKey: ["/api/grades"], queryFn: () => fetchJSON("/api/grades") });
  const grades: OilGrade[] = useMemo(() => (gradesRes as any)?.data ?? [], [gradesRes]);

  /* --------- Modal / Form --------- */
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm: Vessel = {
    id: undefined,
    name: "",
    type: "Tanker",
    dwt: "",
    status: "Planned",
    eta: "",
    origin: "",
    destination: "",
    tender: "",
    supplier: "",
    quantityTotal: "",
    gradeAllocations: [],
  };
  const [form, setForm] = useState<Vessel>(emptyForm);

  const resetForm = () => setForm(emptyForm);

  /* --------- Mutations --------- */
  const saveVessel = useMutation({
    mutationFn: async (payload: Vessel) => {
      const headers = { "Content-Type": "application/json" };

      // Normalisation payload (qty & allocations)
      const quantityTotalNum = payload.quantityTotal === "" ? undefined : toNumber(payload.quantityTotal);
      const gradeAllocations = (payload.gradeAllocations || [])
        .map((a) => ({
          gradeId: a.gradeId ? Number(a.gradeId) : undefined,
          gradeName:
            a.gradeName ||
            (grades.find((g) => g.id === a.gradeId)?.name ?? ""),
          qty: toNumber(a.qty),
        }))
        .filter((a) => a.gradeName && a.qty > 0);

      const body = JSON.stringify({
        ...payload,
        dwt: toNumber(payload.dwt),
        quantityTotal: quantityTotalNum,
        gradeAllocations,
      });

      if (editingId) {
        // PUT edit
        const res = await fetch(`/api/vessels/${editingId}`, { method: "PUT", headers, body });
        if (!res.ok) {
          // si 404 (ex: reset serveur), fallback POST
          if (res.status === 404) {
            const res2 = await fetch(`/api/vessels`, { method: "POST", headers, body });
            if (!res2.ok) {
              const t2 = await res2.text().catch(() => "");
              throw new Error(`${res2.status} ${res2.statusText} ${t2 || ""}`.trim());
            }
            return res2.json();
          }
          const text = await res.text().catch(() => "");
          throw new Error(`${res.status} ${res.statusText} ${text || ""}`.trim());
        }
        return res.json();
      }

      // POST create
      const res = await fetch(`/api/vessels`, { method: "POST", headers, body });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text || ""}`.trim());
      }
      return res.json();
    },
    onSuccess: (resp: any) => {
      const saved: Vessel = resp?.data;
      qc.setQueryData(["/api/vessels"], (prev: any) => {
        const arr = (prev?.data ?? []) as Vessel[];
        if (!saved) return prev;
        if (editingId) {
          const i = arr.findIndex((v) => v.id === editingId || v.id === saved.id);
          if (i !== -1) {
            const next = arr.slice();
            next[i] = saved;
            return { data: next };
          }
        }
        return { data: [saved, ...arr] };
      });
      qc.invalidateQueries({ queryKey: ["/api/vessels"] });
      qc.refetchQueries({ queryKey: ["/api/vessels"] });
      setOpen(false);
      setEditingId(null);
    },
    onError: (err: any) => {
      alert(`Erreur lors de l’enregistrement du navire:\n${err?.message || err}`);
    },
  });

  const delVessel = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/vessels/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text || ""}`.trim());
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vessels"] });
    },
    onError: (err: any) => {
      alert(`Erreur lors de la suppression du navire:\n${err?.message || err}`);
    },
  });

  /* --------- Helpers allocations --------- */
  const addAllocation = () =>
    setForm((f) => ({
      ...f,
      gradeAllocations: [...(f.gradeAllocations ?? []), { gradeId: undefined, gradeName: "", qty: 0 }],
    }));

  const removeAllocation = (idx: number) =>
    setForm((f) => ({
      ...f,
      gradeAllocations: (f.gradeAllocations ?? []).filter((_, i) => i !== idx),
    }));

  const updateAllocation = (idx: number, patch: Partial<GradeAllocation>) =>
    setForm((f) => {
      const list = (f.gradeAllocations ?? []).slice();
      list[idx] = { ...list[idx], ...patch };
      return { ...f, gradeAllocations: list };
    });

  const sumAlloc = (form.gradeAllocations ?? []).reduce((acc, a) => acc + toNumber(a.qty), 0);
  const cap = toNumber(form.quantityTotal);
  const overCap = cap > 0 && sumAlloc > cap;

  /* --------- UI --------- */
  return (
    <div className="flex h-screen bg-trading-dark text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Vessels</h2>
            <Button
              className="bg-trading-blue"
              onClick={() => {
                setEditingId(null);
                resetForm();
                setOpen(true);
              }}
            >
              Add Vessel
            </Button>
          </div>

          <div className="space-y-4">
            {tenderGroups.length === 0 ? (
              <Card className="bg-trading-slate border-gray-700">
                <CardContent className="py-6 text-gray-400">Aucun navire enregistré.</CardContent>
              </Card>
            ) : (
              tenderGroups.map((group) => (
                <Card key={group.tender} className="bg-trading-slate border-gray-700">
                  <CardContent>
                    <div className="flex items-center justify-between py-3 border-b border-gray-700">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{group.tender}</h3>
                        <div className="text-xs text-gray-400">
                          {group.vessels.length} navire{group.vessels.length > 1 ? "s" : ""} — classés par ETA
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-gray-300">
                          <tr className="text-left">
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Supplier</th>
                            <th className="py-2 px-3">Qty (MT)</th>
                            <th className="py-2 px-3">Reste à fixer</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">ETA</th>
                            <th className="py-2 px-3">Destination</th>
                            <th className="py-2 px-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-200">
                          {group.vessels.map((r: any) => {
                            const remainingRows = r.id ? vesselRemainingById.get(r.id) || [] : [];
                            const hasRemainingInfo = remainingRows.length > 0;

                            return (
                              <tr key={r.id} className="border-t border-gray-700 align-top">
                                <td className="py-2 px-3">{r.name}</td>
                                <td className="py-2 px-3">{r.supplier || "—"}</td>
                                <td className="py-2 px-3">{r.quantityTotal ?? "—"}</td>
                                <td className="py-2 px-3">
                                  {hasRemainingInfo ? (
                                    <div className="space-y-1">
                                      {remainingRows.map((item) => (
                                        <div
                                          key={item.gradeName}
                                          className={item.remainingQty > 0 ? "text-amber-300" : "text-green-400"}
                                          title={`Planifié: ${item.plannedQty.toLocaleString()} MT | Fixé: ${item.fixedQty.toLocaleString()} MT`}
                                        >
                                          {item.remainingQty.toLocaleString()} MT {item.gradeName}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-gray-500">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3">{r.status}</td>
                              <td className="py-2 px-3">{r.eta || "—"}</td>
                              <td className="py-2 px-3">{r.destination || "—"}</td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Modifier"
                                    onClick={() => {
                                      setEditingId(r.id);
                                      setForm({
                                        id: r.id,
                                        name: r.name ?? "",
                                        type: r.type ?? "Tanker",
                                        dwt: r.dwt ?? "",
                                        status: r.status ?? "Unknown",
                                        eta: r.eta ?? "",
                                        origin: r.origin ?? "",
                                        destination: r.destination ?? "",
                                        tender: r.tender ?? "",
                                        supplier: r.supplier ?? "",
                                        quantityTotal: r.quantityTotal ?? "",
                                        gradeAllocations: Array.isArray(r.gradeAllocations) ? r.gradeAllocations : [],
                                      });
                                      setOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Dupliquer"
                                    onClick={() => {
                                      setEditingId(null);
                                      setForm({
                                        id: undefined,
                                        name: r.name ?? "",
                                        type: r.type ?? "Tanker",
                                        dwt: r.dwt ?? "",
                                        status: r.status ?? "Unknown",
                                        eta: r.eta ?? "",
                                        origin: r.origin ?? "",
                                        destination: r.destination ?? "",
                                        tender: r.tender ?? "",
                                        supplier: r.supplier ?? "",
                                        quantityTotal: r.quantityTotal ?? "",
                                        gradeAllocations: Array.isArray(r.gradeAllocations) ? r.gradeAllocations : [],
                                      });
                                      setOpen(true);
                                    }}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Supprimer"
                                    onClick={() => {
                                      if (!r.id) return;
                                      if (confirm(`Supprimer le navire "${r.name}" ?`)) {
                                        delVessel.mutate(r.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </main>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[980px]">
            <div className="text-lg font-semibold mb-3">
              {editingId ? "Edit Vessel" : "New Vessel"}
            </div>

            <div className="grid grid-cols-4 gap-3">
              {/* Col 1 */}
              <div className="col-span-2">
                <Label className="text-sm">Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm">Status</Label>
                <Input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm">Destination</Label>
                <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
              </div>

              <div>
                <Label className="text-sm">Tender</Label>
                <Input value={form.tender ?? ""} onChange={(e) => setForm({ ...form, tender: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm">Supplier</Label>
                <Input value={form.supplier ?? ""} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
              </div>
              <div>
                <Label className="text-sm">Quantity (MT)</Label>
                <Input
                  inputMode="decimal"
                  value={form.quantityTotal ?? ""}
                  onChange={(e) => setForm({ ...form, quantityTotal: e.target.value })}
                />
              </div>

              {/* ETA */}
              <div>
                <Label className="text-sm">ETA</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    readOnly
                    placeholder="jj/mm/aaaa"
                    className="bg-black/40 border-gray-700 text-white cursor-pointer"
                    value={formatDateFr(form.eta ? String(form.eta).slice(0, 10) : "")}
                    onClick={() => {
                      const input = etaInputRef.current;
                      if (!input) return;
                      if (typeof (input as any).showPicker === "function") (input as any).showPicker();
                      else input.click();
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border-gray-700 bg-white text-black hover:bg-gray-200"
                    onClick={() => {
                      const input = etaInputRef.current;
                      if (!input) return;
                      if (typeof (input as any).showPicker === "function") (input as any).showPicker();
                      else input.click();
                    }}
                    aria-label="Choisir une date ETA"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                  <input
                    ref={etaInputRef}
                    type="date"
                    className="sr-only"
                    value={form.eta ? String(form.eta).slice(0, 10) : ""}
                    onChange={(e) => setForm({ ...form, eta: e.target.value })}
                    tabIndex={-1}
                  />
                </div>
              </div>


            </div>

            {/* Allocations par grade */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Grades planifiés</div>
                <Button variant="outline" size="sm" onClick={addAllocation}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Ajouter une ligne
                </Button>
              </div>

              <div className="rounded-lg border border-gray-700 p-3">
                {(form.gradeAllocations ?? []).length === 0 ? (
                  <div className="text-gray-400 text-sm">Aucune allocation définie.</div>
                ) : (
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6 text-xs text-gray-400">Grade</div>
                    <div className="col-span-4 text-xs text-gray-400">Qty (MT)</div>
                    <div className="col-span-2 text-xs text-gray-400">Actions</div>

                    {(form.gradeAllocations ?? []).map((a, idx) => (
                      <div className="contents" key={idx}>
                        <div className="col-span-6">
                          <select
                            className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3"
                            value={a.gradeId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value ? Number(e.target.value) : undefined;
                              const g = grades.find((gg) => gg.id === id);
                              updateAllocation(idx, { gradeId: id, gradeName: g?.name ?? "" });
                            }}
                          >
                            <option value="">Sélectionner…</option>
                            {grades.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <Input
                            inputMode="decimal"
                            value={a.qty}
                            onChange={(e) => updateAllocation(idx, { qty: toNumber(e.target.value) })}
                          />
                        </div>
                        <div className="col-span-2 flex items-center">
                          <Button variant="ghost" size="icon" title="Supprimer" onClick={() => removeAllocation(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer allocations */}
                <div className="mt-3 text-sm">
                  Somme des allocations :{" "}
                  <span className={overCap ? "text-red-400 font-medium" : "text-gray-100"}>
                    {sumAlloc.toLocaleString()} MT
                  </span>
                  {cap > 0 && (
                    <>
                      {" "}
                      / Capacité : <span className="text-gray-100">{cap.toLocaleString()} MT</span>
                      {overCap && <span className="text-red-400 ml-2">(dépasse la capacité)</span>}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-trading-blue"
                onClick={() => {
                  if (!form.name) return alert("Name requis.");
                  if (toNumber(form.quantityTotal) > 0 && sumAlloc > toNumber(form.quantityTotal)) {
                    return alert("La somme des allocations dépasse la quantité totale.");
                  }
                  saveVessel.mutate(form);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
