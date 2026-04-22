import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Grade = {
  id: number;
  name: string;
  region?: string;
  ffa?: string;
  moisture?: string;
  iv?: string;
  dobi?: string;
  freightUsd?: number;
};

export default function GradesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["/api/grades"] });
  const grades: Grade[] = (data as any)?.data ?? [];

  // --- Formulaire de création ---
  const [form, setForm] = useState({
    name: "",
    region: "",
    ffa: "",
    moisture: "",
    iv: "",
    dobi: "",
    freightUsd: "",
  });

  const createGrade = async () => {
    const name = form.name.trim();
    if (!name) {
      alert("Name is required");
      return;
    }
    try {
      const r = await fetch("/api/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          region: form.region || undefined,
          ffa: form.ffa || undefined,
          moisture: form.moisture || undefined,
          iv: form.iv || undefined,
          dobi: form.dobi || undefined,
          freightUsd:
            form.freightUsd === "" ? undefined : Number(form.freightUsd),
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        alert("Failed to create grade:\n" + t);
        return;
      }
      const j = await r.json();
      const created: Grade = j?.data;

      // Optimiste: ajouter le nouveau grade localement
      qc.setQueryData(["/api/grades"], (prev: any) => {
        const prevArr: Grade[] = Array.isArray(prev?.data) ? prev.data : [];
        return { data: [created, ...prevArr] };
      });

      // Invalidate pour rafraîchir toutes les vues liées
      await qc.invalidateQueries({ queryKey: ["/api/grades"] });
      await qc.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey?.[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/market"),
      });
      await qc.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey?.[0] === "string" &&
          (q.queryKey[0] as string).includes("/forwards"),
      });

      setForm({
        name: "",
        region: "",
        ffa: "",
        moisture: "",
        iv: "",
        dobi: "",
        freightUsd: "",
      });
    } catch (e: any) {
      alert("Network error while creating grade:\n" + (e?.message || e));
    }
  };

  // --- Édition (tous les champs) ---
  const [editOpen, setEditOpen] = useState(false);
  const [editGrade, setEditGrade] = useState<Grade | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    region: "",
    ffa: "",
    moisture: "",
    iv: "",
    dobi: "",
    freightUsd: "",
  });

  const openEdit = (g: Grade) => {
    setEditGrade(g);
    setEditForm({
      name: g.name || "",
      region: g.region || "",
      ffa: g.ffa || "",
      moisture: g.moisture || "",
      iv: g.iv || "",
      dobi: g.dobi || "",
      freightUsd:
        g.freightUsd === undefined || g.freightUsd === null
          ? ""
          : String(g.freightUsd),
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editGrade) return;
    const id = editGrade.id;

    // Corps de la requête : on envoie les champs tels quels
    // (le serveur convertira "" -> undefined pour les champs texte,
    // et pour freightUsd ""/null -> undefined, nombre sinon)
    const payload: any = {
      name: editForm.name.trim(),
      region: editForm.region,
      ffa: editForm.ffa,
      moisture: editForm.moisture,
      iv: editForm.iv,
      dobi: editForm.dobi,
      freightUsd:
        editForm.freightUsd.trim() === ""
          ? ""
          : Number(editForm.freightUsd.trim()),
    };

    // Validation légère côté client pour freight si non vide
    if (
      payload.freightUsd !== "" &&
      !Number.isFinite(Number(payload.freightUsd))
    ) {
      alert("Freight must be a number");
      return;
    }

    try {
      const r = await fetch(`/api/grades/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        alert("Failed to update grade:\n" + t);
        return;
      }
      const j = await r.json();
      const updated: Grade = j?.data;

      // Optimiste: remplace le grade dans le cache
      qc.setQueryData(["/api/grades"], (prev: any) => {
        const prevArr: Grade[] = Array.isArray(prev?.data) ? prev.data : [];
        const next = prevArr.map((g) => (g.id === updated.id ? updated : g));
        return { data: next };
      });

      // Invalidate pour forcer le recalcul/rafraîchissement ailleurs
      await qc.invalidateQueries({ queryKey: ["/api/grades"] });
      await qc.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey?.[0] === "string" &&
          (q.queryKey[0] as string).startsWith("/api/market"),
      });
      await qc.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey?.[0] === "string" &&
          (q.queryKey[0] as string).includes("/forwards"),
      });

      setEditOpen(false);
      setEditGrade(null);
    } catch (e: any) {
      alert("Network error while updating grade:\n" + (e?.message || e));
    }
  };

  return (
    <div className="flex h-screen bg-trading-dark text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="p-6 space-y-6">
          {/* --- Création d'un grade --- */}
          <Card className="bg-trading-slate border-gray-700">
            <CardContent className="p-4">
              <div className="text-lg font-semibold mb-3">Add a new grade</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <div>
                  <Label className="text-sm">Name *</Label>
                  <Input
                    className="bg-black/40 border-gray-700 text-white"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="ex: RBD PKS"
                  />
                </div>
                <div>
                  <Label className="text-sm">Region</Label>
                  <Input
                    className="bg-black/40 border-gray-700 text-white"
                    value={form.region}
                    onChange={(e) =>
                      setForm({ ...form, region: e.target.value })
                    }
                    placeholder="ex: Malaysia"
                  />
                </div>
                <div>
                  <Label className="text-sm">FFA</Label>
                  <Input
                    className="bg-black/40 border-gray-700 text-white"
                    value={form.ffa}
                    onChange={(e) => setForm({ ...form, ffa: e.target.value })}
                    placeholder="< 0.1%"
                  />
                </div>
                <div>
                  <Label className="text-sm">Moisture</Label>
                  <Input
                    className="bg-black/40 border-gray-700 text-white"
                    value={form.moisture}
                    onChange={(e) =>
                      setForm({ ...form, moisture: e.target.value })
                    }
                    placeholder="< 0.1%"
                  />
                </div>
                <div>
                  <Label className="text-sm">IV</Label>
                  <Input
                    className="bg-black/40 border-gray-700 text-white"
                    value={form.iv}
                    onChange={(e) => setForm({ ...form, iv: e.target.value })}
                    placeholder="56"
                  />
                </div>
                <div>
                  <Label className="text-sm">DOBI</Label>
                  <Input
                    className="bg-black/40 border-gray-700 text-white"
                    value={form.dobi}
                    onChange={(e) => setForm({ ...form, dobi: e.target.value })}
                    placeholder="2.4+"
                  />
                </div>
                <div>
                  <Label className="text-sm">Freight (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="bg-black/40 border-gray-700 text-white"
                    value={form.freightUsd}
                    onChange={(e) =>
                      setForm({ ...form, freightUsd: e.target.value })
                    }
                    placeholder="ex: 120"
                  />
                </div>
              </div>
              <div className="mt-4">
                <Button className="bg-trading-blue" onClick={createGrade}>
                  Save Grade
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* --- Liste & bouton Modifier --- */}
          <Card className="bg-trading-slate border-gray-700">
            <CardContent className="p-4">
              <div className="text-lg font-semibold mb-3">Existing Grades</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-gray-300">
                    <tr className="text-left">
                      <th className="py-2 px-3">ID</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Region</th>
                      <th className="py-2 px-3">FFA</th>
                      <th className="py-2 px-3">Moisture</th>
                      <th className="py-2 px-3">IV</th>
                      <th className="py-2 px-3">DOBI</th>
                      <th className="py-2 px-3">Freight (USD)</th>
                      <th className="py-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200">
                    {grades.map((g) => (
                      <tr key={g.id} className="border-t border-gray-700">
                        <td className="py-2 px-3">{g.id}</td>
                        <td className="py-2 px-3">{g.name}</td>
                        <td className="py-2 px-3">{g.region || "—"}</td>
                        <td className="py-2 px-3">{g.ffa || "—"}</td>
                        <td className="py-2 px-3">{g.moisture || "—"}</td>
                        <td className="py-2 px-3">{g.iv || "—"}</td>
                        <td className="py-2 px-3">{g.dobi || "—"}</td>
                        <td className="py-2 px-3">
                          {g.freightUsd !== undefined ? g.freightUsd : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <Button
                            variant="outline"
                            className="border-gray-600 text-white"
                            onClick={() => openEdit(g as Grade)}
                          >
                            Modifier
                          </Button>
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

      {/* --- Modal d'édition (tous les champs) --- */}
      {editOpen && editGrade && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[720px]">
            <div className="text-lg font-semibold mb-3">
              Modifier le grade #{editGrade.id}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-3">
                <Label className="text-sm">Name *</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="ex: RBD PKS"
                />
              </div>

              <div>
                <Label className="text-sm">Region</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={editForm.region}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, region: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-sm">FFA</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={editForm.ffa}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, ffa: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-sm">Moisture</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={editForm.moisture}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, moisture: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-sm">IV</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={editForm.iv}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, iv: e.target.value }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-sm">DOBI</Label>
                <Input
                  className="bg-black/40 border-gray-700 text-white"
                  value={editForm.dobi}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, dobi: e.target.value }))
                  }
                />
              </div>

              <div className="md:col-span-3">
                <Label className="text-sm">Freight (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="bg-black/40 border-gray-700 text-white"
                  value={editForm.freightUsd}
                  onChange={(e) =>
                    setEditForm((s) => ({ ...s, freightUsd: e.target.value }))
                  }
                  placeholder="ex: 120"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button className="bg-trading-blue" onClick={saveEdit}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
