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
  type TargetMargin, type InsertTargetMargin,
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

// --------- Affectations contrats / fixings -----------
type ContractRequirement = {
  id: string;
  contractId: string;
  gradeName: string;
  requiredQty: number;
};

type ContractFixingAllocation = {
  id: string;
  contractId: string;
  fixingId: string;
  gradeName: string;
  allocatedQty: number;
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

  // Marges cibles
  getAllTargetMargins(): Promise<TargetMargin[]>;
  createTargetMargin(data: InsertTargetMargin): Promise<TargetMargin>;
  updateTargetMargin(id: string, data: Partial<Omit<TargetMargin, "id" | "updatedAt">>): Promise<TargetMargin>;
  deleteTargetMargin(id: string): Promise<void>;
  replaceTargetMargins(rows: InsertTargetMargin[]): Promise<TargetMargin[]>;

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

  // Affectations contrats / fixings
  getContractRequirements(contractId: string): Promise<ContractRequirement[]>;
  getContractAllocations(contractId: string): Promise<ContractFixingAllocation[]>;
  getFixingAvailableQty(fixingId: string): Promise<number>;
  allocateFixing(data: {
    contractId: string;
    fixingId: string;
    gradeName: string;
    qty: number;
  }): Promise<ContractFixingAllocation>;
  deleteAllocation(id: string): Promise<void>;
  getContractCoverage(contractId: string): Promise<number>;
  getGradeAllocationSummary(): Promise<
    Array<{ gradeName: string; fixedQty: number; allocatedQty: number; unallocatedQty: number }>
  >;
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

  // Marges cibles
  private targetMargins = new Map<string, TargetMargin>();

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
      let cleaned = v.replace(/[^\d.,-]/g, "").trim();
      if (!cleaned) return def;

      // 5,000 / 12,500.75 => thousands comma
      if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/,/g, "");
      }
      // 5.000 / 12.500,75 => thousands dot + decimal comma
      else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, "").replace(",", ".");
      }
      // 12,5 => decimal comma
      else {
        cleaned = cleaned.replace(",", ".");
      }

      const n = Number(cleaned);
      return Number.isFinite(n) ? n : def;
    }
    return def;
  }
  private parseVolumeMT(v: any) {
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
    excludeFixingId?: string;
  }) {
    const v = this.getVesselByName(params.vesselName ?? "");
    if (!v) return;

    const plannedTotal = this.parseNumberLoose(v.quantityTotal, 0);
    const allocations = (v.gradeAllocations ?? []).map(a => ({ ...a, gradeName: String(a.gradeName).trim() }));
    if (!plannedTotal && allocations.length === 0) return;

    const newQty = this.parseVolumeMT(params.volume);
    const gradeName = String(params.grade || "").trim();
    const { byGrade, total } = this.computeVesselConsumption(v.name, params.excludeFixingId);

    // tolère les données seedées déjà hors-plan: on bloque seulement si on aggrave au-delà
    if (plannedTotal > 0) {
      const currentOverflow = Math.max(0, total - plannedTotal);
      if (total + newQty > plannedTotal + 1e-9 && currentOverflow <= 1e-9) {
        const remain = Math.max(0, plannedTotal - total);
        const err: any = new Error(
          `Plan capacity exceeded for vessel "${v.name}": total ${total + newQty} MT > planned ${plannedTotal} MT (remaining ${remain} MT).`
        );
        err.status = 409;
        throw err;
      }
    }

    const planForGrade = allocations.find(a => a.gradeName.toLowerCase() === gradeName.toLowerCase());
    if (planForGrade) {
      const used = byGrade.get(gradeName) || 0;
      const currentOverflow = Math.max(0, used - planForGrade.qty);
      if (used + newQty > planForGrade.qty + 1e-9 && currentOverflow <= 1e-9) {
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

  private normalizeFixingPayload(data: any, existing?: any) {
    const normalized = {
      ...(existing || {}),
      ...data,
    };

    normalized.date = String(normalized.date || existing?.date || new Date().toISOString().slice(0, 10));
    normalized.route = String(normalized.route || existing?.route || "N/A");
    normalized.grade = String(normalized.grade || existing?.grade || "");
    normalized.volume = String(normalized.volume || existing?.volume || "");
    normalized.priceUsd =
      normalized.priceUsd === "" || normalized.priceUsd == null
        ? undefined
        : Number(normalized.priceUsd);
    normalized.counterparty = String(normalized.counterparty || existing?.counterparty || "");
    normalized.vessel = normalized.vessel ? String(normalized.vessel) : undefined;
    normalized.freightUsd =
      normalized.freightUsd === "" || normalized.freightUsd == null
        ? undefined
        : Number(normalized.freightUsd);

    if (!normalized.grade) {
      const err: any = new Error("Missing grade");
      err.status = 400;
      throw err;
    }
    if (!normalized.date) {
      const err: any = new Error("Missing date");
      err.status = 400;
      throw err;
    }
    if (!normalized.volume || this.parseVolumeMT(normalized.volume) <= 0) {
      const err: any = new Error("Volume must be greater than 0");
      err.status = 400;
      throw err;
    }
    if (normalized.priceUsd == null || !Number.isFinite(normalized.priceUsd)) {
      const err: any = new Error("Invalid FOB price");
      err.status = 400;
      throw err;
    }
    if (!normalized.counterparty) {
      const err: any = new Error("Missing counterparty");
      err.status = 400;
      throw err;
    }

    return normalized;
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
        if (/^[A-Z0-9]+$/.test(clean) && clean.length > 1 && clean === clean.toUpperCase()) return clean;
        return clean[0].toUpperCase();
      })
      .filter(Boolean);
    return (parts.join("") || "FIX").toUpperCase();
  }
  /** séquence suivante (globale par année) depuis les codes existants */
  private nextFixingSeqForYear(year: number, excludeFixingId?: string): number {
    const re = new RegExp(`^[A-Z0-9]+${year}(\\d{5,})$`);
    let maxSeq = 0;
    for (const f of this.fixings.values()) {
      if (excludeFixingId && (f as any).id === excludeFixingId) continue;
      const m = String((f as any).code || "").match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
    }
    return maxSeq + 1;
  }
  /** Construit un code unique: ACRONYME_GRADE + YYYY + séquence(5) */
  private buildFixingCode(gradeName: string, dateIso?: string, excludeFixingId?: string): string {
    const acronym = this.makeGradeAcronym(gradeName);
    const d = dateIso ? new Date(dateIso) : new Date();
    const year = d.getFullYear();
    let seq = this.nextFixingSeqForYear(year, excludeFixingId);

    const used = new Set(
      Array.from(this.fixings.values())
        .filter((x: any) => !excludeFixingId || x.id !== excludeFixingId)
        .map((x: any) => x.code)
        .filter(Boolean) as string[]
    );
    let code = `${acronym}${year}${String(seq).padStart(5, "0")}`;
    while (used.has(code)) {
      seq += 1;
      code = `${acronym}${year}${String(seq).padStart(5, "0")}`;
    }
    return code;
  }

  // ---- Affectations contrats/fixings ----
  private async computeContractRequirements(contract: Contract): Promise<ContractRequirement[]> {
    const product = this.products.get(contract.productId);
    const snapshotComposition = (contract as any).productComposition;

    // Important: un contrat conserve la composition produit utilisée à sa création.
    // Les changements futurs de composition produit ne doivent pas modifier les anciens contrats.
    const composition: ProductComponent[] =
      Array.isArray(snapshotComposition) && snapshotComposition.length
        ? snapshotComposition
        : product?.composition || [];

    if (!composition.length) return [];

    const qty = Number(contract.quantityTons) || 0;

    return composition
      .map((c) => ({
        id: randomUUID(),
        contractId: contract.id,
        gradeName: String(c.gradeName || "").trim(),
        requiredQty: Math.round((((qty * Number(c.percent || 0)) / 100) + Number.EPSILON) * 1000) / 1000,
      }))
      .filter((r) => r.gradeName && r.requiredQty > 0);
  }

  private replaceContractRequirements(contractId: string, rows: ContractRequirement[]) {
    this.db.prepare(`DELETE FROM contract_requirements WHERE contract_id = ?`).run(contractId);
    const stmt = this.db.prepare(`
      INSERT INTO contract_requirements (id, contract_id, grade_name, required_qty)
      VALUES (?, ?, ?, ?)
    `);
    for (const r of rows) {
      stmt.run(r.id, r.contractId, r.gradeName, r.requiredQty);
    }
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
      CREATE TABLE IF NOT EXISTS target_margins (
        id TEXT PRIMARY KEY,
        market TEXT NOT NULL,
        client_id TEXT,
        client_name TEXT NOT NULL,
        product_id TEXT,
        product_name TEXT NOT NULL,
        margin_tnd REAL,
        margin_usd REAL,
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
        product_composition_json TEXT,
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
      CREATE TABLE IF NOT EXISTS contract_requirements (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        grade_name TEXT NOT NULL,
        required_qty REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contract_fixing_allocations (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL,
        fixing_id TEXT NOT NULL,
        grade_name TEXT NOT NULL,
        allocated_qty REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fixings (
        id TEXT PRIMARY KEY,
        date TEXT,
        route TEXT,
        grade TEXT,
        volume TEXT,
        price_usd REAL,
        counterparty TEXT,
        vessel TEXT,
        freight_usd REAL,
        notes TEXT,
        code TEXT
      );
      CREATE TABLE IF NOT EXISTS vessels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT,
        dwt REAL,
        status TEXT,
        eta TEXT,
        origin TEXT,
        destination TEXT,
        tender TEXT,
        supplier TEXT,
        quantity_total REAL,
        grade_allocations_json TEXT
      );
    `);

    // Migration douce pour les bases déjà créées avant l'ajout du snapshot produit.
    try {
      this.db.prepare(`ALTER TABLE contracts ADD COLUMN product_composition_json TEXT`).run();
    } catch {
      // Column already exists.
    }
  }

  private upsertFixingToSqlite(f: any) {
    this.db.prepare(`
      INSERT INTO fixings (
        id, date, route, grade, volume, price_usd, counterparty, vessel, freight_usd, notes, code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        route = excluded.route,
        grade = excluded.grade,
        volume = excluded.volume,
        price_usd = excluded.price_usd,
        counterparty = excluded.counterparty,
        vessel = excluded.vessel,
        freight_usd = excluded.freight_usd,
        notes = excluded.notes,
        code = excluded.code
    `).run(
      f.id,
      f.date ?? null,
      f.route ?? null,
      f.grade ?? null,
      f.volume ?? null,
      f.priceUsd ?? null,
      f.counterparty ?? null,
      f.vessel ?? null,
      f.freightUsd ?? null,
      f.notes ?? null,
      f.code ?? null
    );
  }

  private upsertVesselToSqlite(v: Vessel) {
    this.db.prepare(`
      INSERT INTO vessels (
        id, name, type, dwt, status, eta, origin, destination, tender, supplier, quantity_total, grade_allocations_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        dwt = excluded.dwt,
        status = excluded.status,
        eta = excluded.eta,
        origin = excluded.origin,
        destination = excluded.destination,
        tender = excluded.tender,
        supplier = excluded.supplier,
        quantity_total = excluded.quantity_total,
        grade_allocations_json = excluded.grade_allocations_json
    `).run(
      v.id,
      v.name,
      v.type ?? null,
      v.dwt ?? null,
      v.status ?? null,
      v.eta ?? null,
      v.origin ?? null,
      v.destination ?? null,
      v.tender ?? null,
      v.supplier ?? null,
      v.quantityTotal ?? null,
      JSON.stringify(v.gradeAllocations || [])
    );
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

    const fixingCount = Number((this.db.prepare(`SELECT COUNT(*) as c FROM fixings`).get() as any).c || 0);
    if (fixingCount === 0) {
      for (const f of this.fixings.values()) {
        this.upsertFixingToSqlite(f);
      }
    }

    const vesselCount = Number((this.db.prepare(`SELECT COUNT(*) as c FROM vessels`).get() as any).c || 0);
    if (vesselCount === 0) {
      for (const v of this.vessels.values()) {
        this.upsertVesselToSqlite(v);
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

    this.targetMargins.clear();
    const targetMarginRows = this.db.prepare(`SELECT * FROM target_margins ORDER BY market, client_name, product_name`).all() as any[];
    for (const r of targetMarginRows) {
      this.targetMargins.set(r.id, {
        id: r.id,
        market: r.market,
        clientId: r.client_id ?? undefined,
        clientName: r.client_name,
        productId: r.product_id ?? undefined,
        productName: r.product_name,
        marginTnd: r.margin_tnd == null ? undefined : Number(r.margin_tnd),
        marginUsd: r.margin_usd == null ? undefined : Number(r.margin_usd),
        updatedAt: r.updated_at,
      } as TargetMargin);
    }

    this.contracts.clear();
    this.contractCounters.clear();
    const contractRows = this.db.prepare(`SELECT * FROM contracts ORDER BY contract_date DESC, created_at DESC`).all() as any[];
    for (const r of contractRows) {
      const c: Contract = ({
        id: r.id,
        code: r.code,
        market: r.market,
        contractDate: r.contract_date,
        clientId: r.client_id,
        clientName: r.client_name,
        productId: r.product_id,
        productName: r.product_name,
        productComposition: (() => {
          try {
            return JSON.parse(r.product_composition_json || '[]');
          } catch {
            return [];
          }
        })(),
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
      } as any);
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

    this.fixings.clear();
    const fixingRows = this.db.prepare(`SELECT * FROM fixings ORDER BY date DESC`).all() as any[];
    for (const r of fixingRows) {
      this.fixings.set(r.id, {
        id: r.id,
        date: r.date ?? undefined,
        route: r.route ?? undefined,
        grade: r.grade ?? undefined,
        volume: r.volume ?? undefined,
        priceUsd: r.price_usd == null ? undefined : Number(r.price_usd),
        counterparty: r.counterparty ?? undefined,
        vessel: r.vessel ?? undefined,
        freightUsd: r.freight_usd == null ? undefined : Number(r.freight_usd),
        notes: r.notes ?? undefined,
        code: r.code ?? undefined,
      });
    }

    this.vessels.clear();
    const vesselRows = this.db.prepare(`SELECT * FROM vessels ORDER BY name`).all() as any[];
    for (const r of vesselRows) {
      let gradeAllocations: GradeAllocation[] = [];
      try {
        gradeAllocations = JSON.parse(r.grade_allocations_json || '[]');
      } catch {
        gradeAllocations = [];
      }
      this.vessels.set(r.id, {
        id: r.id,
        name: r.name,
        type: r.type ?? undefined,
        dwt: r.dwt == null ? undefined : Number(r.dwt),
        status: r.status ?? undefined,
        eta: r.eta ?? undefined,
        origin: r.origin ?? undefined,
        destination: r.destination ?? undefined,
        tender: r.tender ?? undefined,
        supplier: r.supplier ?? undefined,
        quantityTotal: r.quantity_total == null ? undefined : Number(r.quantity_total),
        gradeAllocations,
      });
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
        tender: "Tender 2025", supplier: "Wilmar", quantityTotal: 5000,
        gradeAllocations: [
          { gradeName: "RBD PO", qty: 5000 }
        ] },
      { name: "August shipment 25",  type: "Tanker", dwt: 38000, status: "Ballast",  eta: "2025-08-28", origin: "Belawan",     destination: "Rades",
        tender: "Tender 2025", supplier: "Musim Mas", quantityTotal: 3000,
        gradeAllocations: [
          { gradeName: "RBD PKO", qty: 3000 }
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
    const normalized = this.normalizeFixingPayload(data);

    this.assertFixingFitsVesselPlan({
      vesselName: normalized.vessel,
      grade: normalized.grade,
      volume: normalized.volume,
    });

    const id = randomUUID();
    const code =
      normalized.code && String(normalized.code).trim().length
        ? String(normalized.code).trim()
        : this.buildFixingCode(normalized.grade, normalized.date);

    const f = {
      id,
      date: normalized.date,
      route: normalized.route,
      grade: normalized.grade,
      volume: normalized.volume,
      priceUsd: normalized.priceUsd,
      counterparty: normalized.counterparty,
      vessel: normalized.vessel || undefined,
      freightUsd: normalized.freightUsd,
      notes: normalized.notes,
      code, // ✅ nouveau
    };

    this.fixings.set(id, f);
    this.upsertFixingToSqlite(f);

    if (f.vessel && !Array.from(this.vessels.values()).some((v: any) => v.name === f.vessel)) {
      const vId = randomUUID();
      const vessel = { id: vId, name: f.vessel, type: "Tanker", dwt: 0, status: "Planned" };
      this.vessels.set(vId, vessel);
      this.upsertVesselToSqlite(vessel);
    }
    return f;
  }

  async updateFixing(id: string, data: any) {
    const existing = this.fixings.get(id);
    if (!existing) {
      const err: any = new Error("Fixing not found");
      err.status = 404;
      throw err;
    }

    const next = this.normalizeFixingPayload(data, existing);
    next.id = id;

    const gradeChanged =
      String(next.grade || "").trim().toLowerCase() !==
      String(existing.grade || "").trim().toLowerCase();

    const allocationSummary = this.db.prepare(`
      SELECT COUNT(*) as c, COALESCE(SUM(allocated_qty), 0) as total
      FROM contract_fixing_allocations
      WHERE fixing_id = ?
    `).get(id) as any;
    const hasAllocations = Number(allocationSummary?.c || 0) > 0;
    const allocatedQty = Number(allocationSummary?.total || 0);

    if (gradeChanged && hasAllocations) {
      const err: any = new Error("Impossible de changer le grade : ce fixing est déjà affecté à un contrat.");
      err.status = 409;
      throw err;
    }

    const newFixingQty = this.parseVolumeMT(next.volume);
    if (newFixingQty + 1e-9 < allocatedQty) {
      const err: any = new Error(
        `Impossible de réduire la quantité du fixing sous la quantité déjà affectée (${allocatedQty} MT).`
      );
      err.status = 409;
      throw err;
    }

    const existingYear = new Date(existing.date || new Date()).getFullYear();
    const nextYear = new Date(next.date || new Date()).getFullYear();
    const yearChanged = existingYear !== nextYear;

    const incomingCode =
      data.code !== undefined && data.code !== null ? String(data.code).trim() : "";
    const existingCode = String(existing.code || "").trim();
    const userChangedCodeManually = incomingCode.length > 0 && incomingCode !== existingCode;

    if (userChangedCodeManually) {
      next.code = incomingCode;
    } else if (gradeChanged || yearChanged || !existingCode) {
      next.code = this.buildFixingCode(next.grade, next.date, id);
    } else {
      next.code = existing.code;
    }

    this.assertFixingFitsVesselPlan({
      vesselName: next.vessel,
      grade: next.grade,
      volume: next.volume,
      excludeFixingId: id,
    });

    this.fixings.set(id, next);
    this.upsertFixingToSqlite(next);
    if (next.vessel && !Array.from(this.vessels.values()).some((v: any) => v.name === next.vessel)) {
      const vId = randomUUID();
      const vessel = { id: vId, name: next.vessel, type: "Tanker", dwt: 0, status: "Unknown" };
      this.vessels.set(vId, vessel);
      this.upsertVesselToSqlite(vessel);
    }
    return next;
  }
  async deleteFixing(id: string) {
    const used = this.db.prepare(`
      SELECT COUNT(*) as c
      FROM contract_fixing_allocations
      WHERE fixing_id = ?
    `).get(id) as any;

    if (Number(used?.c || 0) > 0) {
      const err: any = new Error("Impossible de supprimer ce fixing : il est déjà affecté à un ou plusieurs contrats.");
      err.status = 409;
      throw err;
    }

    this.db.prepare(`DELETE FROM fixings WHERE id = ?`).run(id);
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
      quantityTotal: this.parseNumberLoose(data.quantityTotal ?? data.totalQtyMt, 0) || undefined,
gradeAllocations: Array.isArray(data.gradeAllocations ?? data.allocations)
  ? (data.gradeAllocations ?? data.allocations)
            .map((a:any)=>({
              gradeId: a.gradeId ? Number(a.gradeId) : undefined,
              gradeName: String(a.gradeName || "").trim(),
              qty: this.parseNumberLoose(a.qty ?? a.qtyMt, 0),
            }))
            .filter((a:any)=> a.gradeName && a.qty > 0)
        : undefined,
    };
    this.vessels.set(id, v);
    this.upsertVesselToSqlite(v);
    return v;
  }
  async updateVessel(id: string, data: any) {
    const existing = this.vessels.get(id);
    if (!existing) throw new Error("Vessel not found");

    const consumption = this.computeVesselConsumption(existing.name);

    const hasQuantity = data.quantityTotal !== undefined || data.totalQtyMt !== undefined;
    const nextQuantityTotal = hasQuantity
      ? (this.parseNumberLoose(data.quantityTotal ?? data.totalQtyMt, 0) || undefined)
      : existing.quantityTotal;

    const rawAllocations = Array.isArray(data.gradeAllocations)
      ? data.gradeAllocations
      : Array.isArray(data.allocations)
        ? data.allocations
        : undefined;

    const nextGradeAllocations = rawAllocations
      ? rawAllocations
          .map((a: any) => ({
            gradeId: a.gradeId ? Number(a.gradeId) : undefined,
            gradeName: String(a.gradeName || a.grade || "").trim(),
            qty: this.parseNumberLoose(a.qty ?? a.qtyMt ?? a.quantity ?? a.quantityMt, 0),
          }))
          .filter((a: any) => a.gradeName && a.qty > 0)
      : existing.gradeAllocations;

    if (nextQuantityTotal !== undefined && nextQuantityTotal + 1e-9 < consumption.total) {
      const err: any = new Error(
        `Impossible de réduire la quantité totale du navire sous la quantité déjà fixée (${consumption.total} MT).`
      );
      err.status = 409;
      throw err;
    }

    if (nextGradeAllocations && nextGradeAllocations.length) {
      for (const plan of nextGradeAllocations) {
        const used = consumption.byGrade.get(String(plan.gradeName || "").trim()) || 0;
        if (Number(plan.qty || 0) + 1e-9 < used) {
          const err: any = new Error(
            `Impossible de réduire le plan ${plan.gradeName} sous la quantité déjà fixée (${used} MT).`
          );
          err.status = 409;
          throw err;
        }
      }

      for (const [gradeName, used] of consumption.byGrade.entries()) {
        const stillPlanned = nextGradeAllocations.some(
          (p) => String(p.gradeName || "").trim().toLowerCase() === gradeName.toLowerCase()
        );
        if (!stillPlanned && used > 0) {
          const err: any = new Error(
            `Impossible de retirer ${gradeName} du plan : ${used} MT sont déjà fixés sur ce navire.`
          );
          err.status = 409;
          throw err;
        }
      }
    }

    const next: Vessel = {
      ...existing,
      ...data,
      id,
      name: data.name !== undefined ? String(data.name).trim() : existing.name,
      dwt: data.dwt !== undefined ? this.parseNumberLoose(data.dwt, existing.dwt ?? 0) : existing.dwt,
      type: data.type || existing.type || "Tanker",
      status: data.status || existing.status || "Unknown",
      eta: data.eta !== undefined ? (data.eta || undefined) : existing.eta,
      origin: data.origin !== undefined ? (data.origin || undefined) : existing.origin,
      destination: data.destination !== undefined ? (data.destination || undefined) : existing.destination,
      tender: data.tender !== undefined ? (data.tender || undefined) : existing.tender,
      supplier: data.supplier !== undefined ? (data.supplier || undefined) : existing.supplier,
      quantityTotal: nextQuantityTotal,
      gradeAllocations: nextGradeAllocations,
    };

    if (!next.name) {
      const err: any = new Error("Vessel name is required");
      err.status = 400;
      throw err;
    }

    this.vessels.set(id, next);
    this.upsertVesselToSqlite(next);
    return next;
  }

  async deleteVessel(id: string) {
    const vessel = this.vessels.get(id);
    if (!vessel) return;

    const hasFixings = Array.from(this.fixings.values()).some(
      (f: any) => String(f.vessel || "").trim().toLowerCase() === String(vessel.name || "").trim().toLowerCase()
    );

    if (hasFixings) {
      const err: any = new Error("Impossible de supprimer ce navire : des fixings y sont liés.");
      err.status = 409;
      throw err;
    }

    this.db.prepare(`DELETE FROM vessels WHERE id = ?`).run(id);
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
    const used = this.db.prepare(`
      SELECT COUNT(*) as c
      FROM contracts
      WHERE product_id = ?
    `).get(id) as any;

    if (Number(used?.c || 0) > 0) {
      const err: any = new Error("Impossible de supprimer ce produit : il est utilisé dans des contrats.");
      err.status = 409;
      throw err;
    }

    this.db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    this.products.delete(id);
  }



  // ------------------- Marges cibles -------------------
  private normalizeTargetMargin(data: InsertTargetMargin | Partial<TargetMargin>, existing?: TargetMargin): TargetMargin {
    const market = (data.market ?? existing?.market ?? "LOCAL") === "EXPORT" ? "EXPORT" : "LOCAL";
    const clientName = String(data.clientName ?? existing?.clientName ?? "").trim();
    const productName = String(data.productName ?? existing?.productName ?? "").trim();
    if (!clientName) { const err: any = new Error("Client requis pour la marge cible."); err.status = 400; throw err; }
    if (!productName) { const err: any = new Error("Produit requis pour la marge cible."); err.status = 400; throw err; }
    const marginTnd = data.marginTnd === null || data.marginTnd === undefined || data.marginTnd === ("" as any) ? undefined : Number(data.marginTnd);
    const marginUsd = data.marginUsd === null || data.marginUsd === undefined || data.marginUsd === ("" as any) ? undefined : Number(data.marginUsd);
    if (market === "LOCAL" && (marginTnd === undefined || !Number.isFinite(marginTnd))) { const err: any = new Error("M/MAT TND est requis pour le marché LOCAL."); err.status = 400; throw err; }
    if (market === "EXPORT" && (marginUsd === undefined || !Number.isFinite(marginUsd))) { const err: any = new Error("M/MAT USD est requis pour le marché EXPORT."); err.status = 400; throw err; }
    const id = existing?.id ?? (data.id ? String(data.id) : randomUUID());
    return { id, market, clientId: data.clientId ?? existing?.clientId, clientName, productId: data.productId ?? existing?.productId, productName, marginTnd: market === "LOCAL" ? marginTnd : undefined, marginUsd: market === "EXPORT" ? marginUsd : undefined, updatedAt: new Date().toISOString() } as TargetMargin;
  }

  private upsertTargetMarginToSqlite(row: TargetMargin) {
    this.db.prepare(`
      INSERT INTO target_margins (id, market, client_id, client_name, product_id, product_name, margin_tnd, margin_usd, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET market = excluded.market, client_id = excluded.client_id, client_name = excluded.client_name, product_id = excluded.product_id, product_name = excluded.product_name, margin_tnd = excluded.margin_tnd, margin_usd = excluded.margin_usd, updated_at = excluded.updated_at
    `).run(row.id, row.market, row.clientId ?? null, row.clientName, row.productId ?? null, row.productName, row.marginTnd ?? null, row.marginUsd ?? null, row.updatedAt);
  }

  async getAllTargetMargins() {
    this.loadSqliteToMaps();
    return Array.from(this.targetMargins.values()).sort((a, b) => `${a.market}-${a.clientName}-${a.productName}`.localeCompare(`${b.market}-${b.clientName}-${b.productName}`));
  }
  async createTargetMargin(data: InsertTargetMargin) { const row = this.normalizeTargetMargin(data); this.upsertTargetMarginToSqlite(row); this.targetMargins.set(row.id, row); return row; }
  async updateTargetMargin(id: string, data: Partial<Omit<TargetMargin, "id" | "updatedAt">>) { const existing = this.targetMargins.get(id); if (!existing) { const err: any = new Error("Marge cible introuvable."); err.status = 404; throw err; } const row = this.normalizeTargetMargin(data, existing); this.upsertTargetMarginToSqlite(row); this.targetMargins.set(id, row); return row; }
  async deleteTargetMargin(id: string) { this.db.prepare(`DELETE FROM target_margins WHERE id = ?`).run(id); this.targetMargins.delete(id); }
  async replaceTargetMargins(rows: InsertTargetMargin[]) { this.db.prepare(`DELETE FROM target_margins`).run(); this.targetMargins.clear(); const saved: TargetMargin[] = []; for (const item of rows) { const row = this.normalizeTargetMargin(item); this.upsertTargetMarginToSqlite(row); this.targetMargins.set(row.id, row); saved.push(row); } return saved; }


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
    const used = this.db.prepare(`
      SELECT COUNT(*) as c
      FROM contracts
      WHERE client_id = ?
    `).get(id) as any;

    if (Number(used?.c || 0) > 0) {
      const err: any = new Error("Impossible de supprimer ce client : il est utilisé dans des contrats.");
      err.status = 409;
      throw err;
    }

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
    const productForSnapshot = data.productId ? this.products.get(data.productId) : undefined;
    let productName = data.productName;
    if (!productName && productForSnapshot) {
      productName = productForSnapshot.name;
    }

    const productComposition: ProductComponent[] = Array.isArray((data as any).productComposition)
      ? (data as any).productComposition
          .map((c: any) => ({ gradeName: String(c.gradeName || "").trim(), percent: Number(c.percent) || 0 }))
          .filter((c: any) => c.gradeName && c.percent !== 0)
      : (productForSnapshot?.composition || []);

    const normalizedPriceCurrency: "USD" | "TND" = market === "LOCAL" ? "TND" : "USD";
    const normalizedPriceUsd = normalizedPriceCurrency === "USD" && data.priceUsd !== undefined
      ? Number(data.priceUsd)
      : undefined;
    const normalizedPriceTnd = normalizedPriceCurrency === "TND" && data.priceTnd !== undefined
      ? Number(data.priceTnd)
      : undefined;

    const c: Contract = ({
      id,
      code,
      market,
      contractDate,
      clientId: data.clientId,
      clientName: clientName || "—",
      productId: data.productId,
      productName: productName || "—",
      productComposition,
      quantityTons: Number(data.quantityTons),
      priceCurrency: normalizedPriceCurrency,
      priceUsd: normalizedPriceUsd,
      priceTnd: normalizedPriceTnd,
      fxRate: data.fxRate !== undefined ? Number(data.fxRate) : undefined,
      startDate: data.startDate,
      endDate: data.endDate,
      notes: data.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    this.db.prepare(`
      INSERT INTO contracts (
        id, code, market, contract_date, client_id, client_name, product_id, product_name,
        product_composition_json, quantity_tons, price_currency, price_usd, price_tnd, fx_rate, start_date, end_date,
        notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      c.id, c.code, c.market, c.contractDate, c.clientId, c.clientName, c.productId, c.productName,
      JSON.stringify((c as any).productComposition || []),
      c.quantityTons, c.priceCurrency, c.priceUsd ?? null, c.priceTnd ?? null, c.fxRate ?? null,
      c.startDate ?? null, c.endDate ?? null, c.notes ?? null, c.createdAt, c.updatedAt
    );

    this.contracts.set(id, c);

    const requirements = await this.computeContractRequirements(c);
    this.replaceContractRequirements(c.id, requirements);

    return c;
  }

  async updateContract(
    id: string,
    data: Partial<Omit<Contract, "id" | "createdAt" | "updatedAt">>
  ) {
    const existing = this.contracts.get(id);
    if (!existing) throw new Error("Contract not found");

    const existingAllocations = await this.getContractAllocations(id);
    const hasAllocations = existingAllocations.length > 0;

    if (hasAllocations && data.productId !== undefined && data.productId !== existing.productId) {
      const err: any = new Error("Impossible de modifier le produit : ce contrat a déjà des fixings affectés.");
      err.status = 409;
      throw err;
    }

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

    let nextProductName = existing.productName;
    let nextProductComposition = (existing as any).productComposition || [];

    if (!hasAllocations && data.productId !== undefined && data.productId !== existing.productId) {
      const p = this.products.get(data.productId);
      nextProductName = data.productName || p?.name || existing.productName;
      nextProductComposition = p?.composition || [];
    } else if (data.productName !== undefined) {
      nextProductName = data.productName;
    }

    const normalizedPriceCurrency: "USD" | "TND" = nextMarket === "LOCAL" ? "TND" : "USD";
    const next: Contract = ({
      ...existing,
      ...data,
      code: nextCode,
      contractDate: nextDate,
      market: nextMarket,
      productName: nextProductName,
      productComposition: nextProductComposition,
      quantityTons: data.quantityTons !== undefined ? Number(data.quantityTons) : existing.quantityTons,
      priceCurrency: normalizedPriceCurrency,
      priceUsd:
        normalizedPriceCurrency === "USD"
          ? (data.priceUsd !== undefined ? Number(data.priceUsd) : existing.priceUsd)
          : undefined,
      priceTnd:
        normalizedPriceCurrency === "TND"
          ? (data.priceTnd !== undefined ? Number(data.priceTnd) : existing.priceTnd)
          : undefined,
      fxRate: data.fxRate !== undefined ? Number(data.fxRate) : existing.fxRate,
      updatedAt: new Date().toISOString(),
    } as any);

    if (hasAllocations && data.quantityTons !== undefined) {
      const nextRequirements = await this.computeContractRequirements(next);
      const requiredByGrade = new Map(
        nextRequirements.map((r) => [r.gradeName.toLowerCase(), Number(r.requiredQty || 0)])
      );

      const allocatedByGrade = new Map<string, number>();
      for (const a of existingAllocations) {
        const key = a.gradeName.toLowerCase();
        allocatedByGrade.set(key, (allocatedByGrade.get(key) || 0) + Number(a.allocatedQty || 0));
      }

      for (const [gradeName, allocated] of allocatedByGrade.entries()) {
        const required = requiredByGrade.get(gradeName) || 0;
        if (allocated > required + 1e-9) {
          const err: any = new Error(
            `Impossible de réduire la quantité du contrat : ${allocated} MT sont déjà affectés sur ${gradeName}.`
          );
          err.status = 409;
          throw err;
        }
      }
    }

    this.db.prepare(`
      UPDATE contracts SET
        code = ?, market = ?, contract_date = ?, client_id = ?, client_name = ?, product_id = ?, product_name = ?,
        product_composition_json = ?, quantity_tons = ?, price_currency = ?, price_usd = ?, price_tnd = ?, fx_rate = ?, start_date = ?, end_date = ?,
        notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.code, next.market, next.contractDate, next.clientId, next.clientName, next.productId, next.productName,
      JSON.stringify((next as any).productComposition || []),
      next.quantityTons, next.priceCurrency, next.priceUsd ?? null, next.priceTnd ?? null, next.fxRate ?? null,
      next.startDate ?? null, next.endDate ?? null, next.notes ?? null, next.updatedAt, id
    );

    this.contracts.set(id, next);

    const requirements = await this.computeContractRequirements(next);
    this.replaceContractRequirements(id, requirements);

    return next;
  }

  async deleteContract(id: string) {
    const used = this.db.prepare(`
      SELECT COUNT(*) as c
      FROM contract_fixing_allocations
      WHERE contract_id = ?
    `).get(id) as any;

    if (Number(used?.c || 0) > 0) {
      const err: any = new Error("Impossible de supprimer ce contrat : des fixings sont affectés.");
      err.status = 409;
      throw err;
    }

    this.db.prepare(`DELETE FROM contract_requirements WHERE contract_id = ?`).run(id);
    this.db.prepare(`DELETE FROM contracts WHERE id = ?`).run(id);
    this.contracts.delete(id);
  }

  // ------------------- Affectations contrats / fixings -------------------
  async getContractAllocations(contractId: string): Promise<ContractFixingAllocation[]> {
    const rows = this.db.prepare(`
      SELECT id, contract_id, fixing_id, grade_name, allocated_qty
      FROM contract_fixing_allocations
      WHERE contract_id = ?
      ORDER BY grade_name, id
    `).all(contractId) as any[];

    return rows.map((r) => ({
      id: r.id,
      contractId: r.contract_id,
      fixingId: r.fixing_id,
      gradeName: r.grade_name,
      allocatedQty: Number(r.allocated_qty),
    }));
  }

  async getFixingAvailableQty(fixingId: string): Promise<number> {
    const fixing = this.fixings.get(fixingId);
    if (!fixing) return 0;

    const row = this.db.prepare(`
      SELECT SUM(allocated_qty) as used
      FROM contract_fixing_allocations
      WHERE fixing_id = ?
    `).get(fixingId) as any;

    const used = Number(row?.used || 0);
    const total = this.parseVolumeMT(fixing.volume);

    return Math.max(0, total - used);
  }

async getContractRequirements(contractId: string): Promise<ContractRequirement[]> {
  this.loadSqliteToMaps();

  let rows = this.db.prepare(`
    SELECT id, contract_id, grade_name, required_qty
    FROM contract_requirements
    WHERE contract_id = ?
    ORDER BY grade_name
  `).all(contractId) as any[];

  if (!rows.length) {
    const contract = this.contracts.get(contractId);
    if (contract) {
      const computed = await this.computeContractRequirements(contract);
      if (computed.length) {
        this.replaceContractRequirements(contractId, computed);
        rows = this.db.prepare(`
          SELECT id, contract_id, grade_name, required_qty
          FROM contract_requirements
          WHERE contract_id = ?
          ORDER BY grade_name
        `).all(contractId) as any[];
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    contractId: r.contract_id,
    gradeName: r.grade_name,
    requiredQty: Number(r.required_qty),
  }));
}

async allocateFixing(data: {
  contractId: string;
  fixingId: string;
  gradeName: string;
  qty: number;
}): Promise<ContractFixingAllocation> {
  this.loadSqliteToMaps();

  const contract = this.contracts.get(data.contractId);
  if (!contract) {
    const err: any = new Error("Contract not found");
    err.status = 404;
    throw err;
  }

  const fixing = this.fixings.get(data.fixingId);
  if (!fixing) {
    const err: any = new Error("Fixing not found");
    err.status = 404;
    throw err;
  }

  const qty = Number(data.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    const err: any = new Error("Allocation qty must be > 0");
    err.status = 400;
    throw err;
  }

  const fixingGrade = String(fixing.grade || "").trim();
  const wantedGrade = String(data.gradeName || "").trim();
  if (fixingGrade.toLowerCase() !== wantedGrade.toLowerCase()) {
    const err: any = new Error(`Fixing grade mismatch. Expected ${wantedGrade}, got ${fixingGrade}`);
    err.status = 400;
    throw err;
  }

  const requirements = await this.getContractRequirements(data.contractId);
  const req = requirements.find((r) => r.gradeName.toLowerCase() === wantedGrade.toLowerCase());
  if (!req) {
    const err: any = new Error(`No requirement found for grade ${wantedGrade}`);
    err.status = 400;
    throw err;
  }

  const allocations = await this.getContractAllocations(data.contractId);
  const sameGradeAllocs = allocations.filter((a) => a.gradeName.toLowerCase() === wantedGrade.toLowerCase());
  const existingForSameFixing = sameGradeAllocs.find((a) => a.fixingId === data.fixingId);

  const distinctFixings = new Set(sameGradeAllocs.map((a) => a.fixingId));
  if (!existingForSameFixing && distinctFixings.size >= 3) {
    const err: any = new Error(`Maximum 3 fixings allowed for grade ${wantedGrade}`);
    err.status = 400;
    throw err;
  }

  const alreadyAllocatedForGrade = sameGradeAllocs.reduce((s, a) => s + Number(a.allocatedQty || 0), 0);
  if (alreadyAllocatedForGrade + qty > req.requiredQty + 1e-9) {
    const remain = Math.max(0, req.requiredQty - alreadyAllocatedForGrade);
    const err: any = new Error(`Required quantity exceeded for ${wantedGrade}. Remaining to cover: ${remain} MT.`);
    err.status = 409;
    throw err;
  }

  const available = await this.getFixingAvailableQty(data.fixingId);
  if (qty > available + 1e-9) {
    const err: any = new Error(`Not enough quantity available in fixing. Available: ${available} MT.`);
    err.status = 409;
    throw err;
  }

  if (existingForSameFixing) {
    const newQty = existingForSameFixing.allocatedQty + qty;
    this.db.prepare(`
      UPDATE contract_fixing_allocations
      SET allocated_qty = ?
      WHERE id = ?
    `).run(newQty, existingForSameFixing.id);

    return {
      ...existingForSameFixing,
      allocatedQty: newQty,
    };
  }

  const id = randomUUID();
  this.db.prepare(`
    INSERT INTO contract_fixing_allocations
    (id, contract_id, fixing_id, grade_name, allocated_qty)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.contractId, data.fixingId, wantedGrade, qty);

  return {
    id,
    contractId: data.contractId,
    fixingId: data.fixingId,
    gradeName: wantedGrade,
    allocatedQty: qty,
  };
}

  async deleteAllocation(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM contract_fixing_allocations WHERE id = ?`).run(id);
  }

  async getContractCoverage(contractId: string): Promise<number> {
    const reqs = await this.getContractRequirements(contractId);
    const allocs = await this.getContractAllocations(contractId);

    const map = new Map<string, number>();
    allocs.forEach((a) => {
      const key = a.gradeName.toLowerCase();
      map.set(key, (map.get(key) || 0) + a.allocatedQty);
    });

    let totalRequired = 0;
    let totalCovered = 0;

    for (const r of reqs) {
      totalRequired += r.requiredQty;
      totalCovered += Math.min(r.requiredQty, map.get(r.gradeName.toLowerCase()) || 0);
    }

    if (totalRequired <= 0) return 0;
    return totalCovered / totalRequired;
  }

  async getGradeAllocationSummary(): Promise<Array<{ gradeName: string; fixedQty: number; allocatedQty: number; unallocatedQty: number }>> {
    const fixedByGrade = new Map<string, number>();
    for (const f of this.fixings.values()) {
      const grade = String(f.grade || "").trim();
      if (!grade) continue;
      fixedByGrade.set(grade, (fixedByGrade.get(grade) || 0) + this.parseVolumeMT(f.volume));
    }

    const allocRows = this.db.prepare(`
      SELECT grade_name, SUM(allocated_qty) as allocated
      FROM contract_fixing_allocations
      GROUP BY grade_name
    `).all() as any[];

    const allocatedByGrade = new Map<string, number>();
    for (const r of allocRows) {
      allocatedByGrade.set(String(r.grade_name), Number(r.allocated || 0));
    }

    const grades = new Set<string>([
      ...Array.from(fixedByGrade.keys()),
      ...Array.from(allocatedByGrade.keys()),
    ]);

    return Array.from(grades)
      .sort((a, b) => a.localeCompare(b))
      .map((gradeName) => {
        const fixedQty = fixedByGrade.get(gradeName) || 0;
        const allocatedQty = allocatedByGrade.get(gradeName) || 0;
        return {
          gradeName,
          fixedQty,
          allocatedQty,
          unallocatedQty: fixedQty - allocatedQty,
        };
      });
  }
}

export const storage = new MemStorage();
