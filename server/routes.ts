import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import {
  loginSchema,
  insertChatMessageSchema,
  insertChatChannelSchema,
  insertProductSchema,
  // on évite d'importer des ZodEffects (.transform) pour .omit/.partial ici
  // insertClientSchema,
  // insertContractSchema,
} from "../shared/schema.ts";

function getErrorStatus(e: any, fallback = 400): number {
  const status = Number(e?.status);
  if (Number.isFinite(status) && status >= 400 && status < 600) return status;
  return fallback;
}

function getErrorMessage(e: any, fallback: string): string {
  return e?.message || fallback;
}

export async function registerRoutes(app: Express): Promise<Server> {
  /* ---------------- Auth ---------------- */
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = "demo-token";
      res.json({
        data: {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          token,
        },
      });
    } catch {
      res.status(400).json({ message: "Invalid login payload" });
    }
  });

  /* --------------- Oil Grades --------------- */
  app.get("/api/grades", async (_req, res) => {
    const grades = await storage.getAllOilGrades();
    res.json({ data: grades });
  });

  app.get("/api/grades/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const g = await storage.getOilGrade(id);
    if (!g) return res.status(404).json({ message: "Grade not found" });
    res.json({ data: g });
  });

  app.post("/api/grades", async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.name || typeof b.name !== "string") {
        return res.status(400).json({ message: "name is required" });
      }
      const created = await storage.createOilGrade({
        name: String(b.name).trim(),
        region: b.region ? String(b.region) : undefined,
        ffa: b.ffa ? String(b.ffa) : undefined,
        moisture: b.moisture ? String(b.moisture) : undefined,
        iv: b.iv ? String(b.iv) : undefined,
        dobi: b.dobi ? String(b.dobi) : undefined,
        // @ts-ignore
        freightUsd: b.freightUsd !== undefined ? Number(b.freightUsd) : undefined,
      } as any);
      res.json({ data: created });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to create grade") });
    }
  });

  app.put("/api/grades/:id/freight", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const freightUsd = Number(req.body?.freightUsd);
      if (!Number.isFinite(freightUsd)) {
        return res.status(400).json({ message: "freightUsd must be a number" });
      }
      const updated = await storage.updateOilGradeFreight(id, freightUsd);
      res.json({ data: updated });
    } catch (e: any) {
      res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Grade not found") });
    }
  });

  app.put("/api/grades/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const b = req.body || {};
      const patch: any = {};
      if (b.name !== undefined) patch.name = String(b.name).trim();
      if (b.region !== undefined) patch.region = b.region === "" ? undefined : String(b.region);
      if (b.ffa !== undefined) patch.ffa = b.ffa === "" ? undefined : String(b.ffa);
      if (b.moisture !== undefined) patch.moisture = b.moisture === "" ? undefined : String(b.moisture);
      if (b.iv !== undefined) patch.iv = b.iv === "" ? undefined : String(b.iv);
      if (b.dobi !== undefined) patch.dobi = b.dobi === "" ? undefined : String(b.dobi);
      if (b.freightUsd !== undefined) {
        if (b.freightUsd === "" || b.freightUsd === null) patch.freightUsd = undefined;
        else {
          const n = Number(b.freightUsd);
          if (!Number.isFinite(n)) return res.status(400).json({ message: "freightUsd must be a number" });
          patch.freightUsd = n;
        }
      }
      const maybeUpdate = (storage as any)?.updateOilGrade;
      let updated;
      if (typeof maybeUpdate === "function") {
        updated = await maybeUpdate.call(storage, id, patch);
      } else {
        if ("freightUsd" in patch && Object.keys(patch).length === 1) {
          updated = await storage.updateOilGradeFreight(id, patch.freightUsd);
        } else {
          return res.status(501).json({ message: "Generic grade update not supported by storage" });
        }
      }
      res.json({ data: updated });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to update grade") });
    }
  });

  // Forwards pour un grade
  app.get("/api/grades/:id/forwards", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const maybeGet = (storage as any)?.getForwardPricesByGrade;
      if (typeof maybeGet === "function") {
        const rows = await maybeGet.call(storage, id);
        return res.json({ data: rows });
      }
      const series = (await storage.getMarketDataByGrade(id)).sort((a: any, b: any) => a.date.localeCompare(b.date));
      if (!series.length) return res.status(404).json({ message: "No market data for grade" });

      const spot = series[series.length - 1];
      const base = Number(spot.priceUsd);
      const out: Array<{ gradeId: number; gradeName: string; period: string; code: string; askPrice: number }> = [];
      const monthAbbr = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const today = new Date();
      for (let i = 1; i <= 6; i++) {
        const d = new Date(today);
        d.setMonth(d.getMonth() + i);
        const m = monthAbbr[d.getMonth()];
        const y = (d.getFullYear() % 100).toString().padStart(2, "0");
        const period = d.toLocaleString("en-US", { month: "long", year: "numeric" });
        const code = `${m}${y}`;
        const ask = Math.round((base * (1 + 0.0025 * i) + 5 * i) * 100) / 100;
        out.push({ gradeId: id, gradeName: spot.gradeName, period, code, askPrice: ask });
      }
      res.json({ data: out });
    } catch {
      res.status(500).json({ message: "Failed to compute forwards" });
    }
  });

  /* --------------- Market --------------- */
  app.get("/api/market/latest", async (_req, res) => {
    const grades = await storage.getAllOilGrades();
    const all = await storage.getAllMarketData();
    const latestPerGrade = grades
      .map(g => {
        const items = all.filter(m => m.gradeId === g.id).sort((a, b) => a.date.localeCompare(b.date));
        return items[items.length - 1];
      })
      .filter(Boolean);
    res.json({ data: latestPerGrade });
  });

  app.get("/api/market/by-grade/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const items = await storage.getMarketDataByGrade(id);
    res.json({ data: items });
  });

  /* --------------- Analytics --------------- */
  app.get("/api/analytics/buying-score/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const items = (await storage.getMarketDataByGrade(id)).sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) return res.status(404).json({ message: "No data for grade" });
    const { computeIndicators, computeBuyingScore } = await import("./analytics.js");
    const ind = computeIndicators(items);
    const result = computeBuyingScore(ind);
    const gradeName = items[0].gradeName;
    res.json({ data: { gradeId: id, gradeName, ...result } });
  });

  app.get("/api/analytics/interpret/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const items = (await storage.getMarketDataByGrade(id)).sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) return res.status(404).json({ message: "No data for grade" });
    const { computeIndicators, interpretIndicators } = await import("./analytics.js");
    const ind = computeIndicators(items);
    const notes = interpretIndicators(ind);
    const gradeName = items[0].gradeName;
    res.json({ data: { gradeId: id, gradeName, indicators: ind, notes } });
  });

  app.get("/api/analytics/buying-score", async (_req, res) => {
    const grades = await storage.getAllOilGrades();
    const all = await storage.getAllMarketData();
    const { computeIndicators, computeBuyingScore } = await import("./analytics.js");
    const out: any[] = [];
    for (const g of grades) {
      const ts = all.filter(m => m.gradeId === g.id).sort((a, b) => a.date.localeCompare(b.date));
      if (ts.length) {
        const ind = computeIndicators(ts);
        const result = computeBuyingScore(ind);
        out.push({ gradeId: g.id, gradeName: g.name, ...result });
      }
    }
    res.json({ data: out });
  });

  /* --------------- Chat --------------- */
  app.get("/api/chat/channels", async (_req, res) => {
    const ch = await storage.getAllChatChannels();
    res.json({ data: ch });
  });

  app.post("/api/chat/channels", async (req, res) => {
    try {
      const { name } = insertChatChannelSchema.parse({ name: String(req.body?.name || "").trim() });
      const ch = await storage.createChatChannel({ name });
      res.json({ data: ch });
    } catch {
      res.status(400).json({ message: "Invalid channel payload" });
    }
  });

  app.get("/api/chat", async (req, res) => {
    const channelId = String(req.query.channelId || "");
    const msgs = channelId
      ? await storage.getChatMessagesByChannel(channelId)
      : await storage.getAllChatMessages();
    res.json({ data: msgs });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const msg = insertChatMessageSchema.parse(req.body);
      const saved = await storage.createChatMessage(msg);
      res.json({ data: saved });
    } catch {
      res.status(400).json({ message: "Invalid message payload" });
    }
  });

  /* --------------- Fixings --------------- */
  function makeGradeAcronym(name: string): string {
    if (!name) return "FIX";
    const tokens = String(name).split(/[\s\-_/]+/).filter(Boolean);
    const parts = tokens
      .map((t) => {
        const clean = t.replace(/[^A-Za-z0-9]/g, "");
        if (!clean) return "";
        if (/^[A-Z0-9]+$/.test(clean) && clean === clean.toUpperCase() && clean.length > 1) return clean;
        return clean[0].toUpperCase();
      })
      .filter(Boolean);
    return (parts.join("") || "FIX").toUpperCase();
  }

  async function buildSequentialFixCode(b: any): Promise<string> {
    const gradePart = makeGradeAcronym(b.grade);
    const d = b.date ? new Date(b.date) : new Date();
    const year = d.getFullYear();

    const all = await storage.getAllFixings();
    const re = new RegExp(`^[A-Z0-9]+${year}(\\d{5,})$`);
    let maxSeq = 0;
    for (const f of all as any[]) {
      const c = String((f as any).code || "");
      const m = c.match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
    }
    let next = maxSeq + 1;
    let code = `${gradePart}${year}${String(next).padStart(5, "0")}`;

    const used = new Set((all || []).map((f: any) => f.code).filter(Boolean));
    while (used.has(code)) {
      next += 1;
      code = `${gradePart}${year}${String(next).padStart(5, "0")}`;
    }
    return code;
  }

  app.get("/api/fixings", async (_req, res) => {
    const rows = await storage.getAllFixings();
    res.json({ data: rows });
  });

  app.get("/api/fixings/:id", async (req, res) => {
    const id = String(req.params.id);
    const rows = await storage.getAllFixings();
    const row = rows.find((x: any) => x.id === id);
    if (!row) return res.status(404).json({ message: "Fixing not found" });
    res.json({ data: row });
  });

  app.post("/api/fixings", async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.date || !b.grade || !b.volume || b.priceUsd === undefined || b.priceUsd === null || b.priceUsd === "" || !b.counterparty) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (!b.code) {
        try {
          b.code = await buildSequentialFixCode(b);
        } catch (e) {
          console.error("CODE GENERATION ERROR:", e);
        }
      }

      const saved = await storage.createFixing(b);
      res.json({ data: saved });
    } catch (e: any) {
      console.error("CREATE FIXING ERROR:", e);
      res.status(getErrorStatus(e, 500)).json({
        message: getErrorMessage(e, "Failed to create fixing"),
      });
    }
  });

  app.put("/api/fixings/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const updated = await storage.updateFixing(id, req.body || {});
      res.json({ data: updated });
    } catch (e: any) {
      console.error("UPDATE FIXING ERROR:", e);
      res.status(getErrorStatus(e, 500)).json({ message: getErrorMessage(e, "Failed to update fixing") });
    }
  });

  app.delete("/api/fixings/:id", async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteFixing(id);
      res.json({ data: { id } });
    } catch (e: any) {
      console.error("DELETE FIXING ERROR:", e);
      res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Fixing not found") });
    }
  });

  app.get("/api/fixings/:id/export", async (req, res) => {
    try {
      const id = req.params.id;
      const rows = await storage.getAllFixings();
      const r = rows.find((x: any) => x.id === id);
      if (!r) return res.status(404).send("Fixing not found");

      const headers = ["Date","Route","Grade","Volume","Counterparty","Vessel","FOB(USD)","Freight(USD)","Code","Notes"];
      const values = [
        r.date ?? "", r.route ?? "", r.grade ?? "", r.volume ?? "",
        r.counterparty ?? "", r.vessel ?? "", r.priceUsd ?? "", r.freightUsd ?? "", r.code ?? "", r.notes ?? ""
      ];
      const csv = headers.join(",") + "\n" +
        values.map((v: any) => `"${String(v).replaceAll('"', '""')}"`).join(",");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="fixing-${id}.csv"`);
      res.send(csv);
    } catch (e: any) {
      res.status(500).send("Export error: " + (e?.message || e));
    }
  });

  /* --------------- Vessels / Navires --------------- */
  function registerVesselRoutes(base: string) {
    app.get(base, async (_req, res) => {
      const rows = await storage.getAllVessels();
      res.json({ data: rows });
    });

    app.post(base, async (req, res) => {
      try {
        const b = req.body || {};
        const name = String(b.name ?? "").trim();
        if (!name) return res.status(400).json({ message: "name is required" });

        const totalQtyMt =
          b.quantityTotal !== undefined && b.quantityTotal !== ""
            ? Number(b.quantityTotal)
            : b.totalQtyMt !== undefined && b.totalQtyMt !== ""
              ? Number(b.totalQtyMt)
              : undefined;

        const allocations = Array.isArray(b.gradeAllocations)
          ? b.gradeAllocations
          : Array.isArray(b.allocations)
            ? b.allocations
            : [];

        if (totalQtyMt !== undefined && !(Number.isFinite(totalQtyMt) && totalQtyMt >= 0)) {
          return res.status(400).json({ message: "quantityTotal must be a non-negative number" });
        }

        if (allocations.length) {
          const validGrades = await storage.getAllOilGrades();
          const validIds = new Set(validGrades.map((g: any) => g.id));
          const validNames = new Set(validGrades.map((g: any) => String(g.name || "").trim().toLowerCase()));

          for (const a of allocations) {
            if (!a) return res.status(400).json({ message: "Invalid allocation entry" });

            const gidRaw = a.gradeId;
            const gid = gidRaw === undefined || gidRaw === null || gidRaw === ""
              ? undefined
              : typeof gidRaw === "string"
                ? parseInt(gidRaw, 10)
                : gidRaw;

            const gradeName = String(a.gradeName || a.grade || "").trim();
            const qtyRaw = a.qty ?? a.qtyMt ?? a.quantity ?? a.quantityMt;
            const qty = typeof qtyRaw === "string" ? parseFloat(qtyRaw) : qtyRaw;

            if (gid !== undefined && !Number.isInteger(gid)) {
              return res.status(400).json({ message: "allocation.gradeId must be an integer" });
            }
            if (gid !== undefined && !validIds.has(gid)) {
              return res.status(400).json({ message: `Unknown gradeId ${gid}` });
            }
            if (!gid && (!gradeName || !validNames.has(gradeName.toLowerCase()))) {
              return res.status(400).json({ message: `Unknown gradeName ${gradeName || "empty"}` });
            }
            if (!Number.isFinite(qty) || qty < 0) {
              return res.status(400).json({ message: "allocation.qty must be >= 0" });
            }
          }

          if (totalQtyMt !== undefined) {
            const sum = allocations.reduce((acc: number, a: any) => {
              const qtyRaw = a.qty ?? a.qtyMt ?? a.quantity ?? a.quantityMt;
              const qty = typeof qtyRaw === "string" ? parseFloat(qtyRaw) : qtyRaw;
              return acc + (Number.isFinite(qty) ? Number(qty) : 0);
            }, 0);
            if (sum > totalQtyMt) {
              return res.status(400).json({
                message: `Sum of allocations (${sum}) exceeds quantityTotal (${totalQtyMt})`,
              });
            }
          }
        }

        const payload = {
          name,
          type: b.type ?? "Tanker",
          dwt: b.dwt ?? 0,
          status: b.status ?? "Planned",
          eta: b.eta ?? undefined,
          origin: b.origin ?? undefined,
          destination: b.destination ?? undefined,
          tender: b.tender ?? undefined,
          supplier: b.supplier ?? undefined,
          quantityTotal: totalQtyMt,
          gradeAllocations: allocations,
        };

        const saved = await storage.createVessel(payload);
        res.json({ data: saved });
      } catch (e: any) {
        res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to create vessel") });
      }
    });

    app.put(`${base}/:id`, async (req, res) => {
      try {
        const updated = await storage.updateVessel(req.params.id, req.body || {});
        res.json({ data: updated });
      } catch (e: any) {
        res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Vessel not found") });
      }
    });

    app.delete(`${base}/:id`, async (req, res) => {
      try {
        await storage.deleteVessel(req.params.id);
        res.json({ data: { id: req.params.id } });
      } catch (e: any) {
        res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Vessel not found") });
      }
    });
  }

  registerVesselRoutes("/api/vessels");
  registerVesselRoutes("/api/vessel");
  registerVesselRoutes("/api/navires");
  registerVesselRoutes("/api/navire");

  /* ----------------- Contrats API ----------------- */
  const toStorageContractPayload = (b: any) => {
    const market: "LOCAL" | "EXPORT" =
      b.market === "EXPORT" ? "EXPORT" : "LOCAL";

    const contractDate: string =
      (typeof b.contractDate === "string" && b.contractDate) ||
      (typeof b.date === "string" && b.date) ||
      new Date().toISOString().slice(0, 10);

    const startDate: string =
      (typeof b.startDate === "string" && b.startDate) ||
      (typeof b.dateStart === "string" && b.dateStart) ||
      contractDate;

    const endDate: string =
      (typeof b.endDate === "string" && b.endDate) ||
      (typeof b.dateEnd === "string" && b.dateEnd) ||
      contractDate;

    const quantityTons: number =
      (b.quantityT != null ? Number(b.quantityT) : undefined) ??
      (b.quantityTons != null ? Number(b.quantityTons) : undefined) ??
      0;

    const inferredCurrency: "USD" | "TND" =
      market === "LOCAL" ? "TND" : (b.priceCurrency === "TND" ? "TND" : "USD");
    const priceCurrency: "USD" | "TND" =
      market === "LOCAL"
        ? "TND"
        : (b.priceCurrency ?? (b.priceUsd != null ? "USD" : (b.priceTnd != null ? "TND" : inferredCurrency)));

    const pricePerT = b.pricePerT != null ? Number(b.pricePerT) : undefined;

    const priceUsd =
      priceCurrency === "USD"
        ? (b.priceUsd != null ? Number(b.priceUsd) : pricePerT)
        : undefined;

    const priceTnd =
      priceCurrency === "TND"
        ? (b.priceTnd != null ? Number(b.priceTnd) : pricePerT)
        : undefined;

    const fxRate = b.fxRate != null ? Number(b.fxRate) : undefined;

    return {
      contractDate,
      market,
      clientId: String(b.clientId || ""),
      clientName: b.clientName ? String(b.clientName) : undefined,
      productId: String(b.productId || ""),
      productName: b.productName ? String(b.productName) : undefined,
      quantityTons,
      priceCurrency,
      priceUsd,
      priceTnd,
      fxRate,
      startDate,
      endDate,
      code: typeof b.code === "string" ? b.code : undefined,
    };
  };

  const registerContractRoutes = (base: string) => {
    app.get(`${base}`, async (_req, res) => {
      const rows = await storage.getAllContracts();
      res.json({ data: rows });
    });

    app.post(`${base}`, async (req, res) => {
      try {
        const b = req.body || {};
        if (!b.clientId) return res.status(400).json({ message: "clientId is required" });
        if (!b.productId) return res.status(400).json({ message: "productId is required" });

        const payload = toStorageContractPayload(b);

        if (!payload.quantityTons || payload.quantityTons <= 0) {
          return res.status(400).json({ message: "quantityTons must be > 0" });
        }
        if (payload.priceCurrency === "USD" && (payload.priceUsd == null)) {
          return res.status(400).json({ message: "priceUsd is required when priceCurrency=USD" });
        }
        if (payload.priceCurrency === "TND" && (payload.priceTnd == null)) {
          return res.status(400).json({ message: "priceTnd is required when priceCurrency=TND" });
        }

        const saved = await storage.createContract(payload as any);
        res.json({ data: saved });
      } catch (e: any) {
        res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Invalid contract payload") });
      }
    });

    app.put(`${base}/:id`, async (req, res) => {
      try {
        const id = String(req.params.id);
        const b = req.body || {};
        const patch = toStorageContractPayload(b);

        Object.keys(patch).forEach(k => {
          if ((patch as any)[k] === undefined) delete (patch as any)[k];
        });

        const saved = await storage.updateContract(id, patch as any);
        res.json({ data: saved });
      } catch (e: any) {
        res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to update contract") });
      }
    });

    app.delete(`${base}/:id`, async (req, res) => {
      try {
        const id = String(req.params.id);
        await storage.deleteContract(id);
        res.json({ data: { id } });
      } catch (e: any) {
        res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Contract not found") });
      }
    });
  };

  registerContractRoutes("/api/contracts");
  registerContractRoutes("/api/contrats");
  registerContractRoutes("/api/contract");

  /* -------- Affectations contrats / fixings -------- */
  app.get("/api/contracts/:id/requirements", async (req, res) => {
    try {
      const rows = await storage.getContractRequirements(String(req.params.id));
      res.json({ data: rows });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to fetch contract requirements") });
    }
  });

  app.get("/api/contracts/:id/allocations", async (req, res) => {
    try {
      const rows = await storage.getContractAllocations(String(req.params.id));
      res.json({ data: rows });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to fetch contract allocations") });
    }
  });

  app.get("/api/contracts/:id/coverage", async (req, res) => {
    try {
      const coverage = await storage.getContractCoverage(String(req.params.id));
      res.json({ data: coverage });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to compute contract coverage") });
    }
  });

  app.post("/api/contracts/:id/allocate", async (req, res) => {
    try {
      const b = req.body || {};
      const fixingId = String(b.fixingId || "").trim();
      const gradeName = String(b.gradeName || "").trim();
      const qty = Number(b.qty);

      if (!fixingId) return res.status(400).json({ message: "fixingId is required" });
      if (!gradeName) return res.status(400).json({ message: "gradeName is required" });
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: "qty must be > 0" });
      }

      const saved = await storage.allocateFixing({
        contractId: String(req.params.id),
        fixingId,
        gradeName,
        qty,
      });

      res.json({ data: saved });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to allocate fixing") });
    }
  });

  app.delete("/api/allocations/:id", async (req, res) => {
    try {
      const id = String(req.params.id);
      await storage.deleteAllocation(id);
      res.json({ data: { id } });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to delete allocation") });
    }
  });

  app.get("/api/allocation-summary/grades", async (_req, res) => {
    try {
      const rows = await storage.getGradeAllocationSummary();
      res.json({ data: rows });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to fetch allocation summary") });
    }
  });

  app.get("/api/fixings/:id/available", async (req, res) => {
    try {
      const availableQty = await storage.getFixingAvailableQty(String(req.params.id));
      res.json({ data: { fixingId: String(req.params.id), availableQty } });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to fetch fixing availability") });
    }
  });

  /* ===== PRODUCTS ===== */
  app.get("/api/products", async (_req, res) => {
    try {
      const rows = await storage.getAllProducts();
      res.json({ data: rows });
    } catch (e: any) {
      res.status(getErrorStatus(e, 500)).json({ message: getErrorMessage(e, "Failed to fetch products") });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const b = req.body || {};
      const created = await storage.createProduct({
        name: String(b.name || "").trim(),
        reference: b.reference ?? null,
        composition: Array.isArray(b.composition) ? b.composition : [],
      });
      res.json({ data: created });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to create product") });
    }
  });

  app.put("/api/products/:id", async (req, res) => {
    try {
      const updated = await storage.updateProduct(
        String(req.params.id),
        req.body || {}
      );
      res.json({ data: updated });
    } catch (e: any) {
      res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Product not found") });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const id = String(req.params.id);
      await storage.deleteProduct(id);
      res.json({ data: { id } });
    } catch (e: any) {
      res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Product not found") });
    }
  });



  /* ===== TARGET MARGINS / MARGES CIBLES ===== */
  app.get("/api/target-margins", async (_req, res) => {
    try { const rows = await (storage as any).getAllTargetMargins(); res.json({ data: rows }); }
    catch (e: any) { res.status(getErrorStatus(e, 500)).json({ message: getErrorMessage(e, "Failed to fetch target margins") }); }
  });
  app.post("/api/target-margins", async (req, res) => {
    try { const b = req.body || {}; const saved = await (storage as any).createTargetMargin({ market: b.market === "EXPORT" ? "EXPORT" : "LOCAL", clientId: b.clientId || undefined, clientName: String(b.clientName || "").trim(), productId: b.productId || undefined, productName: String(b.productName || "").trim(), marginTnd: b.marginTnd === "" || b.marginTnd == null ? undefined : Number(b.marginTnd), marginUsd: b.marginUsd === "" || b.marginUsd == null ? undefined : Number(b.marginUsd) }); res.json({ data: saved }); }
    catch (e: any) { res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to create target margin") }); }
  });
  app.put("/api/target-margins/:id", async (req, res) => {
    try { const b = req.body || {}; const saved = await (storage as any).updateTargetMargin(String(req.params.id), { market: b.market === "EXPORT" ? "EXPORT" : "LOCAL", clientId: b.clientId || undefined, clientName: String(b.clientName || "").trim(), productId: b.productId || undefined, productName: String(b.productName || "").trim(), marginTnd: b.marginTnd === "" || b.marginTnd == null ? undefined : Number(b.marginTnd), marginUsd: b.marginUsd === "" || b.marginUsd == null ? undefined : Number(b.marginUsd) }); res.json({ data: saved }); }
    catch (e: any) { res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to update target margin") }); }
  });
  app.delete("/api/target-margins/:id", async (req, res) => {
    try { const id = String(req.params.id); await (storage as any).deleteTargetMargin(id); res.json({ data: { id } }); }
    catch (e: any) { res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Target margin not found") }); }
  });
  app.post("/api/target-margins/import", async (req, res) => {
    try { const rows = Array.isArray(req.body?.rows) ? req.body.rows : []; if (!rows.length) return res.status(400).json({ message: "Aucune ligne à importer." }); const saved = await (storage as any).replaceTargetMargins(rows.map((r: any) => ({ market: r.market === "EXPORT" ? "EXPORT" : "LOCAL", clientId: r.clientId || undefined, clientName: String(r.clientName || r.client || "").trim(), productId: r.productId || undefined, productName: String(r.productName || r.product || "").trim(), marginTnd: r.marginTnd === "" || r.marginTnd == null ? undefined : Number(r.marginTnd), marginUsd: r.marginUsd === "" || r.marginUsd == null ? undefined : Number(r.marginUsd) }))); res.json({ data: saved }); }
    catch (e: any) { res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to import target margins") }); }
  });


  /* ===== CLIENTS ===== */
  app.get("/api/clients", async (_req, res) => {
    try {
      const rows = await storage.getAllClients();
      res.json({ data: rows });
    } catch (e: any) {
      res.status(getErrorStatus(e, 500)).json({ message: getErrorMessage(e, "Failed to fetch clients") });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const b = req.body || {};
      const created = await storage.createClient({
        name: String(b.name || "").trim(),
        market: b.market === "EXPORT" ? "EXPORT" : "LOCAL",
        terms: String(b.terms || ""),
      } as any);
      res.json({ data: created });
    } catch (e: any) {
      res.status(getErrorStatus(e, 400)).json({ message: getErrorMessage(e, "Failed to create client") });
    }
  });

  app.put("/api/clients/:id", async (req, res) => {
    try {
      const updated = await storage.updateClient(
        String(req.params.id),
        req.body || {}
      );
      res.json({ data: updated });
    } catch (e: any) {
      res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Client not found") });
    }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    try {
      const id = String(req.params.id);
      await storage.deleteClient(id);
      res.json({ data: { id } });
    } catch (e: any) {
      res.status(getErrorStatus(e, 404)).json({ message: getErrorMessage(e, "Client not found") });
    }
  });

  /* --------------- 404 API --------------- */
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ message: "API route not found" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
