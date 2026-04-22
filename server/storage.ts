import { randomUUID } from "crypto";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { DatabaseSync } from "node:sqlite";
import {
  type User, type InsertUser,
  type OilGrade, type InsertOilGrade,
  type MarketData, type InsertMarketData,
  type ChatMessage, type InsertChatMessage, type ChatChannel, type InsertChatChannel,
  // Clients
  type Client, type InsertClient,
  // Contrats
  type Contract, type InsertContract,
} from "../shared/schema.ts";

type ForwardPoint = { period: string; ask: number; code: string };

// --------- Produits (stock interne) -----------
type ProductComponent = { gradeName: string; percent: number };
type Product = {
  id: string;
  name: string;
  reference?: string | null;
  composition: ProductComponent[];
  updatedAt: string;
};
// ------------------------------------------------

/** Données forwards intégrées (indexées par nom de grade) */
const FORWARDS: Record<string, ForwardPoint[]> = {
  "RBD PO": [
    { period: "August", ask: 1000, code: "PO-MYRBD-M1" },
    { period: "September", ask: 1005, code: "PO-MYRBD-M2" },
    { period: "October", ask: 1010, code: "PO-MYRBD-M3" },
    { period: "Oct/Nov/Dec", ask: 1025, code: "PO-MYRBD-Q1" },
    { period: "Jan/Feb/Mar", ask: 1010, code: "PO-MYRBD-Q2" },
    { period: "Apr/Mai/June", ask: 1005, code: "PO-MYRBD-Q3" },
  ],
  "RBD POL IV56": [
    { period: "August", ask: 1015, code: "PO-MYRBD-M1" },
    { period: "September", ask: 1020, code: "PO-MYRBD-M2" },
    { period: "October", ask: 1035, code: "PO-MYRBD-M3" },
    { period: "Oct/Nov/Dec", ask: 1035, code: "PO-MYRBD-Q1" },
    { period: "Jan/Feb/Mar", ask: 1020, code: "PO-MYRBD-Q2" },
    { period: "Apr/Mai/June", ask: 1015, code: "PO-MYRBD-Q3" },
  ],
  "RBD PS": [
    { period: "August", ask: 1010, code: "PO-MYRBD-M1" },
    { period: "September", ask: 1015, code: "PO-MYRBD-M2" },
  ],
  "RBD CNO": [
    { period: "Jul25/Aug25", ask: 2200, code: "RBD CNO" },
    { period: "Aug25/Sep25", ask: 2000, code: "RBD CNO" },
    { period: "Sep25/Oct25", ask: 2000, code: "RBD CNO" },
    { period: "Oct25/Nov25", ask: 1950, code: "RBD CNO" },
    { period: "Nov25/Dec25", ask: 1950, code: "RBD CNO" },
    { period: "Dec25/Jan26", ask: 1940, code: "RBD CNO" },
  ],
  "RBD PKO": [
    { period: "Jul25/Aug25", ask: 2200, code: "RBD PKO" },
    { period: "Aug25/Sep25", ask: 2000, code: "RBD PKO" },
    { period: "Sep25/Oct25", ask: 2000, code: "RBD PKO" },
    { period: "Oct25/Nov25", ask: 1950, code: "RBD PKO" },
  ],
  "RBD PKS": [
    { period: "Jul25/Aug25", ask: 450, code: "RBD PKS" },
    { period: "Aug25/Sep25", ask: 455, code: "RBD PKS" },
    { period: "Sep25/Oct25", ask: 460, code: "RBD PKS" },
  ],
};

/* ======================
   NAVIRES — nouveaux types
   ====================== */
type GradeAllocation = { gradeId?: number; gradeName: string; qty: number };
type Vessel = {
  id: string;
  name: string;             // ex: "June shipment 25"
  type?: string;            // "Tanker" (héritage)
  dwt?: number;
  status?: string;          // "Planned" | "Laden" | ...
  eta?: string;             // YYYY-MM-DD
  origin?: string;
  destination?: string;

  // nouveaux champs
  tender?: string;          // "Tender 2025"
  supplier?: string;        // "Wilmar"
  quantityTotal?: number;   // capacité planifiée totale (MT)
  gradeAllocations?: GradeAllocation[]; // plan par grade
};

export interface IStorage {
  // Channels
  getAllChatChannels(): Promise<ChatChannel[]>;
  createChatChannel(data: InsertChatChannel): Promise<ChatChannel>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Oil grades
  getAllOilGrades(): Promise<OilGrade[]>;
  getOilGrade(id: number): Promise<OilGrade | undefined>;
  createOilGrade(grade: InsertOilGrade): Promise<OilGrade>;
  updateOilGradeFreight(id: number, freightUsd: number): Promise<any>;
  updateOilGrade?(
    id: number,
    patch: Partial<Omit<OilGrade, "id"> & { freightUsd?: number }>
  ): Promise<OilGrade>;

  // Market
  getAllMarketData(): Promise<MarketData[]>;
  getMarketDataByGrade(gradeId: number): Promise<MarketData[]>;
  createMarketData(data: InsertMarketData): Promise<MarketData>;
  getForwardPricesByGrade(
    gradeId: number
  ): Promise<
    Array<{ gradeId: number; gradeName: string; code: string; period: string; ask: number }>
  >;
  seedMarketForGrade(gradeId: number, days?: number): Promise<void>;

  // Chat
  getAllChatMessages(): Promise<ChatMessage[]>;
  getChatMessagesByChannel(channelId: string): Promise<ChatMessage[]>;
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;

  // Ops
  getAllFixings(): Promise<any[]>;
  getAllVessels(): Promise<any[]>;
  getAllKnowledge(): Promise<any[]>;
  createFixing(data: any): Promise<any>;
  updateFixing(id: string, data: any): Promise<any>;
  deleteFixing(id: string): Promise<void>;
  createVessel(data: any): Promise<any>;
  updateVessel(id: string, data: any): Promise<any>;
  deleteVessel(id: string): Promise<void>;
  createKnowledge(data: any): Promise<any>;

  // Produits
  getAllProducts(): Promise<Product[]>;
  createProduct(data: {
    name: string;
    reference?: string | null;
    composition: ProductComponent[];
  }): Promise<Product>;
  updateProduct(id: string, data: Partial<Omit<Product, "id" | "updatedAt">>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  // Clients
  getAllClients(): Promise<Client[]>;
  createClient(data: InsertClient): Promise<Client>;
  updateClient(id: string, data: Partial<Omit<Client, "id" | "updatedAt">>): Promise<Client>;
  deleteClient(id: string): Promise<void>;

  // Contrats
  getAllContracts(): Promise<Contract[]>;
  createContract(data: InsertContract): Promise<Contract>;
  updateContract(
    id: string,
    data: Partial<Omit<Contract, "id" | "createdAt" | "updatedAt">>
  ): Promise<Contract>;
  deleteContract(id: string): Promise<void>;
}

class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private oilGrades = new Map<number, OilGrade>();
  private marketData = new Map<string, MarketData>();
  private fixings = new Map<string, any>();
  private vessels = new Map<string, Vessel>();
  private knowledge = new Map<string, any>();

  private chatMessages = new Map<string, ChatMessage>();
  private chatChannels = new Map<string, ChatChannel>();

  private forwardPrices = new Map<
    number,
    Array<{ gradeId: number; gradeName: string; code: string; period: string; ask: number }>
  >();
  private forwardCurves = new Map<string, ForwardPoint[]>();

  // Produits
  private products = new Map<string, Product>();

  // Clients
  private clients = new Map<string, Client>();

  // Contrats
  private contracts = new Map<string, Contract>();
  /** Compteurs par (market-year) pour le code auto */
  private contractCounters = new Map<string, number>();

  private db: DatabaseSync;

  /** codes courts adaptés aux nouveaux noms */
  private codeFromGradeName(name: string): string {
    const map: Record<string, string> = {
      "RBD PO": "RBDPO",
      "RBD PS": "RBDPS",
      "RBD POL IV56": "RBDPOL56",
      "RBD POL IV64": "RBDPOL64",
      "RBD PKO": "PKO",
      "RBD CNO": "CNO",
      "RBD PKS": "PKS",
      CDSBO: "CDSBO",
    };
    return map[name] ?? name.toUpperCase().replace(/\s+/g, "_");
  }

  // util -> convertit "70,5%" ou "101,50%" en nombre 70.5 / 101.5
  private parsePercentCell(v: string | number | null | undefined): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const cleaned = v.replace(/\s+/g, "").replace("%", "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  // --- helpers navires / fixings ---
  private parseNumberLoose(v: any, def = 0) {
    if (v == null) return def;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^\d.,-]/g, "").replace(",", ".");
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : def;
    }
    return def;
  }
  private parseVolumeMT(v: any) {
    // Accepte "5,000 MT", "5000", 5000…
    return this.parseNumberLoose(v, 0);
  }
  private getVesselByName(name?: string | null): Vessel | undefined {
    if (!name) return undefined;
    const low = String(name).trim().toLowerCase();
    for (const v of this.vessels.values()) {
      if (String(v.name).trim().toLowerCase() === low) return v;
    }
    return undefined;
  }
  private computeVesselConsumption(vesselName: string, excludeFixingId?: string) {
    const byGrade = new Map<string, number>();
    let total = 0;
    for (const f of this.fixings.values()) {
      if (excludeFixingId && f.id === excludeFixingId) continue;
      if (!f.vessel) continue;
      if (String(f.vessel).trim().toLowerCase() !== vesselName.trim().toLowerCase()) continue;

      const qty = this.parseVolumeMT(f.volume);
      const gName = String(f.grade || "").trim();
      if (!gName) continue;

      byGrade.set(gName, (byGrade.get(gName) || 0) + qty);
      total += qty;
    }
    return { byGrade, total };
  }
  private assertFixingFitsVesselPlan(params: {
    vesselName?: string | null;
    grade?: string | null;
    volume?: any;
    excludeFixingId?: string; // pour update
  }) {
    const v = this.getVesselByName(params.vesselName ?? "");
    if (!v) return; // pas de plan => on n’impose rien

    const plannedTotal = this.parseNumberLoose(v.quantityTotal, 0);
    const allocations = (v.gradeAllocations ?? []).map(a => ({ ...a, gradeName: String(a.gradeName).trim() }));

    // aucun plan défini => on ne bloque pas
    if (!plannedTotal && allocations.length === 0) return;

    const newQty = this.parseVolumeMT(params.volume);
    const gradeName = String(params.grade || "").trim();

    const { byGrade, total } = this.computeVesselConsumption(v.name, params.excludeFixingId);

    // contrôle total
    if (plannedTotal > 0 && total + newQty > plannedTotal + 1e-9) {
      const remain = Math.max(0, plannedTotal - total);
      const err: any = new Error(
        `Plan capacity exceeded for vessel "${v.name}": total ${total + newQty} MT > planned ${plannedTotal} MT (remaining ${remain} MT).`
      );
      err.status = 409;
      throw err;
    }

    // contrôle par grade (si défini)
    const planForGrade = allocations.find(a => a.gradeName.toLowerCase() === gradeName.toLowerCase());
    if (planForGrade) {
      const used = byGrade.get(gradeName) || 0;
      if (used + newQty > planForGrade.qty + 1e-9) {
        const remain = Math.max(0, planForGrade.qty - used);
        const err: any = new Error(
          `Grade plan exceeded on "${v.name}" for ${gradeName}: ${used + newQty} MT > planned ${planForGrade.qty} MT (remaining ${remain} MT).`
        );
        err.status = 409;
        throw err;
      }
    } else if (allocations.length > 0) {
      const allowed = allocations.map(a => `${a.gradeName} (${a.qty} MT)`).join(", ");
      const err: any = new Error(`Grade "${gradeName}" not planned on vessel "${v.name}". Allowed: ${allowed}`);
      err.status = 409;
      throw err;
    }
  }

  /** Génère un code contrat du type LOCAL2025001 / EXPORT2025002 */
  private nextContractCode(market: "LOCAL" | "EXPORT", dateStr: string): string {
    const year = new Date(dateStr).getFullYear();
    const key = `${market}-${year}`;
    const current = this.contractCounters.get(key) ?? 0;
    const next = current + 1;
    this.contractCounters.set(key, next);
    const seq = String(next).padStart(3, "0");
    return `${market}${year}${seq}`;
  }

  // --- helpers codes Fixings ---
  private makeGradeAcronym(name: string): string {
    if (!name) return "FIX";
    const tokens = String(name).split(/[\s\-_/]+/).filter(Boolean);
    const parts = tokens
      .map((t) => {
        const clean = t.replace(/[^A-Za-z0-9]/g, "");
        if (!clean) return "";
        if (/^[A-Z0-9]+$/.test(clean) && clean.length > 1 && clean === clean.toUpperCase()) return clean; // acronyme déjà propre
        return clean[0].toUpperCase();
      })
      .filter(Boolean);
    return (parts.join("") || "FIX").toUpperCase();
  }
  /** séquence suivante (globale par année) depuis les codes existants */
  private nextFixingSeqForYear(year: number): number {
    const re = new RegExp(`^[A-Z0-9]+${year}(\\d{5,})$`);
    let maxSeq = 0;
    for (const f of this.fixings.values()) {
      const m = String((f as any).code || "").match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
    }
    return maxSeq + 1;
  }
  /** Construit un code unique: ACRONYME_GRADE + YYYY + séquence(5) */
  private buildFixingCode(gradeName: string, dateIso?: string): string {
    const acronym = this.makeGradeAcronym(gradeName);
    const d = dateIso ? new Date(dateIso) : new Date();
    const year = d.getFullYear();
    let seq = this.nextFixingSeqForYear(year);

    const used = new Set(Array.from(this.fixings.values()).map((x: any) => x.code).filter(Boolean) as string[]);
    let code = `${acronym}${year}${String(seq).padStart(5, "0")}`;
    while (used.has(code)) {
      seq += 1;
      code = `${acronym}${year}${String(seq).padStart(5, "0")}`;
    }
    return code;
  }

  private initSqlite() {
    const dbDir = join(process.cwd(), "data");
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
    this.db = new DatabaseSync(join(dbDir, "oiltracker.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        reference TEXT,
        composition_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        market TEXT NOT NULL,
        name TEXT NOT NULL,
        terms TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        market TEXT NOT NULL,
        contract_date TEXT NOT NULL,
        client_id TEXT NOT NULL,
        client_name TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity_tons REAL NOT NULL,
        price_currency TEXT NOT NULL,
        price_usd REAL,
        price_tnd REAL,
        fx_rate REAL,
        start_date TEXT,
        end_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private syncMapsToSqliteIfEmpty() {
    const productCount = Number((this.db.prepare(`SELECT COUNT(*) as c FROM products`).get() as any).c || 0);
    if (productCount === 0) {
      const stmt = this.db.prepare(`INSERT INTO products (id, name, reference, composition_json, updated_at) VALUES (?, ?, ?, ?, ?)`);
      for (const p of this.products.values()) {
        stmt.run(p.id, p.name, p.reference ?? null, JSON.stringify(p.composition || []), p.updatedAt);
      }
    }

    const clientCount = Number((this.db.prepare(`SELECT COUNT(*) as c FROM clients`).get() as any).c || 0);
    if (clientCount === 0) {
      const stmt = this.db.prepare(`INSERT INTO clients (id, market, name, terms, updated_at) VALUES (?, ?, ?, ?, ?)`);
      for (const c of this.clients.values()) {
        stmt.run(c.id, c.market, c.name, c.terms, c.updatedAt ?? new Date().toISOString());
      }
    }
  }

  private loadSqliteToMaps() {
    this.products.clear();
    const productRows = this.db.prepare(`SELECT * FROM products ORDER BY name`).all() as any[];
    for (const r of productRows) {
      this.products.set(r.id, {
        id: r.id,
        name: r.name,
        reference: r.reference ?? null,
        composition: JSON.parse(r.composition_json || '[]'),
        updatedAt: r.updated_at,
      });
    }

    this.clients.clear();
    const clientRows = this.db.prepare(`SELECT * FROM clients ORDER BY name`).all() as any[];
    for (const r of clientRows) {
      this.clients.set(r.id, {
        id: r.id,
        market: r.market,
        name: r.name,
        terms: r.terms,
        updatedAt: r.updated_at,
      } as Client);
    }

    this.contracts.clear();
    this.contractCounters.clear();
    const contractRows = this.db.prepare(`SELECT * FROM contracts ORDER BY contract_date DESC, created_at DESC`).all() as any[];
    for (const r of contractRows) {
      const c: Contract = {
        id: r.id,
        code: r.code,
        market: r.market,
        contractDate: r.contract_date,
        clientId: r.client_id,
        clientName: r.client_name,
        productId: r.product_id,
        productName: r.product_name,
        quantityTons: Number(r.quantity_tons),
        priceCurrency: r.price_currency,
        priceUsd: r.price_usd == null ? undefined : Number(r.price_usd),
        priceTnd: r.price_tnd == null ? undefined : Number(r.price_tnd),
        fxRate: r.fx_rate == null ? undefined : Number(r.fx_rate),
        startDate: r.start_date ?? undefined,
        endDate: r.end_date ?? undefined,
        notes: r.notes ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
      this.contracts.set(c.id, c);

      const year = new Date(c.contractDate).getFullYear();
      const key = `${c.market}-${year}`;
      const m = String(c.code || '').match(/(\d{3})$/);
      if (m) {
        const seq = Number(m[1]);
        const cur = this.contractCounters.get(key) ?? 0;
        if (seq > cur) this.contractCounters.set(key, seq);
      }
    }
  }

  constructor() {
    // Seed users
    const seedUsers: User[] = [
      {
        id: "1",
        name: "Youssef SAYADI",
        email: "y.sayadi@direct-medical.net",
        password: "admin123",
        role: "admin",
      },
      { id: "2", name: "Senior Buyer", email: "senior@oiltracker.com", password: "senior123", role: "senior" },
      { id: "3", name: "Junior Buyer", email: "junior@oiltracker.com", password: "junior123", role: "junior" },
      { id: "4", name: "Viewer", email: "viewer@oiltracker.com", password: "viewer123", role: "viewer" },
    ];
    seedUsers.forEach((u) => this.users.set(u.id, u));

    // Seed grades
    const grades: Array<Omit<OilGrade, "id"> & { freightUsd?: number }> = [
      { name: "RBD PO", region: "Malaysia", ffa: "< 0.1%", moisture: "< 0.1%", iv: "52-56", dobi: "2.4+", freightUsd: 120 },
      { name: "RBD PS", region: "Malaysia", ffa: "< 0.1%", freightUsd: 100 },
      { name: "RBD POL IV56", region: "Malaysia", iv: "56", freightUsd: 130 },
      { name: "RBD POL IV64", region: "Malaysia", iv: "64", freightUsd: 140 },
      { name: "RBD PKO", region: "Indonesia", freightUsd: 180 },
      { name: "RBD CNO", region: "Philippines", freightUsd: 200 },
      { name: "CDSBO", region: "USA", freightUsd: 0 },
      { name: "RBD PKS", region: "Indonesia", ffa: "~", freightUsd: 170 },
    ];
    grades.forEach((g, idx) => this.oilGrades.set(idx + 1, { id: idx + 1, ...g }));

    // Seed market data: 30 jours par grade
    const today = new Date();
    for (const grade of this.oilGrades.values()) {
      for (let d = 0; d < 30; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() - (29 - d));
        const base = 900 + ((grade.id % 5) * 50);
        const noise = (Math.random() - 0.5) * 30;
        const trend = Math.sin(d / 5) * 12; // ✅ (corrige l'ancien 'the:')
        const priceUsd = Math.round((base + noise + trend) * 100) / 100;
        const usdTnd = Math.round((3.1 + Math.random() * 0.4) * 1000) / 1000;
        const change24h = Math.round(((Math.random() - 0.5) * 6) * 10) / 10;
        const id = randomUUID();
        this.marketData.set(id, {
          id,
          gradeId: grade.id,
          gradeName: grade.name,
          date: date.toISOString().split("T")[0],
          priceUsd,
          usdTnd,
          volume: `${Math.floor(Math.random() * 2000 + 400)} MT`,
          change24h,
        });
      }
    }

    // Seed fixings / vessels / knowledge
    [
      { date: new Date().toISOString().slice(0, 10), route: "MAL → TUN", grade: "RBD PO",  volume: "5,000 MT", priceUsd: 980,  counterparty: "Wilmar",    vessel: "June shipment 25" },
      { date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), route: "IDN → TUN", grade: "RBD PKO", volume: "3,000 MT", priceUsd: 1210, counterparty: "Musim Mas", vessel: "August shipment 25" },
      { date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), route: "USA → TUN", grade: "CDSBO", volume: "8,000 MT", priceUsd: 890, counterparty: "Bunge",     vessel: "January shipment 26" },
    ].forEach((f) => {
      const id = randomUUID();
      this.fixings.set(id, { id, ...f });
    });

    // ✅ Backfill code pour les fixings seedés (ordre chronologique)
    {
      const arr = Array.from(this.fixings.values())
        .map((f: any, idx) => ({ f, idx }))
        .sort((a, b) => {
          const ad = a.f.date || "";
          const bd = b.f.date || "";
          const cmp = String(ad).localeCompare(String(bd));
          return cmp !== 0 ? cmp : a.idx - b.idx;
        });

      for (const { f } of arr) {
        if (!f.code) {
          f.code = this.buildFixingCode(f.grade, f.date);
          this.fixings.set(f.id, f);
        }
      }
    }

    // Vessels avec nouveaux champs (rétro-compat OK si non utilisés)
    [
      { name: "June shipment 25",    type: "Tanker", dwt: 45000, status: "Laden",    eta: "2025-09-02", origin: "Port Klang",  destination: "Rades",
        tender: "Tender 2025", supplier: "Wilmar", quantityTotal: 4000,
        gradeAllocations: [
          { gradeName: "RBD PO", qty: 2000 }, { gradeName: "RBD POL IV56", qty: 1000 }, { gradeName: "RBD CNO", qty: 500 }, { gradeName: "RBD PKO", qty: 500 }
        ] },
      { name: "August shipment 25",  type: "Tanker", dwt: 38000, status: "Ballast",  eta: "2025-08-28", origin: "Belawan",     destination: "Rades",
        tender: "Tender 2025", supplier: "Musim Mas", quantityTotal: 3000,
        gradeAllocations: [
          { gradeName: "RBD PO", qty: 1500 }, { gradeName: "RBD PKO", qty: 1500 }
        ] },
      { name: "January shipment 26", type: "Tanker", dwt: 52000, status: "At anchor", eta: "2025-09-10", origin: "New Orleans", destination: "Rades",
        tender: "Tender 2026", supplier: "Bunge", quantityTotal: 8000,
        gradeAllocations: [
          { gradeName: "CDSBO", qty: 8000 }
        ] },
    ].forEach((v) => {
      const id = randomUUID();
      this.vessels.set(id, { id, ...v });
    });

    [
      { title: "Spec RBD PO",         tags: ["spec", "quality"], excerpt: "FFA < 0.1%, Moisture < 0.1%, DOBI 2.4+", content: "Detailed spec for RBD PO used by DMA." },
      { title: "Contract Template (CIF)", tags: ["contract", "legal"], excerpt: "Standard CIF template for palm products", content: "Clause set for CIF DMA imports." },
      { title: "Ops Checklist: Discharge Rades", tags: ["ops", "port"], excerpt: "Pre-arrival docs, draft survey, sampling", content: "Operational checklist for Rades discharge." },
    ].forEach((k) => {
      const id = randomUUID();
      this.knowledge.set(id, { id, updatedAt: new Date().toISOString(), ...k });
    });

    // Channels + Chat
    const chGeneralId = randomUUID();
    const chTradingId = randomUUID();
    const chOpsId = randomUUID();
    const now = new Date();
    this.chatChannels.set(chGeneralId, { id: chGeneralId, name: "general", createdAt: now });
    this.chatChannels.set(chTradingId, { id: chTradingId, name: "trading", createdAt: now });
    this.chatChannels.set(chOpsId, { id: chOpsId, name: "ops", createdAt: now });

    const seedChat: Omit<ChatMessage, "id" | "timestamp">[] = [
      { sender: "System",       message: "Welcome to OilTracker team chat", userId: null },
      { sender: "Senior Buyer", message: "Palm oil prices rallied this week. Should we increase our position?", userId: "2" },
      { sender: "Youssef SAYADI", message: "Agreed. Let's align on risk and TND exposure tomorrow.", userId: "1" },
      { sender: "Junior Buyer", message: "I uploaded a basis spreadsheet from Malaysia.", userId: "3" },
    ];
    seedChat.forEach((m) => {
      const id = randomUUID();
      this.chatMessages.set(id, { id, timestamp: new Date(), channelId: chGeneralId, ...m });
    });

    // Forwards intégrés
    for (const [name, points] of Object.entries(FORWARDS)) {
      this.forwardCurves.set(name.trim(), points);
    }

    // Seed Produits
    const seed = (name: string, obj: Partial<Record<string, string | number>>) => {
      const id = randomUUID();
      const composition: ProductComponent[] = Object.entries(obj)
        .map(([gradeName, v]) => ({
          gradeName,
          percent: this.parsePercentCell(v),
        }))
        .filter((c) => c.percent !== 0);
      const p: Product = {
        id,
        name,
        reference: null,
        composition,
        updatedAt: new Date().toISOString(),
      };
      this.products.set(id, p);
    };

    seed("EMAS 360-7", { "RBD PO": "70,5%", "RBD POL IV56": "20,5%", "RBD PS": "10,5%" });
    seed("EMAS 360-9", { "RBD PO": "70,5%", "RBD POL IV56": "10,5%", "RBD PS": "20,5%" });
    seed("EMAS 404", { "RBD PO": "101,50%" });
    seed("KERNEL 357", { "RBD PKO": "101,50%" });
    seed("HELIOS 360-7", { "RBD PO": "65,5%", "RBD POL IV56": "5,5%", "RBD CNO": "30,5%" });
    seed("ALBA 304-3", { "RBD POL IV64": "101,50%" });
    seed("CBS PREMIUM", { "RBD PKS": "101,50%" });
    seed("IRIS-204", { "RBD POL IV56": "101,50%" });
    seed("HVSJ", { CDSBO: "105%" });

    // Seed Clients (⚠️ schéma `terms`)
    const seedClient = (market: "LOCAL" | "EXPORT", name: string, terms: string) => {
      const id = randomUUID();
      this.clients.set(id, {
        id,
        market,
        name,
        terms,
        updatedAt: new Date().toISOString(),
      } as Client);
    };
    seedClient("LOCAL", "SOTUBI", "120 j");
    seedClient("LOCAL", "GEPACO", "90 j");
    seedClient("EXPORT", "FDD", "A vue");
    seedClient("EXPORT", "AIGUEBELLE", "60 j");

    this.initSqlite();
    this.syncMapsToSqliteIfEmpty();
    this.loadSqliteToMaps();
  }

  // Users
  async getUser(id: string) {
    return this.users.get(id);
  }
  async getUserByEmail(email: string) {
    for (const u of this.users.values()) if (u.email === email) return u;
    return undefined;
  }
  async createUser(user: InsertUser) {
    const id = randomUUID();
    const u: User = {
      id,
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role ?? "viewer",
    };
    this.users.set(id, u);
    return u;
  }

  // Grades
  async getAllOilGrades() {
    return Array.from(this.oilGrades.values());
  }
  async getOilGrade(id: number) {
    return this.oilGrades.get(id);
  }

  async createOilGrade(grade: InsertOilGrade) {
    const id = Math.max(0, ...this.oilGrades.keys()) + 1;
    const g: OilGrade = { id, ...grade, name: grade.name || `Grade ${id}` };
    this.oilGrades.set(id, g);

    await this.seedMarketForGrade(id, 30);

    const forwards = FORWARDS[(g.name || "").trim()];
    if (forwards && forwards.length) {
      this.forwardCurves.set(g.name.trim(), forwards);
    }

    return g;
  }

  async updateOilGradeFreight(id: number, freightUsd: number) {
    const g = this.oilGrades.get(id);
    if (!g) throw new Error("Grade not found");
    const updated = { ...(g as any), freightUsd: Number(freightUsd) };
    this.oilGrades.set(id, updated as any);
    return updated;
  }

  async updateOilGrade(
    id: number,
    patch: Partial<Omit<OilGrade, "id"> & { freightUsd?: number }>
  ) {
    const current = this.oilGrades.get(id);
    if (!current) throw new Error("Grade not found");

    const next: any = { ...current };
    for (const k of ["name", "region", "ffa", "moisture", "iv", "dobi"] as const) {
      if (patch[k] !== undefined) next[k] = patch[k];
    }
    if (patch.freightUsd !== undefined) next.freightUsd = Number(patch.freightUsd);

    const nameChanged = patch.name && patch.name !== current.name;

    if (nameChanged) {
      for (const m of this.marketData.values()) {
        if (m.gradeId === id) (m as any).gradeName = patch.name;
      }
      this.forwardPrices.delete(id);
      const fwd = FORWARDS[(patch.name || "").trim()];
      if (fwd && fwd.length) this.forwardCurves.set(String(patch.name).trim(), fwd);
    }

    this.oilGrades.set(id, next);
    return next as OilGrade;
  }

  // Market
  async getAllMarketData() {
    return Array.from(this.marketData.values()).sort((a, b) => a.date.localeCompare(b.date));
  }
  async getMarketDataByGrade(gradeId: number) {
    return Array.from(this.marketData.values())
      .filter((m) => m.gradeId === gradeId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async createMarketData(data: InsertMarketData) {
    const id = randomUUID();
    const m: MarketData = { id, ...data };
    this.marketData.set(id, m);
    return m;
  }

  async seedMarketForGrade(gradeId: number, days = 30) {
    const grade = this.oilGrades.get(gradeId);
    if (!grade) return;

    const today = new Date();
    for (let d = 0; d < days; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (days - 1 - d));
      const base = 900 + ((grade.id % 5) * 50);
      const noise = (Math.random() - 0.5) * 30;
      const trend = Math.sin(d / 5) * 12;
      const priceUsd = Math.round((base + noise + trend) * 100) / 100;
      const usdTnd = Math.round((3.1 + Math.random() * 0.4) * 1000) / 1000;
      const change24h = Math.round(((Math.random() - 0.5) * 6) * 10) / 10;
      const id = randomUUID();
      this.marketData.set(id, {
        id,
        gradeId: grade.id,
        gradeName: grade.name,
        date: date.toISOString().split("T")[0],
        priceUsd,
        usdTnd,
        volume: `${Math.floor(Math.random() * 2000 + 400)} MT`,
        change24h,
      });
    }

    this.forwardPrices.delete(gradeId);
  }

  async getForwardPricesByGrade(gradeId: number) {
    const g = this.oilGrades.get(gradeId);
    if (!g) return [];

    const curve = this.forwardCurves.get((g.name || "").trim());
    if (curve && curve.length) {
      return curve.map((p) => ({
        gradeId,
        gradeName: g.name,
        code: p.code,
        period: p.period,
        ask: p.ask,
      }));
    }

    const cached = this.forwardPrices.get(gradeId);
    if (cached) return cached;

    const series = await this.getMarketDataByGrade(gradeId);
    if (!series.length) return [];

    const last = series[series.length - 1];
    const base = Number(last.priceUsd) || 0;
    const code = this.codeFromGradeName(last.gradeName);

    const rows = [
      { gradeId, gradeName: last.gradeName, code, period: "Spot (M)", ask: Math.round(base * 100) / 100 },
      { gradeId, gradeName: last.gradeName, code, period: "M+1", ask: Math.round((base + 10) * 100) / 100 },
      { gradeId, gradeName: last.gradeName, code, period: "M+2", ask: Math.round((base + 20) * 100) / 100 },
      { gradeId, gradeName: last.gradeName, code, period: "M+3", ask: Math.round((base + 30) * 100) / 100 },
    ];

    this.forwardPrices.set(gradeId, rows);
    return rows;
  }

  // Chat
  async getAllChatMessages() {
    return Array.from(this.chatMessages.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }
  async getChatMessagesByChannel(channelId: string) {
    return Array.from(this.chatMessages.values())
      .filter((m) => m.channelId === channelId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  async createChatMessage(data: InsertChatMessage) {
    const id = randomUUID();
    const anyGeneral = Array.from(this.chatChannels.values()).find((c) => c.name === "general");
    const channelId = data.channelId ?? anyGeneral?.id ?? Array.from(this.chatChannels.keys())[0];
    const m: ChatMessage = {
      id,
      sender: data.sender,
      message: data.message,
      userId: data.userId ?? null,
      timestamp: new Date(),
      channelId,
    };
    this.chatMessages.set(id, m);
    return m;
  }

  // Fixings + Vessels + Knowledge
  async getAllFixings() {
    return Array.from(this.fixings.values()).sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );
  }
  async getAllVessels() {
    return Array.from(this.vessels.values());
  }
  async getAllKnowledge() {
    return Array.from(this.knowledge.values()).sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt))
    );
  }

  async createFixing(data: any) {
    // vérifie le plan avant enregistrement
    this.assertFixingFitsVesselPlan({
      vesselName: data.vessel,
      grade: data.grade,
      volume: data.volume,
    });

    const id = randomUUID();
    const code =
      data.code && String(data.code).trim().length
        ? String(data.code).trim()
        : this.buildFixingCode(data.grade, data.date);

    const f = {
      id,
      date: data.date,
      route: data.route,
      grade: data.grade,
      volume: data.volume,
      priceUsd: Number(data.priceUsd),
      counterparty: data.counterparty,
      vessel: data.vessel || undefined,
      freightUsd: data.freightUsd != null ? Number(data.freightUsd) : undefined,
      notes: data.notes,
      code, // ✅ nouveau
    };

    this.fixings.set(id, f);

    if (f.vessel && !Array.from(this.vessels.values()).some((v: any) => v.name === f.vessel)) {
      const vId = randomUUID();
      this.vessels.set(vId, { id: vId, name: f.vessel, type: "Tanker", dwt: 0, status: "Planned" });
    }
    return f;
  }

  async updateFixing(id: string, data: any) {
    const existing = this.fixings.get(id);
    if (!existing) throw new Error("Fixing not found");

    // ne pas écraser le code si non fourni
    const next = { ...existing, ...data, id, code: data.code ?? existing.code };

    // re-contrôle avec exclusion de l’ID courant
    this.assertFixingFitsVesselPlan({
      vesselName: next.vessel,
      grade: next.grade,
      volume: next.volume,
      excludeFixingId: id,
    });

    this.fixings.set(id, next);
    if (next.vessel && !Array.from(this.vessels.values()).some((v: any) => v.name === next.vessel)) {
      const vId = randomUUID();
      this.vessels.set(vId, { id: vId, name: next.vessel, type: "Tanker", dwt: 0, status: "Unknown" });
    }
    return next;
  }
  async deleteFixing(id: string) {
    this.fixings.delete(id);
  }

  async createVessel(data: any) {
    const id = randomUUID();
    const v: Vessel = {
      id,
      name: data.name,
      type: data.type || "Tanker",
      dwt: this.parseNumberLoose(data.dwt, 0),
      status: data.status || "Planned",
      eta: data.eta,
      origin: data.origin,
      destination: data.destination,

      // nouveaux champs (facultatifs)
      tender: data.tender ?? undefined,
      supplier: data.supplier ?? undefined,
      quantityTotal: this.parseNumberLoose(data.quantityTotal, 0) || undefined,
      gradeAllocations: Array.isArray(data.gradeAllocations)
        ? data.gradeAllocations
            .map((a:any)=>({
              gradeId: a.gradeId ? Number(a.gradeId) : undefined,
              gradeName: String(a.gradeName || "").trim(),
              qty: this.parseNumberLoose(a.qty, 0),
            }))
            .filter((a:any)=> a.gradeName && a.qty > 0)
        : undefined,
    };
    this.vessels.set(id, v);
    return v;
  }
  async updateVessel(id: string, data: any) {
    const existing = this.vessels.get(id);
    if (!existing) throw new Error("Vessel not found");
    const next: Vessel = {
      ...existing,
      ...data,
      id,
      dwt: this.parseNumberLoose(data.dwt, existing.dwt ?? 0),
      type: data.type || existing.type || "Tanker",
      status: data.status || existing.status || "Unknown",

      // normalisation nouveaux champs
      quantityTotal: (data.quantityTotal !== undefined)
        ? (this.parseNumberLoose(data.quantityTotal, 0) || undefined)
        : existing.quantityTotal,
      gradeAllocations: Array.isArray(data.gradeAllocations)
        ? data.gradeAllocations
            .map((a:any)=>({
              gradeId: a.gradeId ? Number(a.gradeId) : undefined,
              gradeName: String(a.gradeName || "").trim(),
              qty: this.parseNumberLoose(a.qty, 0),
            }))
            .filter((a:any)=> a.gradeName && a.qty > 0)
        : existing.gradeAllocations,
    };
    this.vessels.set(id, next);
    return next;
  }
  async deleteVessel(id: string) {
    this.vessels.delete(id);
  }

  async createKnowledge(data: any) {
    const id = randomUUID();
    const k = {
      id,
      title: data.title || "Untitled",
      tags: data.tags || [],
      excerpt: data.excerpt || data.link || "",
      content: data.content || data.link || "",
      updatedAt: new Date().toISOString(),
    };
    this.knowledge.set(id, k);
    return k;
  }

  // Channels
  async getAllChatChannels(): Promise<ChatChannel[]> {
    return Array.from(this.chatChannels.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  async createChatChannel(data: InsertChatChannel): Promise<ChatChannel> {
    const id = randomUUID();
    const ch: ChatChannel = { id, name: data.name, createdAt: new Date() };
    this.chatChannels.set(id, ch);
    return ch;
  }

  // ------------------- Produits -------------------
  async getAllProducts() {
    this.loadSqliteToMaps();
    return Array.from(this.products.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  async createProduct(data: { name: string; reference?: string | null; composition: ProductComponent[] }) {
    const id = randomUUID();
    const composition = (data.composition || [])
      .map((c) => ({ gradeName: String(c.gradeName), percent: Number(c.percent) || 0 }))
      .filter((c) => c.percent !== 0);
    const p: Product = {
      id,
      name: data.name,
      reference: data.reference ?? null,
      composition,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`INSERT INTO products (id, name, reference, composition_json, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(p.id, p.name, p.reference ?? null, JSON.stringify(p.composition || []), p.updatedAt);
    this.products.set(id, p);
    return p;
  }
  async updateProduct(id: string, data: Partial<Omit<Product, "id" | "updatedAt">>) {
    const existing = this.products.get(id);
    if (!existing) throw new Error("Product not found");
    const next: Product = {
      ...existing,
      ...("name" in data ? { name: String(data.name) } : {}),
      ...("reference" in data ? { reference: (data as any).reference ?? null } : {}),
      ...(data.composition
        ? {
            composition: data.composition
              .map((c) => ({ gradeName: String(c.gradeName), percent: Number(c.percent) || 0 }))
              .filter((c) => c.percent !== 0),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`UPDATE products SET name = ?, reference = ?, composition_json = ?, updated_at = ? WHERE id = ?`)
      .run(next.name, next.reference ?? null, JSON.stringify(next.composition || []), next.updatedAt, id);
    this.products.set(id, next);
    return next;
  }
  async deleteProduct(id: string) {
    this.db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    this.products.delete(id);
  }

  // ------------------- Clients -------------------
  async getAllClients() {
    this.loadSqliteToMaps();
    return Array.from(this.clients.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  async createClient(data: InsertClient) {
    const id = randomUUID();
    const c: Client = {
      id,
      name: data.name,
      market: data.market,
      terms: data.terms,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`INSERT INTO clients (id, market, name, terms, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(c.id, c.market, c.name, c.terms, c.updatedAt);
    this.clients.set(id, c);
    return c;
  }
  async updateClient(id: string, data: Partial<Omit<Client, "id" | "updatedAt">>) {
    const existing = this.clients.get(id);
    if (!existing) throw new Error("Client not found");
    const next: Client = {
      ...existing,
      ...("name" in data ? { name: String(data.name) } : {}),
      ...("market" in data ? { market: data.market as Client["market"] } : {}),
      ...("terms" in data ? { terms: String((data as any).terms) } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`UPDATE clients SET market = ?, name = ?, terms = ?, updated_at = ? WHERE id = ?`)
      .run(next.market, next.name, next.terms, next.updatedAt, id);
    this.clients.set(id, next);
    return next;
  }
  async deleteClient(id: string) {
    this.db.prepare(`DELETE FROM clients WHERE id = ?`).run(id);
    this.clients.delete(id);
  }

  // ------------------- Contrats -------------------
  async getAllContracts() {
    this.loadSqliteToMaps();
    return Array.from(this.contracts.values()).sort((a, b) =>
      String(b.contractDate).localeCompare(String(a.contractDate))
    );
  }

  async createContract(data: InsertContract) {
    const id = randomUUID();

    const contractDate = data.contractDate ?? new Date().toISOString().slice(0, 10);
    const market = data.market;
    const code = data.code && data.code.trim().length ? data.code : this.nextContractCode(market, contractDate);

    let clientName = data.clientName;
    if (!clientName && data.clientId) {
      const c = this.clients.get(data.clientId);
      if (c) clientName = c.name;
    }
    let productName = data.productName;
    if (!productName && data.productId) {
      const p = this.products.get(data.productId);
      if (p) productName = p.name;
    }

    const c: Contract = {
      id,
      code,
      market,
      contractDate,
      clientId: data.clientId,
      clientName: clientName || "—",
      productId: data.productId,
      productName: productName || "—",
      quantityTons: Number(data.quantityTons),
      priceCurrency: data.priceCurrency,
      priceUsd: data.priceUsd !== undefined ? Number(data.priceUsd) : undefined,
      priceTnd: data.priceTnd !== undefined ? Number(data.priceTnd) : undefined,
      fxRate: data.fxRate !== undefined ? Number(data.fxRate) : undefined,
      startDate: data.startDate,
      endDate: data.endDate,
      notes: data.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO contracts (
        id, code, market, contract_date, client_id, client_name, product_id, product_name,
        quantity_tons, price_currency, price_usd, price_tnd, fx_rate, start_date, end_date,
        notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      c.id, c.code, c.market, c.contractDate, c.clientId, c.clientName, c.productId, c.productName,
      c.quantityTons, c.priceCurrency, c.priceUsd ?? null, c.priceTnd ?? null, c.fxRate ?? null,
      c.startDate ?? null, c.endDate ?? null, c.notes ?? null, c.createdAt, c.updatedAt
    );

    this.contracts.set(id, c);
    return c;
  }

  async updateContract(
    id: string,
    data: Partial<Omit<Contract, "id" | "createdAt" | "updatedAt">>
  ) {
    const existing = this.contracts.get(id);
    if (!existing) throw new Error("Contract not found");

    let nextCode = existing.code;
    let nextDate = existing.contractDate;
    let nextMarket = existing.market;

    if (data.contractDate) nextDate = data.contractDate;
    if (data.market) nextMarket = data.market;

    if (!data.code && (data.market || data.contractDate)) {
      const yOld = new Date(existing.contractDate).getFullYear();
      const yNew = new Date(nextDate).getFullYear();
      if (existing.market !== nextMarket || yOld !== yNew) {
        nextCode = this.nextContractCode(nextMarket, nextDate);
      }
    } else if (data.code) {
      nextCode = data.code;
    }

    const next: Contract = {
      ...existing,
      ...data,
      code: nextCode,
      contractDate: nextDate,
      market: nextMarket,
      quantityTons: data.quantityTons !== undefined ? Number(data.quantityTons) : existing.quantityTons,
      priceUsd: data.priceUsd !== undefined ? Number(data.priceUsd) : existing.priceUsd,
      priceTnd: data.priceTnd !== undefined ? Number(data.priceTnd) : existing.priceTnd,
      fxRate: data.fxRate !== undefined ? Number(data.fxRate) : existing.fxRate,
      updatedAt: new Date().toISOString(),
    };

    this.db.prepare(`
      UPDATE contracts SET
        code = ?, market = ?, contract_date = ?, client_id = ?, client_name = ?, product_id = ?, product_name = ?,
        quantity_tons = ?, price_currency = ?, price_usd = ?, price_tnd = ?, fx_rate = ?, start_date = ?, end_date = ?,
        notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.code, next.market, next.contractDate, next.clientId, next.clientName, next.productId, next.productName,
      next.quantityTons, next.priceCurrency, next.priceUsd ?? null, next.priceTnd ?? null, next.fxRate ?? null,
      next.startDate ?? null, next.endDate ?? null, next.notes ?? null, next.updatedAt, id
    );

    this.contracts.set(id, next);
    return next;
  }

  async deleteContract(id: string) {
    this.db.prepare(`DELETE FROM contracts WHERE id = ?`).run(id);
    this.contracts.delete(id);
  }
}

export const storage = new MemStorage();
