// client/src/pages/contracts.tsx
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, PlusCircle, RefreshCw, Search } from "lucide-react";

/** ---------- Types basiques (côté UI) ---------- */
type Market = "LOCAL" | "EXPORT";
type Client = { id: string; name: string; market: Market; terms?: string; paymentTerms?: string };
type Product = { id: string; name: string; reference?: string | null };

/**
 * Type interne UI (ne reflète pas exactement l'API, on fait le mapping).
 */
type ContractUI = {
  id?: string;
  code?: string;
  market: Market;
  clientId: string;
  clientName?: string;
  productId: string;
  productName?: string;
  quantityT: number;
  priceCurrency: "USD" | "TND";
  pricePerT: number; // prix/T dans la devise choisie
  fxRate: number; // taux de change (optionnel métier)
  dateStart: string; // YYYY-MM-DD
  dateEnd: string; // YYYY-MM-DD
  contractDate: string; // YYYY-MM-DD
  createdAt?: string;
  updatedAt?: string;
};

/** ---------- Helpers fetch ---------- */
const fetchJSON = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${text || ""}`);
  return JSON.parse(text);
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Normalise un contrat renvoyé par l’API (nouveau schéma) vers notre shape UI.
 * L’API renvoie : quantityTons, priceUsd/priceTnd, startDate/endDate, contractDate, market…
 */
function apiToUI(c: any): ContractUI {
  const quantityT = c.quantityT ?? c.quantityTons ?? 0;
  const dateStart = c.dateStart ?? c.startDate ?? c.contractDate ?? todayStr();
  const dateEnd = c.dateEnd ?? c.endDate ?? c.contractDate ?? todayStr();
  const contractDate = c.contractDate ?? c.date ?? todayStr();
  const priceCurrency: "USD" | "TND" = c.priceCurrency ?? (c.priceUsd != null ? "USD" : "TND");
  const pricePerT = priceCurrency === "USD" ? (c.pricePerT ?? c.priceUsd ?? 0) : (c.pricePerT ?? c.priceTnd ?? 0);

  return {
    id: c.id,
    code: c.code,
    market: c.market ?? "LOCAL",
    clientId: c.clientId,
    clientName: c.clientName,
    productId: c.productId,
    productName: c.productName,
    quantityT: Number(quantityT) || 0,
    priceCurrency,
    pricePerT: Number(pricePerT) || 0,
    fxRate: c.fxRate != null ? Number(c.fxRate) : 0,
    dateStart,
    dateEnd,
    contractDate,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * Mappe notre formulaire UI vers le payload attendu par l’API.
 * - quantityT   -> quantityTons
 * - pricePerT   -> priceUsd ou priceTnd selon priceCurrency
 * - dateStart   -> startDate
 * - dateEnd     -> endDate
 */
function uiToApiPayload(f: ContractUI) {
  const base: any = {
    clientId: f.clientId,
    productId: f.productId,
    quantityTons: Number(f.quantityT) || 0,
    priceCurrency: f.priceCurrency, // "USD" | "TND"
    fxRate: f.fxRate ? Number(f.fxRate) : undefined,
    contractDate: f.contractDate,
    startDate: f.dateStart,
    endDate: f.dateEnd,
    market: f.market,
  };

  if (f.priceCurrency === "USD") {
    base.priceUsd = Number(f.pricePerT) || 0;
  } else {
    base.priceTnd = Number(f.pricePerT) || 0;
  }

  return base;
}

export default function ContractsPage() {
  const qc = useQueryClient();

  /** --------- Data sources: clients & produits --------- */
  const {
    data: clientsRes,
    isFetching: fetchingClients,
    refetch: refetchClients,
  } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: () => fetchJSON("/api/clients"),
  });
  const clients: Client[] = useMemo(() => (clientsRes as any)?.data ?? [], [clientsRes]);

  const {
    data: productsRes,
    isFetching: fetchingProducts,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => fetchJSON("/api/products"),
  });
  const products: Product[] = useMemo(() => (productsRes as any)?.data ?? [], [productsRes]);

  /** --------- Contrats --------- */
  const {
    data: contractsRes,
    isLoading,
    isFetching,
    error,
    refetch: refetchContracts,
  } = useQuery({
    queryKey: ["/api/contracts"],
    queryFn: () => fetchJSON("/api/contracts"),
  });

  const rows: ContractUI[] = useMemo(() => {
    const raw = (contractsRes as any)?.data ?? [];
    return raw.map(apiToUI);
  }, [contractsRes]);

  /** --------- Recherche / Filtre --------- */
  const [q, setQ] = useState("");
  const [marketFilter, setMarketFilter] = useState<Market | "ALL">("ALL");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (marketFilter !== "ALL" && r.market !== marketFilter) return false;
      if (!needle) return true;
      return (
        (r.code || "").toLowerCase().includes(needle) ||
        (r.clientName || "").toLowerCase().includes(needle) ||
        (r.productName || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, marketFilter]);

  /** --------- UI state --------- */
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm: ContractUI = {
    clientId: "",
    productId: "",
    market: "LOCAL",
    quantityT: 0,
    priceCurrency: "USD",
    pricePerT: 0,
    fxRate: 3.2,
    dateStart: todayStr(),
    dateEnd: todayStr(),
    contractDate: todayStr(),
  };

  const [form, setForm] = useState<ContractUI>(emptyForm);
  const resetForm = () => setForm(emptyForm);

  /** --------- Mutations --------- */
  const saveContract = useMutation({
    mutationFn: async (payload: ContractUI) => {
      const isEdit = !!editingId;
      const url = isEdit ? `/api/contracts/${editingId}` : "/api/contracts";
      const method = isEdit ? "PUT" : "POST";

      const body = uiToApiPayload(payload);
      return fetchJSON(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: (res: any) => {
      const saved = apiToUI(res?.data);
      // maj cache (optimiste + refetch safe)
      qc.setQueryData(["/api/contracts"], (prev: any) => {
        const prevArr: ContractUI[] = (prev?.data ?? []).map(apiToUI);
        if (!saved) return prev;
        if (editingId) {
          const next = prevArr.map((c) => (c.id === saved.id ? saved : c));
          return { data: next };
        }
        return { data: [saved, ...prevArr] };
      });
      qc.invalidateQueries({ queryKey: ["/api/contracts"] });
      qc.refetchQueries({ queryKey: ["/api/contracts"] });
      setOpen(false);
      setEditingId(null);
      resetForm();
    },
    onError: (e: any) => {
      alert(`Erreur enregistrement contrat:\n${e?.message || e}`);
    },
  });

  const delContract = useMutation({
    mutationFn: async (id: string) => fetchJSON(`/api/contracts/${id}`, { method: "DELETE" }),
    onSuccess: (_res: any, id: string) => {
      qc.setQueryData(["/api/contracts"], (prev: any) => {
        const prevArr: ContractUI[] = (prev?.data ?? []).map(apiToUI);
        return { data: prevArr.filter((c) => c.id !== id) };
      });
      qc.invalidateQueries({ queryKey: ["/api/contracts"] });
      qc.refetchQueries({ queryKey: ["/api/contracts"] });
    },
    onError: (e: any) => {
      alert(`Erreur suppression contrat:\n${e?.message || e}`);
    },
  });

  /** --------- Helpers UI --------- */
  const selectedClient = clients.find((c) => c.id === form.clientId) || null;

  // Quand on change de client, caler le marché automatiquement
  const handleClientChange = (id: string) => {
    const c = clients.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      clientId: id,
      market: (c?.market as Market) ?? "LOCAL",
    }));
  };

  const currencySuffix = form.priceCurrency === "USD" ? "USD/T" : "TND/T";

  const doRefresh = () => {
    refetchClients();
    refetchProducts();
    refetchContracts();
  };

  return (
    <div className="flex h-screen bg-trading-dark text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-white">Contrats</h2>
              {(isFetching || fetchingClients || fetchingProducts) && (
                <span className="text-xs text-gray-400">MAJ…</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center bg-gray-900 border border-gray-700 rounded-md px-2">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  className="bg-transparent outline-none px-2 py-1 text-sm placeholder:text-gray-500"
                  placeholder="Rechercher code, client, produit…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <select
                className="h-9 rounded-md bg-gray-900 border border-gray-700 text-white px-3"
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value as any)}
              >
                <option value="ALL">Tous marchés</option>
                <option value="LOCAL">LOCAL</option>
                <option value="EXPORT">EXPORT</option>
              </select>
              <Button variant="outline" className="border-gray-600 text-white" onClick={doRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Rafraîchir
              </Button>
              <Button
                className="bg-trading-blue"
                onClick={() => {
                  setEditingId(null);
                  resetForm();
                  setOpen(true);
                }}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Créer un contrat
              </Button>
            </div>
          </div>

          <Card className="bg-trading-slate border-gray-700">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 text-gray-300">Chargement…</div>
              ) : error ? (
                <div className="p-4 text-red-400">Erreur de chargement</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-gray-300">Aucun contrat.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-gray-300 bg-black/20">
                      <tr className="text-left">
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3">Marché</th>
                        <th className="py-2 px-3">Client</th>
                        <th className="py-2 px-3">Produit</th>
                        <th className="py-2 px-3">Qté (T)</th>
                        <th className="py-2 px-3">Prix/T</th>
                        <th className="py-2 px-3">FX</th>
                        <th className="py-2 px-3">Début</th>
                        <th className="py-2 px-3">Fin</th>
                        <th className="py-2 px-3">Date contrat</th>
                        <th className="py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-200">
                      {filtered.map((r) => (
                        <tr key={r.id} className="border-t border-gray-700">
                          <td className="py-2 px-3">{r.code || "—"}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`text-xs px-2 py-1 rounded-full border ${
                                r.market === "LOCAL"
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-600/40"
                                  : "bg-blue-500/15 text-blue-300 border-blue-600/40"
                              }`}
                            >
                              {r.market}
                            </span>
                          </td>
                          <td className="py-2 px-3">{r.clientName || "—"}</td>
                          <td className="py-2 px-3">{r.productName || "—"}</td>
                          <td className="py-2 px-3">{r.quantityT?.toLocaleString() ?? "—"}</td>
                          <td className="py-2 px-3">
                            {r.pricePerT?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.priceCurrency}/T
                          </td>
                          <td className="py-2 px-3">{r.fxRate ?? "—"}</td>
                          <td className="py-2 px-3">{r.dateStart}</td>
                          <td className="py-2 px-3">{r.dateEnd}</td>
                          <td className="py-2 px-3">{r.contractDate}</td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Modifier"
                                onClick={() => {
                                  setEditingId(r.id || null);
                                  setForm({
                                    ...r,
                                    clientId: r.clientId,
                                    productId: r.productId,
                                    market: r.market,
                                  } as ContractUI);
                                  setOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Supprimer"
                                onClick={() => {
                                  if (!r.id) return;
                                  if (confirm("Supprimer ce contrat ?")) {
                                    delContract.mutate(r.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Modal Create/Edit */}
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[980px]">
            <div className="text-lg font-semibold mb-3">
              {editingId ? "Modifier un contrat" : "Nouveau contrat"}
            </div>

            <div className="grid grid-cols-4 gap-3">
              {/* Client */}
              <div className="col-span-2">
                <Label className="text-sm">Client</Label>
                <select
                  className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3"
                  value={form.clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                >
                  <option value="">Sélectionner…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{" "}
                      {c.terms
                        ? `(${c.terms})`
                        : c.paymentTerms
                        ? `(${c.paymentTerms})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Marché */}
              <div>
                <Label className="text-sm">Marché</Label>
                <select
                  className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3"
                  value={form.market}
                  onChange={(e) => setForm({ ...form, market: e.target.value as Market })}
                >
                  <option value="LOCAL">LOCAL</option>
                  <option value="EXPORT">EXPORT</option>
                </select>
              </div>

              {/* Date contrat */}
              <div>
                <Label className="text-sm">Date contrat</Label>
                <Input
                  type="date"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.contractDate}
                  onChange={(e) => setForm({ ...form, contractDate: e.target.value })}
                />
              </div>

              {/* Produit */}
              <div className="col-span-2">
                <Label className="text-sm">Produit</Label>
                <select
                  className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3"
                  value={form.productId}
                  onChange={(e) => setForm({ ...form, productId: e.target.value })}
                >
                  <option value="">Sélectionner…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Qté */}
              <div>
                <Label className="text-sm">Quantité (T)</Label>
                <Input
                  inputMode="decimal"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.quantityT}
                  onChange={(e) => setForm({ ...form, quantityT: Number(e.target.value) || 0 })}
                />
              </div>

              {/* Devise prix */}
              <div>
                <Label className="text-sm">Devise</Label>
                <select
                  className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3"
                  value={form.priceCurrency}
                  onChange={(e) => setForm({ ...form, priceCurrency: e.target.value as "USD" | "TND" })}
                >
                  <option value="USD">USD</option>
                  <option value="TND">TND</option>
                </select>
              </div>

              {/* Prix par tonne */}
              <div>
                <Label className="text-sm">Prix ({currencySuffix})</Label>
                <Input
                  inputMode="decimal"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.pricePerT}
                  onChange={(e) => setForm({ ...form, pricePerT: Number(e.target.value) || 0 })}
                />
              </div>

              {/* FX */}
              <div>
                <Label className="text-sm">Taux de change</Label>
                <Input
                  inputMode="decimal"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.fxRate}
                  onChange={(e) => setForm({ ...form, fxRate: Number(e.target.value) || 0 })}
                />
              </div>

              {/* Début / Fin */}
              <div>
                <Label className="text-sm">Date début</Label>
                <Input
                  type="date"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.dateStart}
                  onChange={(e) => setForm({ ...form, dateStart: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Date fin</Label>
                <Input
                  type="date"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.dateEnd}
                  onChange={(e) => setForm({ ...form, dateEnd: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                className="bg-trading-blue"
                onClick={() => {
                  if (!form.clientId) return alert("Choisis un client.");
                  if (!form.productId) return alert("Choisis un produit.");
                  if (!form.quantityT || form.quantityT <= 0) return alert("Saisis une quantité en tonnes.");
                  if (!form.pricePerT || form.pricePerT <= 0) return alert("Saisis un prix par tonne.");
                  if (!form.contractDate) return alert("La date de contrat est requise.");

                  const payload: ContractUI = { ...form };
                  saveContract.mutate(payload);
                }}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
