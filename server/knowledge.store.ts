import fs from "node:fs";
import path from "node:path";

export type KBItem = {
  id: string;
  title: string;
  link?: string;
  tags: string[];
  excerpt?: string;
  content?: string;
  updatedAt: number;
};

const DATA_DIR = path.resolve(process.cwd(), "knowledge");
const DB_PATH = path.join(DATA_DIR, "knowledge.db.json");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ items: [] }, null, 2));
}

export function loadAll(): KBItem[] {
  ensureDirs();
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const json = JSON.parse(raw);
    return json.items || [];
  } catch {
    return [];
  }
}

export function saveAll(items: KBItem[]) {
  ensureDirs();
  fs.writeFileSync(DB_PATH, JSON.stringify({ items }, null, 2));
}

export function addLinkDoc(title: string, link: string, tags: string[]) {
  const items = loadAll();
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2,8)}`;
  const item: KBItem = {
    id, title, link, tags,
    excerpt: link,
    content: "",
    updatedAt: now
  };
  items.unshift(item);
  saveAll(items);
  return item;
}

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-zà-ÿ0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

export function search(q?: string): KBItem[] {
  const items = loadAll();
  const s = (q||"").trim().toLowerCase();
  if (!s) return items;
  return items.filter(it => {
    const hay = `${it.title} ${(it.tags||[]).join(" ")} ${it.excerpt||""} ${it.content||""}`.toLowerCase();
    return hay.includes(s);
  });
}

export function topContexts(question: string, k=6) {
  const items = loadAll();
  const qTokens = new Set(tokenize(question));
  const scored: {it: KBItem, score: number}[] = [];
  for (const it of items) {
    const txt = `${it.title} ${(it.tags||[]).join(" ")} ${it.excerpt||""} ${it.content||""}`;
    const t = tokenize(txt);
    let sc = 0;
    for (const tok of t) if (qTokens.has(tok)) sc += 1;
    if (sc>0) scored.push({ it, score: sc });
  }
  scored.sort((a,b)=>b.score-a.score);
  const take = scored.slice(0, k).map(s=>s.it);
  const contexts = take.map(t => `# ${t.title}\n${t.excerpt||""}\n${t.content||""}`.trim()).filter(Boolean);
  const sources = take.map(t => ({ title: t.title, path: t.link || t.id }));
  return { contexts, sources };
}
