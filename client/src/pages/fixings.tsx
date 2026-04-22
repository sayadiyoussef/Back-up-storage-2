import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Copy, Trash2, Mail, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";

// --- Types locaux minimalistes (compat) ---
type Fixing = {
  id?: string;
  code?: string;
  date: string;
  route: string;
  grade: string;
  volume: string;
  priceUsd: number | string;
  counterparty: string;
  vessel?: string;
  freightUsd?: number | string;
};

type Vessel = { id?: string; name: string; supplier?: string };
type Grade = { id: number; name: string; freightUsd?: number };

type FixingGroup = {
  vessel: string;
  totalQuantity: number;
  items: Fixing[];
  totalsByGrade: { grade: string; quantity: number }[];
};

// Date locale -> "YYYY-MM-DD"
const todayLocalISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const fetchJSON = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  const text = await res.text();

  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    const serverMessage =
      payload?.message ||
      (typeof payload === "string" ? payload : "") ||
      res.statusText;

    throw new Error(`${res.status} ${serverMessage}`);
  }

  return payload;
};

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? Number(n) : 0;
};

const parseVolumeTons = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : 0;
};

const fmtUSD = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(2));
const fmtTons = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(2));

export default function FixingsPage() {
  const qc = useQueryClient();

  const { data: fixingsRes } = useQuery({
    queryKey: ["/api/fixings"],
    queryFn: () => fetchJSON("/api/fixings"),
  });
  const { data: vesselsRes } = useQuery({
    queryKey: ["/api/vessels"],
    queryFn: () => fetchJSON("/api/vessels"),
  });
  const { data: gradesRes } = useQuery({
    queryKey: ["/api/grades"],
    queryFn: () => fetchJSON("/api/grades"),
  });

  const rows: Fixing[] = useMemo(() => (fixingsRes as any)?.data ?? [], [fixingsRes]);
  const vessels: Vessel[] = useMemo(() => (vesselsRes as any)?.data ?? [], [vesselsRes]);
  const grades: Grade[] = useMemo(() => (gradesRes as any)?.data ?? [], [gradesRes]);

  const groupedRows: FixingGroup[] = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { vessel: string; totalQuantity: number; items: Fixing[]; byGrade: Map<string, number> }>();

    rows.forEach((r) => {
      const key = (r.vessel && String(r.vessel).trim()) || "Sans vessel";
      if (!map.has(key)) {
        map.set(key, { vessel: key, totalQuantity: 0, items: [], byGrade: new Map() });
        order.push(key);
      }
      const group = map.get(key)!;
      const qty = parseVolumeTons(r.volume);
      group.items.push(r);
      group.totalQuantity += qty;
      const gradeKey = (r.grade && String(r.grade).trim()) || "Sans grade";
      group.byGrade.set(gradeKey, (group.byGrade.get(gradeKey) || 0) + qty);
    });

    return order.map((key) => {
      const group = map.get(key)!;
      return {
        vessel: group.vessel,
        totalQuantity: group.totalQuantity,
        items: group.items,
        totalsByGrade: Array.from(group.byGrade.entries()).map(([grade, quantity]) => ({
          grade,
          quantity,
        })),
      };
    });
  }, [rows]);

  const [collapsedVessels, setCollapsedVessels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedVessels((prev) => {
      const next = { ...prev };
      groupedRows.forEach((group) => {
        if (!(group.vessel in next)) next[group.vessel] = false;
      });
      return next;
    });
  }, [groupedRows]);

  const toggleVessel = (vessel: string) => {
    setCollapsedVessels((prev) => ({ ...prev, [vessel]: !prev[vessel] }));
  };

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Fixing>({
    date: todayLocalISO(),
    route: "",
    grade: "",
    volume: "",
    priceUsd: "",
    counterparty: "",
    vessel: "",
    freightUsd: "",
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewFixing, setViewFixing] = useState<Fixing | null>(null);

  const [mailOpen, setMailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");

  const resetForm = () =>
    setForm({
      date: todayLocalISO(),
      route: "",
      grade: "",
      volume: "",
      priceUsd: "",
      counterparty: "",
      vessel: "",
      freightUsd: "",
    });

  useEffect(() => {
    if (!form.grade) return;
    const g = grades.find((gr) => gr.name === form.grade);
    setForm((prev) => ({
      ...prev,
      freightUsd: g?.freightUsd ?? "",
    }));
  }, [form.grade, grades]);

  const [prefilledOnce, setPrefilledOnce] = useState(false);
  useEffect(() => {
    if (prefilledOnce) return;
    if (!grades.length) return;

    const sp = new URLSearchParams(window.location.search);
    if (sp.get("newFromMarket") === "1") {
      const gradeName = sp.get("grade") || "";
      const fobStr = sp.get("fob") || "";
      const g = grades.find((gr) => gr.name === gradeName);

      setEditingId(null);
      setForm({
        date: todayLocalISO(),
        route: "MAL → TUN",
        grade: gradeName,
        volume: "",
        priceUsd: fobStr || "",
        counterparty: "",
        vessel: "",
        freightUsd: typeof g?.freightUsd === "number" ? g!.freightUsd : "",
      });
      setOpen(true);
      setPrefilledOnce(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [grades, prefilledOnce]);

  const saveFixing = useMutation({
    mutationFn: async (payload: Fixing) => {
      const isEdit = !!editingId;
      const url = isEdit ? `/api/fixings/${editingId}` : "/api/fixings";
      const method = isEdit ? "PUT" : "POST";

      return fetchJSON(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (res: any) => {
      const saved = res?.data;

      qc.setQueryData(["/api/fixings"], (prev: any) => {
        const prevArr: Fixing[] = prev?.data ?? [];
        if (!saved) return prev;

        if (editingId) {
          return {
            data: prevArr.map((f) => (f.id === saved.id ? saved : f)),
          };
        }

        return { data: [saved, ...prevArr] };
      });

      qc.invalidateQueries({ queryKey: ["/api/fixings"] });

      setOpen(false);
      setEditingId(null);
      resetForm();
    },
    onError: (e: any) => {
      console.error("SAVE FIXING ERROR:", e);
      alert(`Erreur lors de l'enregistrement:\n${e?.message || e}`);
    },
  });

  const delFixing = useMutation({
    mutationFn: async (id: string) =>
      fetchJSON(`/api/fixings/${id}`, { method: "DELETE" }),

    onSuccess: (_res: any, id: string) => {
      qc.setQueryData(["/api/fixings"], (prev: any) => {
        const prevArr: Fixing[] = prev?.data ?? [];
        return { data: prevArr.filter((f) => f.id !== id) };
      });

      qc.invalidateQueries({ queryKey: ["/api/fixings"] });

      if (viewOpen && viewFixing?.id === id) {
        setViewOpen(false);
        setViewFixing(null);
      }
    },

    onError: (e: any) => {
      console.error("DELETE FIXING ERROR:", e);
      alert(`Erreur lors de la suppression:\n${e?.message || e}`);
    },
  });

  const exportExcel = () => {
    alert("Export Excel en cours (placeholder)");
  };

  const getEffectiveFreight = (f: Fixing): string => {
    if (f.freightUsd !== undefined && f.freightUsd !== null && String(f.freightUsd) !== "") {
      return String(f.freightUsd);
    }
    const g = grades.find((gr) => gr.name === f.grade);
    if (g && typeof g.freightUsd !== "undefined" && g.freightUsd !== null) {
      return String(g.freightUsd);
    }
    return "";
  };

  const openMailForSelection = () => {
    const sel = rows.filter((r) => r.id && selectedIds.has(r.id));
    if (!sel.length) {
      alert("Veuillez sélectionner au moins un fixing.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const uniqueVessels = Array.from(new Set(sel.map((s) => s.vessel || ""))).filter(Boolean);
    const subject = uniqueVessels.length === 1 ? `Fixing ${today} ${uniqueVessels[0]}` : `Fixing ${today}`;

    const byVessel = new Map<string, Fixing[]>();
    sel.forEach((s) => {
      const key = s.vessel || "—";
      if (!byVessel.has(key)) byVessel.set(key, []);
      byVessel.get(key)!.push(s);
    });

    const lines: string[] = [];
    lines.push("Dear all,");
    lines.push("Please consider our fixing as following;");
    lines.push("");

    for (const [ves, list] of byVessel) {
      if (ves && ves !== "—") lines.push(ves);
      list.forEach((it) => {
        const fob = toNum(it.priceUsd);
        const frStr = getEffectiveFreight(it);
        const fr = toNum(frStr);
        const total = fob + fr;

        const fobTxt = fmtUSD(fob);
        const frTxt = fmtUSD(fr);
        const totTxt = fmtUSD(total);

        lines.push(`${it.volume} ${it.grade} @ ${fobTxt} + ${frTxt} = ${totTxt}$`);
        lines.push("");
      });
    }
    lines.push("Please confirm,");

    setMailSubject(subject);
    setMailBody(lines.join("\n"));
    setMailOpen(true);
  };

  const allIds = useMemo(() => rows.map((r) => r.id).filter(Boolean) as string[], [rows]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = allIds.some((id) => selectedIds.has(id)) && !allSelected;
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <div className="flex h-screen bg-trading-dark text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Fixings</h2>
            <div className="flex gap-2">
              <Button className="bg-emerald-600" onClick={exportExcel} title="Export Excel">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                className="bg-trading-blue"
                onClick={() => {
                  setEditingId(null);
                  resetForm();
                  setOpen(true);
                }}
              >
                New Fixing
              </Button>
              <Button
                variant="outline"
                className="border-gray-600 text-white"
                onClick={openMailForSelection}
                title="Envoyer par mail"
              >
                <Mail className="h-4 w-4 mr-2" />
                Mail
              </Button>
            </div>
          </div>

          <Card className="bg-trading-slate border-gray-700">
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-gray-300">
                    <tr className="text-left">
                      <th className="py-2 px-3">
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          className="accent-trading-blue"
                          checked={allSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(allIds));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                          title="Tout sélectionner"
                        />
                      </th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3">Volume</th>
                      <th className="py-2 px-3">FOB</th>
                      <th className="py-2 px-3">Freight</th>
                      <th className="py-2 px-3">Counterparty</th>
                      <th className="py-2 px-3">Vessel</th>
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200">
                    {groupedRows.map((group) => {
                      const isCollapsed = !!collapsedVessels[group.vessel];
                      return (
                        <Fragment key={`group-${group.vessel}`}>
                          <tr className="border-t border-gray-600 bg-white/5">
                            <td className="py-2 px-3">
                              <button
                                type="button"
                                onClick={() => toggleVessel(group.vessel)}
                                className="inline-flex items-center justify-center rounded hover:bg-white/10 p-1"
                                title={isCollapsed ? "Déplier" : "Replier"}
                              >
                                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="py-2 px-3 font-semibold" colSpan={3}>
                              {group.vessel}
                            </td>
                            <td className="py-2 px-3 font-semibold">
                              {fmtTons(group.totalQuantity)} T
                            </td>
                            <td className="py-2 px-3 text-gray-300" colSpan={5}>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span className="text-gray-400">Total fixé</span>
                                {group.totalsByGrade.map((g) => (
                                  <span key={`${group.vessel}-${g.grade}`} className="text-xs text-gray-200">
                                    {g.grade}: {fmtTons(g.quantity)} T
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>

                          {!isCollapsed &&
                            group.items.map((r: any, idx: number) => (
                              <tr
                                key={r.id || `${group.vessel}-${idx}`}
                                className="border-t border-gray-700 hover:bg-white/5 cursor-pointer transition-colors"
                                onClick={() => {
                                  setViewFixing(r);
                                  setViewOpen(true);
                                }}
                              >
                                <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="accent-trading-blue"
                                    checked={r.id ? selectedIds.has(r.id) : false}
                                    onChange={(e) => {
                                      if (!r.id) return;
                                      setSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(r.id!);
                                        else next.delete(r.id!);
                                        return next;
                                      });
                                    }}
                                    title="Sélectionner ce fixing"
                                  />
                                </td>
                                <td className="py-2 px-3">{r.date}</td>
                                <td className="py-2 px-3">{r.grade}</td>
                                <td className="py-2 px-3">{r.volume}</td>
                                <td className="py-2 px-3">{r.priceUsd}</td>
                                <td className="py-2 px-3">{getEffectiveFreight(r)}</td>
                                <td className="py-2 px-3">{r.counterparty}</td>
                                <td className="py-2 px-3">{r.vessel || "—"}</td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <span>{r.code || "—"}</span>
                                    {r.code && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        title="Copy code"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(r.code!);
                                        }}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Modifier"
                                      onClick={() => {
                                        setEditingId(r.id || null);
                                        setForm({
                                          date: r.date ?? "",
                                          route: r.route ?? "",
                                          grade: r.grade ?? "",
                                          volume: r.volume ?? "",
                                          priceUsd: r.priceUsd ?? "",
                                          counterparty: r.counterparty ?? "",
                                          vessel: r.vessel ?? "",
                                          freightUsd: r.freightUsd ?? getEffectiveFreight(r) ?? "",
                                          code: r.code,
                                          id: r.id,
                                        } as Fixing);
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
                                          date: r.date ?? "",
                                          route: r.route ?? "",
                                          grade: r.grade ?? "",
                                          volume: r.volume ?? "",
                                          priceUsd: r.priceUsd ?? "",
                                          counterparty: r.counterparty ?? "",
                                          vessel: r.vessel ?? "",
                                          freightUsd: r.freightUsd ?? getEffectiveFreight(r) ?? "",
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
                                      disabled={delFixing.isPending}
                                      onClick={() => {
                                        if (!r.id) return;
                                        if (confirm("Supprimer ce fixing ?")) {
                                          delFixing.mutate(r.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Envoyer par mail"
                                      onClick={() => {
                                        const s = new Set<string>();
                                        if (r.id) s.add(r.id);
                                        setSelectedIds(s);
                                        openMailForSelection();
                                      }}
                                    >
                                      <Mail className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[780px]">
            <div className="text-lg font-semibold mb-3">
              {editingId ? "Edit Fixing" : "New Fixing"}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Date</Label>
                <Input
                  type="date"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">Grade</Label>
                <select
                  className="h-9 w-full rounded-md bg-black/40 border border-gray-700 text-white px-3"
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                >
                  <option value="" className="bg-gray-900">Select grade…</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.name} className="bg-gray-900">
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-sm">Volume</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.volume}
                  onChange={(e) => setForm({ ...form, volume: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">FOB (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="bg-black/40 border-gray-700 text-white"
                  value={String(form.priceUsd)}
                  onChange={(e) => setForm({ ...form, priceUsd: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">Freight (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="bg-black/40 border-gray-700 text-white"
                  placeholder={form.grade ? "Auto from grade" : "Select a grade first"}
                  value={String(form.freightUsd ?? "")}
                  onChange={(e) => setForm({ ...form, freightUsd: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">Counterparty</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.counterparty}
                  onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">Vessel</Label>
                <select
                  className="h-9 w-full rounded-md bg-black/40 border border-gray-700 text-white px-3"
                  value={form.vessel || ""}
                  onChange={(e) => {
                    const vesselName = e.target.value;
                    const selectedVessel = vessels.find((v) => v.name === vesselName);
                    setForm({
                      ...form,
                      vessel: vesselName,
                      counterparty: selectedVessel?.supplier ? String(selectedVessel.supplier) : form.counterparty,
                    });
                  }}
                >
                  <option value="" className="bg-gray-900">—</option>
                  {vessels.map((v) => (
                    <option key={v.id || v.name} value={v.name} className="bg-gray-900">
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {editingId && form.code && (
                <div className="col-span-2">
                  <Label className="text-sm">Code</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      disabled
                      className="bg-black/40 border-gray-700 text-white opacity-70"
                      value={form.code}
                      onChange={() => {}}
                    />
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(form.code!)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" disabled={saveFixing.isPending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-trading-blue"
                disabled={saveFixing.isPending}
                onClick={() => {
                  if (saveFixing.isPending) return;

                  const payload: Fixing = {
                    ...form,
                    priceUsd: form.priceUsd === "" ? "" : Number(form.priceUsd),
                    freightUsd:
                      form.freightUsd === "" || form.freightUsd === undefined
                        ? undefined
                        : Number(form.freightUsd),
                  };

                  console.log("PAYLOAD FIXING:", payload);
                  saveFixing.mutate(payload);
                }}
              >
                {saveFixing.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewOpen && viewFixing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setViewOpen(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-[700px]" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-4">Fixing Details</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Code:</span> {viewFixing.code || "—"}</div>
              <div><span className="text-gray-400">Date:</span> {viewFixing.date}</div>
              <div><span className="text-gray-400">Route:</span> {viewFixing.route}</div>
              <div><span className="text-gray-400">Grade:</span> {viewFixing.grade}</div>
              <div><span className="text-gray-400">Volume:</span> {viewFixing.volume}</div>
              <div><span className="text-gray-400">FOB (USD):</span> {viewFixing.priceUsd}</div>
              <div><span className="text-gray-400">Freight (USD):</span> {getEffectiveFreight(viewFixing)}</div>
              <div><span className="text-gray-400">Counterparty:</span> {viewFixing.counterparty}</div>
              <div><span className="text-gray-400">Vessel:</span> {viewFixing.vessel || "—"}</div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button
                variant="outline"
                onClick={() => setViewOpen(false)}
              >
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(viewFixing.id || null);
                  setForm({
                    id: viewFixing.id,
                    code: viewFixing.code,
                    date: viewFixing.date,
                    route: viewFixing.route,
                    grade: viewFixing.grade,
                    volume: viewFixing.volume,
                    priceUsd: viewFixing.priceUsd,
                    counterparty: viewFixing.counterparty,
                    vessel: viewFixing.vessel,
                    freightUsd: viewFixing.freightUsd ?? getEffectiveFreight(viewFixing) ?? "",
                  });
                  setViewOpen(false);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              {viewFixing.id && (
                <Button
                  variant="destructive"
                  disabled={delFixing.isPending}
                  onClick={() => {
                    if (confirm("Supprimer ce fixing ?")) {
                      delFixing.mutate(viewFixing.id!);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              {viewFixing.id && (
                <Button asChild className="bg-emerald-600">
                  <a href={`/api/fixings/${viewFixing.id}/export`} target="_blank" rel="noreferrer">
                    Export CSV
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {mailOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[720px]">
            <div className="text-lg font-semibold mb-3">Send Fixings by Email</div>

            <div className="mb-3">
              <Label className="text-sm">To</Label>
              <Input
                className="bg-black/40 border-gray-700 text-white"
                placeholder="recipient1@example.com, recipient2@example.com"
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <Label className="text-sm">Subject</Label>
              <Input
                className="bg-black/40 border-gray-700 text-white"
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-sm">Body</Label>
              <textarea
                className="w-full h-64 rounded-md bg-black/40 border border-gray-700 text-white p-3"
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setMailOpen(false)}>Cancel</Button>
              <Button
                className="bg-trading-blue"
                onClick={() => {
                  alert(`Send email to: ${mailTo || "(no recipients)"}\n\nSubject: ${mailSubject}\n\n${mailBody}`);
                  setMailOpen(false);
                }}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
