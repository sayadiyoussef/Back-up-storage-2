// client/src/pages/clients.tsx
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { PlusCircle, Pencil, Trash2, Search, RefreshCw, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

/* -----------------------------------------
   Types
----------------------------------------- */
type Market = "LOCAL" | "EXPORT";
type Client = {
  id: string;
  name: string;
  market: Market;
  terms: string; // côté serveur le champ standardisé est "terms"
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  taxId?: string | null;
  incoterm?: string | null;
  notes?: string | null;
  updatedAt?: string;
};

/* -----------------------------------------
   Helpers réseau (pas de dépendance à lib/api)
----------------------------------------- */
const fetchJSON = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  const txt = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${txt || ""}`);
  return txt ? JSON.parse(txt) : {};
};

/* -----------------------------------------
   Page Clients
----------------------------------------- */
export default function ClientsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  /* ---------- Query clients ---------- */
  const {
    data: clientsRes,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: () => fetchJSON("/api/clients"),
  });

  const rows: Client[] = useMemo(() => (clientsRes as any)?.data ?? [], [clientsRes]);

  /* ---------- Recherche / Tri / Pagination ---------- */
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<keyof Client>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((c) => {
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.city?.toLowerCase().includes(needle) ?? false) ||
        (c.country?.toLowerCase().includes(needle) ?? false) ||
        (c.email?.toLowerCase().includes(needle) ?? false) ||
        (c.phone?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [rows, q]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = (a[sortKey] ?? "") as any;
      const vb = (b[sortKey] ?? "") as any;
      const sa = typeof va === "string" ? va.toLowerCase() : va;
      const sb = typeof vb === "string" ? vb.toLowerCase() : vb;
      if (sa < sb) return sortDir === "asc" ? -1 : 1;
      if (sa > sb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const toggleSort = (key: keyof Client) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  /* ---------- Modal Create/Edit ---------- */
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  type ClientForm = {
    name: string;
    market: Market;
    paymentTerms: string; // champ UI; on mappe vers "terms" côté API
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    taxId?: string;
    incoterm?: string;
    notes?: string;
  };

  const emptyForm: ClientForm = {
    name: "",
    market: "LOCAL",
    paymentTerms: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    taxId: "",
    incoterm: "",
    notes: "",
  };

  const [form, setForm] = useState<ClientForm>(emptyForm);
  const resetForm = () => setForm(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      market: c.market ?? "LOCAL",
      paymentTerms: c.terms ?? "",
      contactName: c.contactName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      country: c.country ?? "",
      taxId: c.taxId ?? "",
      incoterm: c.incoterm ?? "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  /* ---------- Mutations ---------- */
  const saveClient = useMutation({
    mutationFn: async (payload: ClientForm) => {
      const body: any = {
        name: payload.name,
        market: payload.market,
        // Normalisation vers le backend: terms
        terms: payload.paymentTerms,
        contactName: payload.contactName || undefined,
        email: payload.email || undefined,
        phone: payload.phone || undefined,
        address: payload.address || undefined,
        city: payload.city || undefined,
        country: payload.country || undefined,
        taxId: payload.taxId || undefined,
        incoterm: payload.incoterm || undefined,
        notes: payload.notes || undefined,
      };

      if (editingId) {
        return fetchJSON(`/api/clients/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      return fetchJSON(`/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      setOpen(false);
      toast({ title: "Client enregistré", description: "Les données ont été mises à jour." });
    },
    onError: (e: any) => {
      toast({
        title: "Erreur",
        description: e?.message || "Échec de l’enregistrement du client",
        variant: "destructive",
      });
    },
  });

  const delClient = useMutation({
    mutationFn: async (id: string) => fetchJSON(`/api/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client supprimé" });
    },
    onError: (e: any) => {
      toast({
        title: "Erreur",
        description: e?.message || "Échec de la suppression du client",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex h-screen bg-trading-dark text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />

        <main className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Clients</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-8 bg-black/40 border-gray-700"
                  placeholder="Rechercher (nom, ville, pays, email)…"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Button
                variant="outline"
                className="border-gray-600 text-white"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Rafraîchir"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Rafraîchir
              </Button>
              <Button className="bg-trading-blue" onClick={openCreate}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Nouveau client
              </Button>
            </div>
          </div>

          <Card className="bg-trading-slate border-gray-700">
            <CardContent className="p-0">
              {error ? (
                <div className="p-4 text-red-400">Erreur de chargement.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-black/20 text-gray-300">
                        <tr className="text-left select-none">
                          <Th onClick={() => toggleSort("name")} label="Nom" active={sortKey === "name"} dir={sortDir} />
                          <Th onClick={() => toggleSort("market")} label="Marché" active={sortKey === "market"} dir={sortDir} />
                          <th className="py-3 px-3">Conditions paiement</th>
                          <Th onClick={() => toggleSort("city")} label="Ville" active={sortKey === "city"} dir={sortDir} />
                          <Th onClick={() => toggleSort("country")} label="Pays" active={sortKey === "country"} dir={sortDir} />
                          <th className="py-3 px-3">Contact</th>
                          <th className="py-3 px-3">Email</th>
                          <th className="py-3 px-3">Téléphone</th>
                          <th className="py-3 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-200">
                        {pageRows.map((c) => (
                          <tr key={c.id} className="border-t border-gray-700">
                            <td className="py-2 px-3">{c.name}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`text-xs px-2 py-1 rounded-full border ${
                                  c.market === "LOCAL"
                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-600/40"
                                    : "bg-blue-500/15 text-blue-300 border-blue-600/40"
                                }`}
                              >
                                {c.market}
                              </span>
                            </td>
                            <td className="py-2 px-3">{c.terms || "—"}</td>
                            <td className="py-2 px-3">{c.city || "—"}</td>
                            <td className="py-2 px-3">{c.country || "—"}</td>
                            <td className="py-2 px-3">{c.contactName || "—"}</td>
                            <td className="py-2 px-3">{c.email || "—"}</td>
                            <td className="py-2 px-3">{c.phone || "—"}</td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  className="border-gray-600 text-white"
                                  onClick={() => openEdit(c)}
                                  title="Modifier"
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Modifier
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => {
                                    if (confirm(`Supprimer ${c.name} ?`)) delClient.mutate(c.id);
                                  }}
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Supprimer
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {pageRows.length === 0 && (
                          <tr>
                            <td className="py-6 px-3 text-gray-400" colSpan={9}>
                              Aucun client.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between p-3 border-t border-gray-700">
                    <div className="text-sm text-gray-400">
                      {sorted.length} client{sorted.length > 1 ? "s" : ""} — page {pageSafe}/{totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="border-gray-600"
                        size="sm"
                        disabled={pageSafe <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Précédent
                      </Button>
                      <Button
                        variant="outline"
                        className="border-gray-600"
                        size="sm"
                        disabled={pageSafe >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Suivant
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* ---------- Modal Create/Edit ---------- */}
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[980px]">
            <div className="text-lg font-semibold mb-3">
              {editingId ? "Modifier un client" : "Nouveau client"}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-sm">Nom</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

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

              <div className="col-span-3">
                <Label className="text-sm">Conditions de paiement</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  placeholder="ex: 60 j / A vue / Comptant…"
                  value={form.paymentTerms}
                  onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">Contact</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Email</Label>
                <Input
                  type="email"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Téléphone</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div className="col-span-3">
                <Label className="text-sm">Adresse</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">Ville</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Pays</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-sm">Tax ID</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-sm">Incoterm</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.incoterm}
                  onChange={(e) => setForm({ ...form, incoterm: e.target.value })}
                />
              </div>

              <div className="col-span-3">
                <Label className="text-sm">Notes</Label>
                <Textarea
                  className="bg-black/40 border-gray-700 text-white"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                  if (!form.name.trim()) return alert("Le nom du client est requis.");
                  if (!form.paymentTerms.trim())
                    return alert("Les conditions de paiement sont requises.");
                  saveClient.mutate(form);
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

/* -----------------------------------------
   Sous-composant : TH triable
----------------------------------------- */
function Th({
  label,
  onClick,
  active,
  dir,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th
      className="py-3 px-3 cursor-pointer select-none"
      onClick={onClick}
      title="Trier"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-4 w-4 ${active ? "text-white" : "text-gray-500"}`}
          style={{
            transform: active && dir === "desc" ? "scaleY(-1)" : "none",
            transition: "transform 120ms ease",
          }}
        />
      </span>
    </th>
  );
}
