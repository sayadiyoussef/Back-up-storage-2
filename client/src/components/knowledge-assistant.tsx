import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Msg = { role: "user" | "assistant"; text: string };
type KBResponse = { answer: string; sources: {title:string; path:string}[]; suggestions?: string[] };

export default function KnowledgeAssistant(){
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Bonjour 👋 Posez votre question. Je réponds à partir de la base de connaissance." }
  ]);

  async function send(){
    const text = q.trim();
    if (!text) return;
    setQ("");
    setMsgs(m => [...m, { role: "user", text }]);
    setBusy(true);
    try{
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text })
      });
      const data: KBResponse = await res.json();
      const lines = [
        data.answer,
        data.sources?.length ? "\nSources:\n" + data.sources.map(s=>`- ${s.title} (${s.path})`).join("\n") : "",
        data.suggestions?.length ? "\nSuggestions:\n" + data.suggestions.map(s=>`- ${s}`).join("\n") : ""
      ].join("\n");
      setMsgs(m => [...m, { role: "assistant", text: lines.trim() }]);
    }catch(e:any){
      setMsgs(m => [...m, { role: "assistant", text: "Erreur: " + (e?.message||e) }]);
    }finally{
      setBusy(false);
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-700 max-w-3xl">
      <CardHeader><CardTitle>Assistant Base de connaissance</CardTitle></CardHeader>
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
        </div>
        <div className="flex gap-2">
          <Input placeholder="Votre question…" value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>e.key==="Enter"?send():undefined}/>
          <Button className="bg-trading-blue hover:bg-trading-blue/80" onClick={send} disabled={busy}>Envoyer</Button>
        </div>
      </CardContent>
    </Card>
  );
}
