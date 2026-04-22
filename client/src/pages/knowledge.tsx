import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type KBItem = {
  id: string;
  title: string;
  link?: string;
  tags: string[];
  excerpt?: string;
  content?: string;
  updatedAt: string | number | Date;
};

type AskResponse = {
  answer: string;
  sources?: { title: string; path: string }[];
  suggestions?: string[];
  error?: string;
};

export default function KnowledgePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/knowledge", q],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      if (!res.ok) throw new Error("fetch knowledge failed");
      return res.json(); // { data: KBItem[] }
    },
  });

  const items: KBItem[] = (data?.data as KBItem[]) ?? [];

  // Upload (lien)
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [tags, setTags] = useState("");

  const upload = useMutation({
    mutationFn: async () => {
      const payload = { title: title.trim(), link: link.trim(), tags: tags.split(",").map(t=>t.trim()).filter(Boolean) };
      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("upload failed");
      return res.json();
    },
    onSuccess: () => {
      setTitle(""); setLink(""); setTags("");
      qc.invalidateQueries({ queryKey: ["/api/knowledge"] });
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const hay = `${it.title ?? ""} ${(it.tags??[]).join(" ")} ${it.excerpt ?? ""} ${it.content ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [items, q]);

  // Chatbot
  type ChatMsg = { role: "user" | "assistant"; text: string };
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: "assistant", text: "Bonjour 👋 Posez une question sur la base de connaissance. Je répondrai à partir des documents indexés et je fournirai les sources et des suggestions." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollToEnd = () => endRef.current?.scrollIntoView({behavior:"smooth"});
  useEffect(scrollToEnd, [msgs, busy]);

  const sendQuestion = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    setMsgs(m => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data: AskResponse = await res.json();
      if (data.error) {
        setMsgs(m => [...m, { role: "assistant", text: `Erreur: ${data.error}` }]);
      } else {
        const lines = [
          data.answer ?? "Pas de réponse.",
          data.sources?.length ? "\nSources :\n" + data.sources.map(s => `• ${s.title} (${s.path})`).join("\n") : "",
          data.suggestions?.length ? "\nSuggestions :\n" + data.suggestions.map(s => `• ${s}`).join("\n") : ""
        ].join("\n").trim();
        setMsgs(m => [...m, { role: "assistant", text: lines }]);
      }
    } catch {
      setMsgs(m => [...m, { role: "assistant", text: "Impossible d'appeler /api/knowledge/ask. Vérifie que le backend tourne." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-trading-dark text-white">
      <Sidebar />
      <div className="flex-1 overflow-hidden flex flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Recherche + liste */}
          <Card className="bg-trading-slate border-gray-700">
            <CardHeader className="md:flex md:items-center md:justify-between gap-3">
              <CardTitle className="text-white">Base de connaissance</CardTitle>
              <Input placeholder="Rechercher un document…" value={q} onChange={(e)=>setQ(e.target.value)} className="w-full md:w-72" />
            </CardHeader>
            <CardContent>
              {isLoading ? <div className="text-gray-400">Chargement…</div>
                : isError ? <div className="text-red-400">Impossible de charger les documents. Vérifie <code>/api/knowledge</code>.</div>
                : filtered.length === 0 ? <div className="text-gray-400">Aucun résultat</div>
                : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map((it) => (
                      <div key={it.id} className="border border-gray-700 rounded-lg p-4 bg-gray-800/60">
                        <div className="text-white font-semibold">{it.title}</div>
                        {it.excerpt ? <div className="text-gray-300 text-sm mt-1">{it.excerpt}</div> : null}
                        <div className="text-xs text-gray-500 mt-1">{it.updatedAt ? new Date(it.updatedAt).toLocaleDateString() : null}</div>
                        {it.link ? <a href={it.link} target="_blank" rel="noreferrer" className="text-trading-blue text-sm underline mt-2 inline-block">Ouvrir</a> : null}
                        {it.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {it.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded bg-gray-700 text-xs">#{t}</span>)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Upload (lien) */}
          <Card className="bg-trading-slate border-gray-700">
            <CardHeader><CardTitle className="text-white">Ajouter un document (lien)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-sm">Titre</Label>
                  <Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Ex: Rapport hebdo EIA" />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm">Lien</Label>
                  <Input value={link} onChange={(e)=>setLink(e.target.value)} placeholder="URL, chemin réseau ou lien interne" />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-sm">Tags (séparés par une virgule)</Label>
                  <Input value={tags} onChange={(e)=>setTags(e.target.value)} placeholder="ex: eia, stocks, brent" />
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button className="bg-trading-blue hover:bg-trading-blue/80" onClick={()=>upload.mutate()} disabled={!title.trim() || !link.trim() || upload.isPending}>
                    {upload.isPending ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
                <p className="md:col-span-3 text-xs text-gray-400">
                  Pour l’upload de fichiers (PDF/Word), prévoir une route <code>POST /api/knowledge/upload-file</code> (multipart) côté serveur.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Chatbot IA */}
          <Card className="bg-trading-slate border-gray-700">
            <CardHeader><CardTitle className="text-white">Assistant IA (Base de connaissance)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-2">
                {msgs.map((m,i)=>(
                  <div key={i} className={m.role==="user"?"text-right":"text-left"}>
                    <div className={m.role==="user"?"inline-block bg-blue-600/70 px-3 py-2 rounded-lg":"inline-block bg-gray-800 px-3 py-2 rounded-lg"}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {busy && <div className="text-sm text-gray-400">Analyse en cours…</div>}
                <div ref={endRef} />
              </div>
              <div className="flex gap-2">
                <Input placeholder="Votre question…" value={chatInput} onChange={(e)=>setChatInput(e.target.value)} onKeyDown={(e)=> e.key==="Enter" ? sendQuestion() : undefined} />
                <Button className="bg-trading-blue hover:bg-trading-blue/80" onClick={sendQuestion} disabled={busy}>Envoyer</Button>
              </div>
              <p className="text-xs text-gray-400">
                Endpoint attendu : <code>/api/knowledge/ask</code>. Le bot répond à partir des documents indexés.
              </p>
            </CardContent>
          </Card>

        </main>
      </div>
    </div>
  );
}
