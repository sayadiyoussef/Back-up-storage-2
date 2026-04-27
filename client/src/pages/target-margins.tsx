// client/src/pages/target-margins.tsx
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, PlusCircle, RefreshCw, Upload, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Market = "LOCAL" | "EXPORT";
type Client = { id: string; name: string; market: Market };
type Product = { id: string; name: string };
type TargetMargin = {
  id?: string;
  market: Market;
  clientId?: string;
  clientName: string;
  productId?: string;
  productName: string;
  marginTnd?: number | null;
  marginUsd?: number | null;
  updatedAt?: string;
};

const fetchJSON = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) {
    const msg = payload?.message || (typeof payload === "string" ? payload : "") || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return payload;
};

const toNumberOrUndefined = (value: any) => {
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
};

const emptyForm: TargetMargin = {
  market: "LOCAL",
  clientId: "",
  clientName: "",
  productId: "",
  productName: "",
  marginTnd: undefined,
  marginUsd: undefined,
};

function parseImportText(text: string): TargetMargin[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const splitLine = (line: string) => {
    if (line.includes("\t")) return line.split("\t");
    if (line.includes(";")) return line.split(";");
    return line.split(",");
  };

  const rawRows = lines.map(splitLine).map((cols) => cols.map((c) => c.trim().replace(/^"|"$/g, "")));
  const first = rawRows[0].map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => c.includes("march") || c.includes("client") || c.includes("produit"));
  const rows = hasHeader ? rawRows.slice(1) : rawRows;

  return rows.map((cols) => {
    const market = String(cols[0] || "LOCAL").trim().toUpperCase() === "EXPORT" ? "EXPORT" : "LOCAL";
    const marginTnd = toNumberOrUndefined(cols[3]);
    const marginUsd = toNumberOrUndefined(cols[4]);
    return {
      market,
      clientName: cols[1] || "",
      productName: cols[2] || "",
      marginTnd,
      marginUsd,
    } as TargetMargin;
  }).filter((r) => r.clientName && r.productName && (r.market === "LOCAL" ? r.marginTnd !== undefined : r.marginUsd !== undefined));
}

export default function TargetMarginsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TargetMargin>(emptyForm);
  const [pasteText, setPasteText] = useState("");

  const { data: marginsRes, isFetching, refetch } = useQuery({ queryKey: ["/api/target-margins"], queryFn: () => fetchJSON("/api/target-margins") });
  const rows: TargetMargin[] = useMemo(() => (marginsRes as any)?.data ?? [], [marginsRes]);

  const { data: clientsRes } = useQuery({ queryKey: ["/api/clients"], queryFn: () => fetchJSON("/api/clients") });
  const clients: Client[] = useMemo(() => (clientsRes as any)?.data ?? [], [clientsRes]);

  const { data: productsRes } = useQuery({ queryKey: ["/api/products"], queryFn: () => fetchJSON("/api/products") });
  const products: Product[] = useMemo(() => (productsRes as any)?.data ?? [], [productsRes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      r.market.toLowerCase().includes(needle) ||
      r.clientName.toLowerCase().includes(needle) ||
      r.productName.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const saveMargin = useMutation({
    mutationFn: async (payload: TargetMargin) => {
      const body = {
        ...payload,
        marginTnd: payload.market === "LOCAL" ? toNumberOrUndefined(payload.marginTnd) : undefined,
        marginUsd: payload.market === "EXPORT" ? toNumberOrUndefined(payload.marginUsd) : undefined,
      };
      const url = editingId ? `/api/target-margins/${editingId}` : "/api/target-margins";
      const method = editingId ? "PUT" : "POST";
      return fetchJSON(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/target-margins"] });
      qc.invalidateQueries({ queryKey: ["/api/contracts"] });
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast({ title: "Marge cible enregistrée" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec de l'enregistrement", variant: "destructive" }),
  });

  const deleteMargin = useMutation({
    mutationFn: async (id: string) => fetchJSON(`/api/target-margins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/target-margins"] });
      toast({ title: "Marge cible supprimée" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e?.message || "Échec de la suppression", variant: "destructive" }),
  });

  const importMargins = useMutation({
    mutationFn: async (rowsToImport: TargetMargin[]) => fetchJSON("/api/target-margins/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowsToImport }),
    }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/target-margins"] });
      setPasteText("");
      toast({ title: "Import terminé", description: `${res?.data?.length ?? 0} lignes importées.` });
    },
    onError: (e: any) => toast({ title: "Erreur import", description: e?.message || "Import impossible", variant: "destructive" }),
  });

  const openEdit = (row: TargetMargin) => {
    setEditingId(row.id || null);
    setForm({ ...row });
    setOpen(true);
  };

  const handleClientChange = (id: string) => {
    const client = clients.find((c) => c.id === id);
    setForm((f) => ({ ...f, clientId: id, clientName: client?.name || f.clientName, market: client?.market || f.market }));
  };

  const handleProductChange = (id: string) => {
    const product = products.find((p) => p.id === id);
    setForm((f) => ({ ...f, productId: id, productName: product?.name || f.productName }));
  };

  const handleFileImport = async (file: File) => {
    const text = await file.text();
    const parsed = parseImportText(text);
    if (!parsed.length) {
      toast({ title: "Import impossible", description: "Aucune ligne valide trouvée. Utilise un fichier CSV/TSV exporté depuis Excel.", variant: "destructive" });
      return;
    }
    if (confirm(`Importer ${parsed.length} lignes et remplacer la table actuelle ?`)) importMargins.mutate(parsed);
  };

  return (
    <div className="flex h-screen bg-trading-dark text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Marges cibles</h2>
              <p className="text-sm text-gray-400">Objectifs de marge matière par marché, client et produit.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input className="pl-8 bg-black/40 border-gray-700" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Button variant="outline" className="border-gray-600 text-white" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className="h-4 w-4 mr-2" /> Rafraîchir
              </Button>
              <Button className="bg-trading-blue" onClick={() => { setEditingId(null); setForm(emptyForm); setOpen(true); }}>
                <PlusCircle className="h-4 w-4 mr-2" /> Nouvelle ligne
              </Button>
            </div>
          </div>

          <Card className="bg-trading-slate border-gray-700">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="flex-1">
                  <Label className="text-sm">Coller depuis Excel</Label>
                  <textarea
                    className="w-full min-h-[90px] rounded-md bg-black/40 border border-gray-700 text-white p-2 text-sm"
                    placeholder={'Marché\tClient\tProduit\tM/MAT TND\tM/MAT USD\nLOCAL\tGEPACO\tEMAS 360-7\t700\t'}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                </div>
                <div className="flex flex-col justify-end gap-2 lg:w-72">
                  <Button
                    variant="outline"
                    className="border-gray-600 text-white"
                    onClick={() => {
                      const parsed = parseImportText(pasteText);
                      if (!parsed.length) return toast({ title: "Aucune ligne valide", variant: "destructive" });
                      if (confirm(`Importer ${parsed.length} lignes et remplacer la table actuelle ?`)) importMargins.mutate(parsed);
                    }}
                  >
                    <Upload className="h-4 w-4 mr-2" /> Importer le collage
                  </Button>
                  <Button variant="outline" className="border-gray-600 text-white" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Importer CSV/TSV Excel
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".csv,.tsv,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileImport(file);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="text-xs text-gray-400">Pour un fichier .xlsx, fais Enregistrer sous CSV dans Excel ou colle directement les cellules ici.</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-trading-slate border-gray-700">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-black/20 text-gray-300">
                    <tr className="text-left">
                      <th className="py-2 px-3">Marché</th>
                      <th className="py-2 px-3">Client</th>
                      <th className="py-2 px-3">Produit</th>
                      <th className="py-2 px-3">M/MAT TND</th>
                      <th className="py-2 px-3">M/MAT USD</th>
                      <th className="py-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} className="py-4 px-3 text-gray-400">Aucune marge cible.</td></tr>
                    ) : filtered.map((row) => (
                      <tr key={row.id} className="border-t border-gray-700">
                        <td className="py-2 px-3">{row.market}</td>
                        <td className="py-2 px-3">{row.clientName}</td>
                        <td className="py-2 px-3">{row.productName}</td>
                        <td className="py-2 px-3">{row.marginTnd ?? "—"}</td>
                        <td className="py-2 px-3">{row.marginUsd ?? "—"}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => row.id && confirm("Supprimer cette marge cible ?") && deleteMargin.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[760px]">
            <div className="text-lg font-semibold mb-3">{editingId ? "Modifier marge cible" : "Nouvelle marge cible"}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marché</Label>
                <select className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value as Market, marginTnd: undefined, marginUsd: undefined })}>
                  <option value="LOCAL">LOCAL</option>
                  <option value="EXPORT">EXPORT</option>
                </select>
              </div>
              <div>
                <Label>Client</Label>
                <select className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3" value={form.clientId || ""} onChange={(e) => handleClientChange(e.target.value)}>
                  <option value="">Saisie libre</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Nom client</Label>
                <Input className="bg-black/40 border-gray-700" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value, clientId: "" })} />
              </div>
              <div>
                <Label>Produit</Label>
                <select className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3" value={form.productId || ""} onChange={(e) => handleProductChange(e.target.value)}>
                  <option value="">Saisie libre</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Nom produit</Label>
                <Input className="bg-black/40 border-gray-700" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value, productId: "" })} />
              </div>
              {form.market === "LOCAL" ? (
                <div>
                  <Label>M/MAT TND</Label>
                  <Input inputMode="decimal" className="bg-black/40 border-gray-700" value={form.marginTnd ?? ""} onChange={(e) => setForm({ ...form, marginTnd: toNumberOrUndefined(e.target.value), marginUsd: undefined })} />
                </div>
              ) : (
                <div>
                  <Label>M/MAT USD</Label>
                  <Input inputMode="decimal" className="bg-black/40 border-gray-700" value={form.marginUsd ?? ""} onChange={(e) => setForm({ ...form, marginUsd: toNumberOrUndefined(e.target.value), marginTnd: undefined })} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" className="border-gray-600 text-white" onClick={() => setOpen(false)}>Annuler</Button>
              <Button className="bg-trading-blue" onClick={() => saveMargin.mutate(form)} disabled={saveMargin.isPending}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
