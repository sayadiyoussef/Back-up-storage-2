import type { Express, Request, Response } from "express";
import { addLinkDoc, search, topContexts } from "./knowledge.store";

async function askLLM(question: string, context: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const first = context.split(/\n/).filter(Boolean).slice(0, 20).join("\n");
    return `Résumé (fallback, OPENAI_API_KEY absent):\n${first}`;
  }
  try {
    const body = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Tu es un assistant qui répond UNIQUEMENT à partir du contexte fourni. Si l'info n'est pas dans le contexte, dis-le et propose où chercher." },
        { role: "user", content: `Question:\n${question}\n\nContexte:\n${context}` }
      ],
      temperature: 0.2
    };
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const t = await res.text();
      return `Erreur LLM (${res.status}): ${t}`;
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "Pas de réponse.";
  } catch (e:any) {
    return `Erreur appel LLM: ${e?.message || e}`;
  }
}

export function registerKnowledgeRoutes(app: Express) {
  app.get("/api/knowledge", (req: Request, res: Response) => {
    const q = (req.query.q || "").toString();
    const rows = search(q);
    res.json({ data: rows });
  });

  app.post("/api/knowledge/upload", (req: Request, res: Response) => {
    const title = (req.body?.title || "").toString();
    const link = (req.body?.link || "").toString();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    if (!title.trim() || !link.trim()) return res.status(400).json({ error: "title & link required" });
    const it = addLinkDoc(title, link, tags);
    res.json({ ok: true, item: it });
  });

  app.post("/api/knowledge/ask", async (req: Request, res: Response) => {
    const question = (req.body?.question || "").toString();
    if (!question.trim()) return res.status(400).json({ error: "Missing question" });
    const { contexts, sources } = topContexts(question, 6);
    const context = contexts.join("\n\n");
    const answer = await askLLM(question, context);
    const suggestions: string[] = [];
    if (/bollinger|bande/i.test(question)) suggestions.push("Voir réglage standard Bollinger 20/2.");
    if (/volatilité|volatility/i.test(question)) suggestions.push("Comparer volatilité réalisée vs implicite.");
    if (/stocks|stock|inventaire/i.test(question)) suggestions.push("Corréler stocks et courbe des prix.");
    if (/baril|brent|wti/i.test(question)) suggestions.push("Suivre calendrier OPEP et rapports EIA.");
    res.json({ answer, sources, suggestions });
  });
}
