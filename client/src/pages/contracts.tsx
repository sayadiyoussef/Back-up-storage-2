// client/src/pages/contracts.tsx
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, PlusCircle, RefreshCw, Search, Link2, X } from "lucide-react";

/** ---------- Types basiques (côté UI) ---------- */
type Market = "LOCAL" | "EXPORT";
type Client = { id: string; name: string; market: Market; terms?: string; paymentTerms?: string };
type Product = { id: string; name: string; reference?: string | null };
type TargetMargin = { id: string; market: Market; clientId?: string; clientName: string; productId?: string; productName: string; marginTnd?: number | null; marginUsd?: number | null };
type Fixing = {
  id: string;
  code?: string;
  date?: string;
  grade: string;
  volume: string;
  priceUsd?: number;
  freightUsd?: number;
  counterparty?: string;
  vessel?: string;
};

type ContractRequirement = {
  id: string;
  contractId: string;
  gradeName: string;
  requiredQty: number;
};

type ContractAllocation = {
  id: string;
  contractId: string;
  fixingId: string;
  gradeName: string;
  allocatedQty: number;
};

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
  pricePerT: number;
  fxRate: number;
  dateStart: string;
  dateEnd: string;
  contractDate: string;
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

const toNum = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Number(n) : 0;
};

const parseVolumeTons = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : 0;
};


const MONTH_LABELS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const getYearMonthKey = (dateStr?: string) => {
  if (!dateStr) return "";
  const m = String(dateStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}`;
};

const getYearMonthLabel = (key: string) => {
  const [year, month] = key.split("-");
  const idx = Number(month) - 1;
  const label = MONTH_LABELS_FR[idx] ?? month;
  return `${label} ${year}`;
};

const getMonthLabelFromKey = (key: string) => {
  const month = Number(key.split("-")[1]) - 1;
  return MONTH_LABELS_FR[month] ?? key;
};

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

function uiToApiPayload(f: ContractUI) {
  const forcedCurrency: "USD" | "TND" =
    f.market === "LOCAL" ? "TND" : f.priceCurrency;

  const base: any = {
    clientId: f.clientId,
    productId: f.productId,
    quantityTons: Number(f.quantityT) || 0,
    priceCurrency: forcedCurrency,
    fxRate: f.fxRate ? Number(f.fxRate) : undefined,
    contractDate: f.contractDate,
    startDate: f.dateStart,
    endDate: f.dateEnd,
    market: f.market,
  };

  if (forcedCurrency === "USD") {
    base.priceUsd = Number(f.pricePerT) || 0;
    base.priceTnd = undefined;
  } else {
    base.priceTnd = Number(f.pricePerT) || 0;
    base.priceUsd = undefined;
  }

  return base;
}

export default function ContractsPage() {
  const qc = useQueryClient();

  /** --------- Data sources --------- */
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

  const { data: targetMarginsRes, refetch: refetchTargetMargins } = useQuery({
    queryKey: ["/api/target-margins"],
    queryFn: () => fetchJSON("/api/target-margins"),
  });
  const targetMargins: TargetMargin[] = useMemo(() => (targetMarginsRes as any)?.data ?? [], [targetMarginsRes]);
  const getTargetMargin = (contract: ContractUI) => targetMargins.find((m) =>
    m.market === contract.market &&
    ((m.clientId && m.clientId === contract.clientId) || String(m.clientName || "").trim().toLowerCase() === String(contract.clientName || "").trim().toLowerCase()) &&
    ((m.productId && m.productId === contract.productId) || String(m.productName || "").trim().toLowerCase() === String(contract.productName || "").trim().toLowerCase())
  );

  const {
    data: fixingsRes,
    isFetching: fetchingFixings,
    refetch: refetchFixings,
  } = useQuery({
    queryKey: ["/api/fixings"],
    queryFn: () => fetchJSON("/api/fixings"),
  });
  const fixings: Fixing[] = useMemo(() => (fixingsRes as any)?.data ?? [], [fixingsRes]);

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
  const [clientFilter, setClientFilter] = useState<string>("ALL");
  const [productFilter, setProductFilter] = useState<string>("ALL");
  const [dateStartFilter, setDateStartFilter] = useState("");
  const [dateEndFilter, setDateEndFilter] = useState("");
  const [contractDateMonthsFilter, setContractDateMonthsFilter] = useState<string[]>([]);

  const contractDateTree = useMemo(() => {
    const tree = new Map<string, string[]>();

    for (const r of rows) {
      const key = getYearMonthKey(r.contractDate);
      if (!key) continue;
      const year = key.slice(0, 4);
      const existing = tree.get(year) ?? [];
      if (!existing.includes(key)) existing.push(key);
      tree.set(year, existing);
    }

    return Array.from(tree.entries())
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, months]) => ({
        year,
        months: months.sort((a, b) => a.localeCompare(b)),
      }));
  }, [rows]);

  const selectedContractMonthSet = useMemo(
    () => new Set(contractDateMonthsFilter),
    [contractDateMonthsFilter]
  );

  const toggleContractMonth = (key: string, checked: boolean) => {
    setContractDateMonthsFilter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return Array.from(next).sort();
    });
  };

  const toggleContractYear = (year: string, checked: boolean) => {
    const yearMonths = contractDateTree.find((item) => item.year === year)?.months ?? [];
    setContractDateMonthsFilter((prev) => {
      const next = new Set(prev);
      for (const key of yearMonths) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return Array.from(next).sort();
    });
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (marketFilter !== "ALL" && r.market !== marketFilter) return false;
      if (clientFilter !== "ALL" && r.clientId !== clientFilter) return false;
      if (productFilter !== "ALL" && r.productId !== productFilter) return false;
      if (dateStartFilter && r.dateStart !== dateStartFilter) return false;
      if (dateEndFilter && r.dateEnd !== dateEndFilter) return false;
      if (selectedContractMonthSet.size > 0) {
        const key = getYearMonthKey(r.contractDate);
        if (!key || !selectedContractMonthSet.has(key)) return false;
      }
      if (!needle) return true;
      return (
        (r.code || "").toLowerCase().includes(needle) ||
        (r.clientName || "").toLowerCase().includes(needle) ||
        (r.productName || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, marketFilter, clientFilter, productFilter, dateStartFilter, dateEndFilter, selectedContractMonthSet]);

  const totalQuantity = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (Number(r.quantityT) || 0), 0);
  }, [filtered]);

  /** --------- UI state --------- */
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm: ContractUI = {
    clientId: "",
    productId: "",
    market: "LOCAL",
    quantityT: 0,
    priceCurrency: "TND",
    pricePerT: 0,
    fxRate: 3.2,
    dateStart: todayStr(),
    dateEnd: todayStr(),
    contractDate: todayStr(),
  };

  const [form, setForm] = useState<ContractUI>(emptyForm);
  const resetForm = () => setForm(emptyForm);

  /** --------- Allocation UI --------- */
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocationContract, setAllocationContract] = useState<ContractUI | null>(null);
  const [draftFixingByGrade, setDraftFixingByGrade] = useState<Record<string, string>>({});
  const [draftQtyByGrade, setDraftQtyByGrade] = useState<Record<string, string>>({});

  const allocationContractId = allocationContract?.id || "";

  const {
    data: requirementsRes,
    refetch: refetchRequirements,
    isFetching: fetchingRequirements,
  } = useQuery({
    queryKey: ["/api/contracts", allocationContractId, "requirements"],
    queryFn: () => fetchJSON(`/api/contracts/${allocationContractId}/requirements`),
    enabled: allocationOpen && !!allocationContractId,
  });
  const requirements: ContractRequirement[] = useMemo(
    () => (requirementsRes as any)?.data ?? [],
    [requirementsRes]
  );

  const {
    data: allocationsRes,
    refetch: refetchAllocations,
    isFetching: fetchingAllocations,
  } = useQuery({
    queryKey: ["/api/contracts", allocationContractId, "allocations"],
    queryFn: () => fetchJSON(`/api/contracts/${allocationContractId}/allocations`),
    enabled: allocationOpen && !!allocationContractId,
  });
  const allocations: ContractAllocation[] = useMemo(
    () => (allocationsRes as any)?.data ?? [],
    [allocationsRes]
  );

  const {
    data: coverageRes,
    refetch: refetchCoverage,
  } = useQuery({
    queryKey: ["/api/contracts", allocationContractId, "coverage"],
    queryFn: () => fetchJSON(`/api/contracts/${allocationContractId}/coverage`),
    enabled: allocationOpen && !!allocationContractId,
  });
  const coverage = Number((coverageRes as any)?.data ?? 0);

  const coverageMapQuery = useQuery({
    queryKey: ["/api/contracts-coverage-map", rows.map((r) => r.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        rows
          .filter((r) => r.id)
          .map(async (r) => {
            try {
              const res = await fetchJSON(`/api/contracts/${r.id}/coverage`);
              return [r.id!, Number(res?.data ?? 0)] as const;
            } catch {
              return [r.id!, 0] as const;
            }
          })
      );
      return Object.fromEntries(entries);
    },
    enabled: rows.length > 0,
  });
  const coverageMap = (coverageMapQuery.data ?? {}) as Record<string, number>;

  const materialMarginQuery = useQuery({
    queryKey: [
      "/api/contracts-material-margin-map",
      rows
        .map((r) =>
          [
            r.id,
            r.market,
            r.quantityT,
            r.pricePerT,
            r.priceCurrency,
            r.fxRate,
            r.updatedAt,
          ].join(":")
        )
        .join("|"),
      fixings
        .map((f) =>
          [
            f.id,
            f.priceUsd ?? 0,
            f.freightUsd ?? 0,
            f.volume,
          ].join(":")
        )
        .join("|"),
    ],
    queryFn: async () => {
      const fixingById = new Map(fixings.map((f) => [f.id, f]));

      const entries = await Promise.all(
        rows
          .filter((r) => r.id)
          .map(async (r) => {
            try {
              const [requirementsRes, allocationsRes] = await Promise.all([
                fetchJSON(`/api/contracts/${r.id}/requirements`),
                fetchJSON(`/api/contracts/${r.id}/allocations`),
              ]);

              const reqs: ContractRequirement[] = requirementsRes?.data ?? [];
              const allocs: ContractAllocation[] = allocationsRes?.data ?? [];
              const contractQty = Number(r.quantityT) || 0;

              if (!contractQty || reqs.length === 0 || allocs.length === 0) {
                return [r.id!, { margin: null, materialCostUsd: null, allocated: false }] as const;
              }

              let materialCostUsd = 30;
              let hasAllocatedMaterial = false;

              for (const req of reqs) {
                const gradeKey = String(req.gradeName || "").trim().toLowerCase();
                const gradePercent = (Number(req.requiredQty) || 0) / contractQty;
                const gradeAllocs = allocs.filter(
                  (a) => String(a.gradeName || "").trim().toLowerCase() === gradeKey
                );

                const allocatedQty = gradeAllocs.reduce((sum, a) => sum + (Number(a.allocatedQty) || 0), 0);
                if (!allocatedQty || gradePercent <= 0) continue;

                const weightedMaterialUsd =
                  gradeAllocs.reduce((sum, a) => {
                    const fixing = fixingById.get(a.fixingId);
                    const priceUsd = Number(fixing?.priceUsd) || 0;
                    const freightUsd = Number(fixing?.freightUsd) || 0;
                    return sum + (priceUsd + freightUsd) * (Number(a.allocatedQty) || 0);
                  }, 0) / allocatedQty;

                if (Number.isFinite(weightedMaterialUsd) && weightedMaterialUsd > 0) {
                  materialCostUsd += weightedMaterialUsd * gradePercent;
                  hasAllocatedMaterial = true;
                }
              }

              if (!hasAllocatedMaterial) {
                return [r.id!, { margin: null, materialCostUsd: null, allocated: false }] as const;
              }

              const salePrice = Number(r.pricePerT) || 0;
              const fxRate = Number(r.fxRate) || 0;
              const margin =
                r.market === "LOCAL"
                  ? salePrice - materialCostUsd * fxRate
                  : salePrice - materialCostUsd;

              return [
                r.id!,
                {
                  margin,
                  materialCostUsd,
                  allocated: true,
                },
              ] as const;
            } catch {
              return [r.id!, { margin: null, materialCostUsd: null, allocated: false }] as const;
            }
          })
      );

      return Object.fromEntries(entries);
    },
    enabled: rows.length > 0,
  });

  const materialMarginMap = (materialMarginQuery.data ?? {}) as Record<
    string,
    { margin: number | null; materialCostUsd: number | null; allocated: boolean }
  >;

  const allocationsByGrade = useMemo(() => {
    const m = new Map<string, ContractAllocation[]>();
    allocations.forEach((a) => {
      const key = a.gradeName.toLowerCase();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    });
    return m;
  }, [allocations]);

  const openAllocation = (contract: ContractUI) => {
    setAllocationContract(contract);
    setAllocationOpen(true);
    setDraftFixingByGrade({});
    setDraftQtyByGrade({});
  };

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
    onSuccess: async (res: any) => {
      const saved = apiToUI(res?.data);
      qc.setQueryData(["/api/contracts"], (prev: any) => {
        const prevArr: ContractUI[] = (prev?.data ?? []).map(apiToUI);
        if (!saved) return prev;
        if (editingId) {
          const next = prevArr.map((c) => (c.id === saved.id ? saved : c));
          return { data: next };
        }
        return { data: [saved, ...prevArr] };
      });

      await qc.invalidateQueries({ queryKey: ["/api/contracts"] });
      await qc.invalidateQueries({ queryKey: ["/api/target-margins"] });
      await qc.invalidateQueries({ queryKey: ["/api/contracts-material-margin-map"] });
      await qc.invalidateQueries({ queryKey: ["/api/contracts-coverage-map"] });

      await refetchContracts();
      await refetchTargetMargins();
      await materialMarginQuery.refetch();
      await coverageMapQuery.refetch();

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
    },
    onError: (e: any) => {
      alert(`Erreur suppression contrat:\n${e?.message || e}`);
    },
  });

  const allocateMutation = useMutation({
    mutationFn: async ({
      contractId,
      fixingId,
      gradeName,
      qty,
    }: {
      contractId: string;
      fixingId: string;
      gradeName: string;
      qty: number;
    }) =>
      fetchJSON(`/api/contracts/${contractId}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixingId, gradeName, qty }),
      }),
    onSuccess: async (_res, vars) => {
      await Promise.all([
        refetchAllocations(),
        refetchRequirements(),
        refetchCoverage(),
        refetchFixings(),
      ]);
      await coverageMapQuery.refetch();
      await materialMarginQuery.refetch();
      setDraftQtyByGrade((prev) => ({ ...prev, [vars.gradeName]: "" }));
    },
    onError: (e: any) => {
      alert(`Erreur affectation:\n${e?.message || e}`);
    },
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJSON(`/api/allocations/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([
        refetchAllocations(),
        refetchRequirements(),
        refetchCoverage(),
        refetchFixings(),
      ]);
      await coverageMapQuery.refetch();
      await materialMarginQuery.refetch();
    },
    onError: (e: any) => {
      alert(`Erreur suppression affectation:\n${e?.message || e}`);
    },
  });

  /** --------- Helpers UI --------- */
  const selectedClient = clients.find((c) => c.id === form.clientId) || null;

  const handleClientChange = (id: string) => {
    const c = clients.find((x) => x.id === id);
    const market = (c?.market as Market) ?? "LOCAL";

    setForm((f) => ({
      ...f,
      clientId: id,
      market,
      priceCurrency: market === "LOCAL" ? "TND" : "USD",
    }));
  };

  const effectiveCurrency = form.market === "LOCAL" ? "TND" : form.priceCurrency;
  const currencySuffix = effectiveCurrency === "USD" ? "USD/T" : "TND/T";

  const fixingAvailableMap = useMemo(() => {
    const usedByFixing = new Map<string, number>();
    allocations.forEach((a) => {
      usedByFixing.set(a.fixingId, (usedByFixing.get(a.fixingId) || 0) + Number(a.allocatedQty || 0));
    });

    const m = new Map<string, number>();
    fixings.forEach((f) => {
      const total = parseVolumeTons(f.volume);
      const usedGlobal = 0;
      const usedOnThisContract = usedByFixing.get(f.id) || 0;
      m.set(f.id, Math.max(0, total - usedGlobal));
      m.set(`${f.id}__plusCurrent`, Math.max(0, total - usedGlobal + usedOnThisContract));
    });
    return m;
  }, [fixings, allocations]);

  const availableFixingsForGrade = (gradeName: string) => {
    return fixings
      .filter((f) => String(f.grade || "").trim().toLowerCase() === gradeName.trim().toLowerCase())
      .map((f) => ({
        ...f,
        available: fixingAvailableMap.get(f.id) ?? parseVolumeTons(f.volume),
      }))
      .sort((a, b) => (b.available || 0) - (a.available || 0));
  };

  const clearFilters = () => {
    setQ("");
    setMarketFilter("ALL");
    setClientFilter("ALL");
    setProductFilter("ALL");
    setDateStartFilter("");
    setDateEndFilter("");
    setContractDateMonthsFilter([]);
  };

  const doRefresh = () => {
    refetchClients();
    refetchProducts();
    refetchContracts();
    refetchFixings();
    refetchTargetMargins();
    coverageMapQuery.refetch();
    materialMarginQuery.refetch();
  };

  const coverageBadge = (v: number) => {
    if (v >= 0.999) return "bg-emerald-500/15 text-emerald-300 border-emerald-600/40";
    if (v > 0) return "bg-amber-500/15 text-amber-300 border-amber-600/40";
    return "bg-red-500/15 text-red-300 border-red-600/40";
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
              {(isFetching || fetchingClients || fetchingProducts || fetchingFixings) && (
                <span className="text-xs text-gray-400">MAJ…</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(q || marketFilter !== "ALL" || clientFilter !== "ALL" || productFilter !== "ALL" || dateStartFilter || dateEndFilter || contractDateMonthsFilter.length > 0) && (
                <Button variant="outline" className="border-gray-600 text-white" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Effacer filtres
                </Button>
              )}
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
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-gray-300 bg-black/20">
                      <tr className="text-left align-top">
                        <th className="py-2 px-3 min-w-[160px]">
                          <div className="space-y-1">
                            <div>Code</div>
                            <div className="flex items-center bg-gray-900 border border-gray-700 rounded-md px-2">
                              <Search className="h-3 w-3 text-gray-400" />
                              <input
                                className="w-full bg-transparent outline-none px-2 py-1 text-xs placeholder:text-gray-500"
                                placeholder="Filtrer…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                              />
                            </div>
                          </div>
                        </th>
                        <th className="py-2 px-3 min-w-[120px]">
                          <div className="space-y-1">
                            <div>Marché</div>
                            <select
                              className="w-full h-8 rounded-md bg-gray-900 border border-gray-700 text-white px-2 text-xs"
                              value={marketFilter}
                              onChange={(e) => setMarketFilter(e.target.value as any)}
                            >
                              <option value="ALL">Tous</option>
                              <option value="LOCAL">LOCAL</option>
                              <option value="EXPORT">EXPORT</option>
                            </select>
                          </div>
                        </th>
                        <th className="py-2 px-3 min-w-[170px]">
                          <div className="space-y-1">
                            <div>Client</div>
                            <select
                              className="w-full h-8 rounded-md bg-gray-900 border border-gray-700 text-white px-2 text-xs"
                              value={clientFilter}
                              onChange={(e) => setClientFilter(e.target.value)}
                            >
                              <option value="ALL">Tous</option>
                              {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                        <th className="py-2 px-3 min-w-[190px]">
                          <div className="space-y-1">
                            <div>Produit</div>
                            <select
                              className="w-full h-8 rounded-md bg-gray-900 border border-gray-700 text-white px-2 text-xs"
                              value={productFilter}
                              onChange={(e) => setProductFilter(e.target.value)}
                            >
                              <option value="ALL">Tous</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                        <th className="py-2 px-3">Qté (T)</th>
                        <th className="py-2 px-3">Prix/T</th>
                        <th className="py-2 px-3">FX</th>
                        <th className="py-2 px-3">Couverture</th>
                        <th className="py-2 px-3 min-w-[150px]">Marge matière</th>
                        <th className="py-2 px-3 min-w-[140px]">Marge cible</th>
                        <th className="py-2 px-3 min-w-[120px]">Écart</th>
                        <th className="py-2 px-3 min-w-[150px]">
                          <div className="space-y-1">
                            <div>Début</div>
                            <input
                              type="date"
                              className="w-full h-8 rounded-md bg-gray-900 border border-gray-700 text-white px-2 text-xs"
                              value={dateStartFilter}
                              onChange={(e) => setDateStartFilter(e.target.value)}
                            />
                          </div>
                        </th>
                        <th className="py-2 px-3 min-w-[150px]">
                          <div className="space-y-1">
                            <div>Fin</div>
                            <input
                              type="date"
                              className="w-full h-8 rounded-md bg-gray-900 border border-gray-700 text-white px-2 text-xs"
                              value={dateEndFilter}
                              onChange={(e) => setDateEndFilter(e.target.value)}
                            />
                          </div>
                        </th>
                        <th className="py-2 px-3 min-w-[220px]">
                          <div className="space-y-1">
                            <div>Date contrat</div>
                            <details className="relative group">
                              <summary className="list-none cursor-pointer h-8 rounded-md bg-gray-900 border border-gray-700 text-white px-2 text-xs flex items-center justify-between">
                                <span className="truncate">
                                  {contractDateMonthsFilter.length === 0
                                    ? "Tous"
                                    : contractDateMonthsFilter.length === 1
                                      ? getYearMonthLabel(contractDateMonthsFilter[0])
                                      : `${contractDateMonthsFilter.length} mois sélectionnés`}
                                </span>
                                <span className="text-gray-400">▾</span>
                              </summary>
                              <div className="absolute z-30 mt-1 w-64 max-h-80 overflow-y-auto rounded-md border border-gray-700 bg-gray-950 p-2 shadow-xl">
                                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                  <button
                                    type="button"
                                    className="text-xs text-trading-blue hover:underline"
                                    onClick={() => {
                                      const allMonths = contractDateTree.flatMap((item) => item.months);
                                      setContractDateMonthsFilter(allMonths);
                                    }}
                                  >
                                    Tout sélectionner
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-gray-300 hover:underline"
                                    onClick={() => setContractDateMonthsFilter([])}
                                  >
                                    Effacer
                                  </button>
                                </div>

                                {contractDateTree.length === 0 ? (
                                  <div className="px-1 py-2 text-xs text-gray-400">Aucune date</div>
                                ) : (
                                  contractDateTree.map(({ year, months }) => {
                                    const selectedCount = months.filter((key) => selectedContractMonthSet.has(key)).length;
                                    const yearChecked = selectedCount === months.length && months.length > 0;
                                    const yearIndeterminate = selectedCount > 0 && selectedCount < months.length;

                                    return (
                                      <div key={year} className="mb-2">
                                        <label className="flex items-center gap-2 text-xs font-semibold text-white">
                                          <input
                                            type="checkbox"
                                            checked={yearChecked}
                                            ref={(el) => {
                                              if (el) el.indeterminate = yearIndeterminate;
                                            }}
                                            onChange={(e) => toggleContractYear(year, e.target.checked)}
                                          />
                                          {year}
                                        </label>
                                        <div className="ml-5 mt-1 space-y-1">
                                          {months.map((key) => (
                                            <label key={key} className="flex items-center gap-2 text-xs text-gray-200">
                                              <input
                                                type="checkbox"
                                                checked={selectedContractMonthSet.has(key)}
                                                onChange={(e) => toggleContractMonth(key, e.target.checked)}
                                              />
                                              {getMonthLabelFromKey(key)}
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </details>
                          </div>
                        </th>
                        <th className="py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-200">
                      {filtered.length === 0 && (
                        <tr>
                          <td className="py-4 px-3 text-gray-300" colSpan={15}>
                            Aucun contrat ne correspond aux filtres.
                          </td>
                        </tr>
                      )}
                      {filtered.map((r) => {
                        const cov = r.id ? Number(coverageMap[r.id] ?? 0) : 0;
                        const marginInfo = r.id ? materialMarginMap[r.id] : undefined;
                        const marginCurrency = r.market === "LOCAL" ? "TND/T" : "USD/T";
                        const targetMargin = getTargetMargin(r);
                        const targetValue = r.market === "LOCAL" ? targetMargin?.marginTnd : targetMargin?.marginUsd;
                        const delta = marginInfo?.margin != null && targetValue != null ? marginInfo.margin - Number(targetValue) : null;
                        return (
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
                            <td className="py-2 px-3">
                              <span className={`text-xs px-2 py-1 rounded-full border ${coverageBadge(cov)}`}>
                                {(cov * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td
                              className="py-2 px-3"
                              title={
                                marginInfo?.materialCostUsd != null
                                  ? `Coût matière: ${marginInfo.materialCostUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD/T`
                                  : "Aucune matière affectée"
                              }
                            >
                              {marginInfo?.margin == null ? (
                                <span className="text-gray-500">—</span>
                              ) : (
                                <span className={marginInfo.margin >= 0 ? "text-emerald-300" : "text-red-300"}>
                                  {marginInfo.margin.toLocaleString(undefined, { maximumFractionDigits: 2 })} {marginCurrency}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {targetValue == null ? (
                                <span className="text-gray-500">—</span>
                              ) : (
                                <span>{Number(targetValue).toLocaleString(undefined, { maximumFractionDigits: 2 })} {marginCurrency}</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              {delta == null ? (
                                <span className="text-gray-500">—</span>
                              ) : (
                                <span className={delta >= 0 ? "text-emerald-300" : "text-red-300"}>
                                  {delta.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">{r.dateStart}</td>
                            <td className="py-2 px-3">{r.dateEnd}</td>
                            <td className="py-2 px-3">{r.contractDate}</td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Affectations"
                                  onClick={() => r.id && openAllocation(r)}
                                >
                                  <Link2 className="h-4 w-4" />
                                </Button>
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
                        );
                      })}
                      <tr className="border-t border-gray-600 bg-black/20 font-semibold text-white">
                        <td className="py-2 px-3" colSpan={4}>Total</td>
                        <td className="py-2 px-3">{totalQuantity.toLocaleString()} T</td>
                        <td className="py-2 px-3" colSpan={10}></td>
                      </tr>
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

              <div>
                <Label className="text-sm">Date contrat</Label>
                <Input
                  type="date"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.contractDate}
                  onChange={(e) => setForm({ ...form, contractDate: e.target.value })}
                />
              </div>

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

              <div>
                <Label className="text-sm">Quantité (T)</Label>
                <Input
                  inputMode="decimal"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.quantityT}
                  onChange={(e) => setForm({ ...form, quantityT: Number(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label className="text-sm">Devise</Label>
                <select
                  className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3"
                  value={effectiveCurrency}
                  disabled={form.market === "LOCAL"}
                  onChange={(e) => setForm({ ...form, priceCurrency: e.target.value as "USD" | "TND" })}
                >
                  <option value="USD">USD</option>
                  <option value="TND">TND</option>
                </select>
              </div>

              <div>
                <Label className="text-sm">Prix ({currencySuffix})</Label>
                <Input
                  inputMode="decimal"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.pricePerT}
                  onChange={(e) => setForm({ ...form, pricePerT: Number(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label className="text-sm">Taux de change</Label>
                <Input
                  inputMode="decimal"
                  className="bg-black/40 border-gray-700 text-white"
                  value={form.fxRate}
                  onChange={(e) => setForm({ ...form, fxRate: Number(e.target.value) || 0 })}
                />
              </div>

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

      {/* Modal Affectations */}
      {allocationOpen && allocationContract && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 w-[1100px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-lg font-semibold">Affectation des fixings</div>
                <div className="text-sm text-gray-400">
                  {allocationContract.code || "—"} · {allocationContract.clientName || "—"} · {allocationContract.productName || "—"} · {allocationContract.quantityT.toLocaleString()} T
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setAllocationOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full border ${coverageBadge(coverage)}`}>
                Couverture {(coverage * 100).toFixed(1)}%
              </span>
              {(fetchingRequirements || fetchingAllocations) && (
                <span className="text-xs text-gray-400">Mise à jour…</span>
              )}
            </div>

            <div className="space-y-4">
              {requirements.length === 0 ? (
                <div className="text-gray-300">Aucun besoin calculé pour ce contrat.</div>
              ) : (
                requirements.map((req) => {
                  const gradeKey = req.gradeName.toLowerCase();
                  const gradeAllocs = allocationsByGrade.get(gradeKey) || [];
                  const allocated = gradeAllocs.reduce((s, a) => s + Number(a.allocatedQty || 0), 0);
                  const remaining = Math.max(0, req.requiredQty - allocated);
                  const candidates = availableFixingsForGrade(req.gradeName);
                  const selectedFixingId = draftFixingByGrade[req.gradeName] || "";
                  const selectedFixing = candidates.find((f) => f.id === selectedFixingId);

                  return (
                    <Card key={req.id} className="bg-black/20 border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="font-semibold">{req.gradeName}</div>
                            <div className="text-sm text-gray-400">
                              Besoin: {req.requiredQty.toLocaleString(undefined, { maximumFractionDigits: 3 })} T ·
                              Affecté: {allocated.toLocaleString(undefined, { maximumFractionDigits: 3 })} T ·
                              Reste: {remaining.toLocaleString(undefined, { maximumFractionDigits: 3 })} T
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full border ${coverageBadge(req.requiredQty > 0 ? allocated / req.requiredQty : 0)}`}>
                            {req.requiredQty > 0 ? ((allocated / req.requiredQty) * 100).toFixed(0) : "0"}%
                          </span>
                        </div>

                        {gradeAllocs.length > 0 && (
                          <div className="mb-4 overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="text-gray-400">
                                <tr className="text-left">
                                  <th className="py-2 pr-3">Fixing</th>
                                  <th className="py-2 pr-3">Date</th>
                                  <th className="py-2 pr-3">Vessel</th>
                                  <th className="py-2 pr-3">Qté affectée</th>
                                  <th className="py-2 pr-3">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="text-gray-200">
                                {gradeAllocs.map((a) => {
                                  const fx = fixings.find((f) => f.id === a.fixingId);
                                  return (
                                    <tr key={a.id} className="border-t border-gray-800">
                                      <td className="py-2 pr-3">{fx?.code || a.fixingId}</td>
                                      <td className="py-2 pr-3">{fx?.date || "—"}</td>
                                      <td className="py-2 pr-3">{fx?.vessel || "—"}</td>
                                      <td className="py-2 pr-3">
                                        {Number(a.allocatedQty).toLocaleString(undefined, { maximumFractionDigits: 3 })} T
                                      </td>
                                      <td className="py-2 pr-3">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          title="Supprimer affectation"
                                          onClick={() => {
                                            if (confirm("Supprimer cette affectation ?")) {
                                              deleteAllocationMutation.mutate(a.id);
                                            }
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-6">
                            <Label className="text-sm">Fixing disponible</Label>
                            <select
                              className="w-full h-9 rounded-md bg-black/40 border border-gray-700 text-white px-3"
                              value={selectedFixingId}
                              onChange={(e) =>
                                setDraftFixingByGrade((prev) => ({
                                  ...prev,
                                  [req.gradeName]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Sélectionner…</option>
                              {candidates.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {(f.code || f.id)} · dispo {Number(f.available || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} T
                                  {f.vessel ? ` · ${f.vessel}` : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-span-3">
                            <Label className="text-sm">Quantité à affecter</Label>
                            <Input
                              inputMode="decimal"
                              className="bg-black/40 border-gray-700 text-white"
                              value={draftQtyByGrade[req.gradeName] ?? ""}
                              onChange={(e) =>
                                setDraftQtyByGrade((prev) => ({
                                  ...prev,
                                  [req.gradeName]: e.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="col-span-3">
                            <Button
                              className="w-full bg-trading-blue"
                              disabled={!selectedFixingId || remaining <= 0 || allocateMutation.isPending}
                              onClick={() => {
                                const qty = Number(draftQtyByGrade[req.gradeName] || 0);
                                if (!selectedFixingId) return alert("Choisis un fixing.");
                                if (!Number.isFinite(qty) || qty <= 0) return alert("Saisis une quantité valide.");
                                allocateMutation.mutate({
                                  contractId: allocationContract.id!,
                                  fixingId: selectedFixingId,
                                  gradeName: req.gradeName,
                                  qty,
                                });
                              }}
                            >
                              Affecter
                            </Button>
                          </div>
                        </div>

                        {selectedFixing && (
                          <div className="mt-2 text-xs text-gray-400">
                            Disponible sur fixing: {Number(selectedFixing.available || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} T
                            {selectedFixing.counterparty ? ` · ${selectedFixing.counterparty}` : ""}
                            {selectedFixing.vessel ? ` · ${selectedFixing.vessel}` : ""}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setAllocationOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
