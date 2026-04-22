import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Droplets,
  TestTube,
  Leaf,
  Flame,
} from "lucide-react";

const gradeIcons = {
  "RBD PO": Zap,
  "RBD PS": Droplets,
  "RBD POL IV56": TestTube,
  "RBD POL IV64": Leaf,
  "RBD PKO": Flame,
  "RBD CNO": Zap,
  "RBD PKS": Flame,
  "CDSBO": Droplets,
} as const;

const gradeColors = {
  "RBD PO": "from-trading-blue to-blue-500",
  "RBD PS": "from-trading-amber to-orange-500",
  "RBD POL IV56": "from-purple-500 to-purple-600",
  "RBD POL IV64": "from-green-500 to-green-600",
  "RBD PKO": "from-red-500 to-red-600",
  "RBD CNO": "from-cyan-500 to-cyan-600",
  "RBD PKS": "from-pink-500 to-pink-600",
  "CDSBO": "from-yellow-500 to-yellow-600",
} as const;


type ForwardRow = {
  gradeId: number;
  gradeName: string;
  code: string;
  period: string;
  ask?: number;
  askUsd?: number;
  priceUsd?: number;
};

export default function MarketTable() {
  const { data: latestResp, isLoading, refetch } = useQuery({
    queryKey: ["/api/market/latest"],
  });
  const latestData = (latestResp as any)?.data || [];

  /** --- état d’expansion par grade --- */
  const [openForwards, setOpenForwards] = useState<Record<number, boolean>>({});
  const toggleRow = (gradeId: number) =>
    setOpenForwards((s) => ({ ...s, [gradeId]: !s[gradeId] }));

  /** --- données de forwards par grade + loading --- */
  const [forwards, setForwards] = useState<Record<number, ForwardRow[] | undefined>>({});
  const [fwdLoading, setFwdLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    (async () => {
      const ids = Object.entries(openForwards)
        .filter(([, v]) => v)
        .map(([k]) => Number(k));

      await Promise.all(
        ids.map(async (id) => {
          if (forwards[id]) return; // déjà chargés
          try {
            setFwdLoading((s) => ({ ...s, [id]: true }));
            const r = await fetch(`/api/grades/${id}/forwards`);
            const j = await r.json();
            setForwards((s) => ({ ...s, [id]: (j?.data || []) as ForwardRow[] }));
          } catch {
            setForwards((s) => ({ ...s, [id]: [] }));
          } finally {
            setFwdLoading((s) => ({ ...s, [id]: false }));
          }
        })
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openForwards]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(price || 0);

  const formatTndPrice = (usd: number, usdTnd: number) =>
    new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 2 }).format(
      (usd || 0) * (usdTnd || 0)
    ) + " TND";

  const renderChangeIndicator = (change: number) => {
    if (change > 0) {
      return (
        <span className="flex items-center text-trading-green font-medium">
          <TrendingUp className="w-3 h-3 mr-1" />
          +{(change || 0).toFixed(1)}%
        </span>
      );
    } else if (change < 0) {
      return (
        <span className="flex items-center text-trading-red font-medium">
          <TrendingDown className="w-3 h-3 mr-1" />
          {(change || 0).toFixed(1)}%
        </span>
      );
    } else {
      return (
        <span className="flex items-center text-gray-400 font-medium">
          <Minus className="w-3 h-3 mr-1" />
          0.0%
        </span>
      );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-trading-green/20 text-trading-green border-trading-green/20">
            <div className="w-1.5 h-1.5 bg-trading-green rounded-full mr-1.5" />
            Active
          </Badge>
        );
      case "limited":
        return (
          <Badge className="bg-trading-amber/20 text-trading-amber border-trading-amber/20">
            <div className="w-1.5 h-1.5 bg-trading-amber rounded-full mr-1.5" />
            Limited
          </Badge>
        );
      default:
        return <Badge variant="secondary">Inactive</Badge>;
    }
  };

  /** helper: prix forward (avec fallback ask/askUsd/priceUsd) */
  const forwardPrice = (f: ForwardRow) =>
    Number((f.ask as any) ?? (f.askUsd as any) ?? (f.priceUsd as any) ?? 0);

  /** 👉 redirige vers la page Fixings qui ouvrira le VRAI modal (avec Freight) */
  const openFixingFromMarket = (gradeName: string, askUsd: number) => {
    const params = new URLSearchParams({
      newFromMarket: "1",
      grade: gradeName,
      fob: String(askUsd ?? ""),
    });
    window.location.href = `/fixings?${params.toString()}`;
  };

  return (
    <Card className="bg-trading-slate border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-white">
            Live Market Data
          </CardTitle>
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-400">
              Last updated:{" "}
              <span className="text-white font-mono">
                {new Date().toLocaleTimeString()}
              </span>
            </span>
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300 hover:bg-gray-700"
              disabled={isLoading}
            >
              <RefreshCw
                className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Grade
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Price (USD)
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Price (TND)
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Change 24h
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Volume
                </th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-700">
              {isLoading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-32 bg-gray-700" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-20 bg-gray-700" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-24 bg-gray-700" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-16 bg-gray-700" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-16 bg-gray-700" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-16 bg-gray-700" />
                    </td>
                  </tr>
                ))
              ) : latestData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No market data available
                  </td>
                </tr>
              ) : (
                latestData.map((item: any) => {
                  const IconComponent =
                    (gradeIcons as any)[item.gradeName] || Zap;
                  const gradientClass =
                    (gradeColors as any)[item.gradeName] ||
                    "from-gray-500 to-gray-600";
                  const gid = item.gradeId;

                  return (
                    <tbody key={gid} className="contents">
                      <tr
                        className="hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onClick={() => toggleRow(gid)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div
                              className={`w-8 h-8 bg-gradient-to-br ${gradientClass} rounded-lg flex items-center justify-center mr-3`}
                            >
                              <IconComponent className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-white font-medium">
                              {item.gradeName}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-white">
                          {formatPrice(item.priceUsd)}
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-300">
                          {formatTndPrice(item.priceUsd, item.usdTnd)}
                        </td>
                        <td className="px-6 py-4">
                          {renderChangeIndicator(item.change24h || 0)}
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-300">
                          {item.volume || "N/A"}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(item.status)}
                        </td>
                      </tr>

                      {/* Ligne Forwards */}
                      {openForwards[gid] && (
                        <tr className="bg-gray-900/50">
                          <td colSpan={6} className="px-6 py-4">
                            {fwdLoading[gid] ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {Array.from({ length: 4 }).map((_, i) => (
                                  <Skeleton
                                    key={i}
                                    className="h-24 w-full bg-gray-800"
                                  />
                                ))}
                              </div>
                            ) : !forwards[gid] ? (
                              <div className="text-gray-400">
                                No forward data.
                              </div>
                            ) : forwards[gid]!.length === 0 ? (
                              <div className="text-gray-400">
                                No forward data.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {forwards[gid]!.map((f, idx) => (
                                  <div
                                    key={`${f.code}-${idx}`}
                                    className="rounded-lg border border-gray-700 bg-gray-800/70 p-4 hover:border-trading-blue hover:shadow-lg hover:shadow-trading-blue/10 cursor-pointer"
                                    onClick={() =>
                                      openFixingFromMarket(
                                        item.gradeName,
                                        forwardPrice(f)
                                      )
                                    }
                                    title="Créer un fixing avec ce prix"
                                  >
                                    <div className="text-xs text-gray-400">
                                      {item.gradeName}
                                    </div>
                                    <div className="mt-1 font-semibold text-white">
                                      {f.code}
                                      {" • "}
                                      {f.period}
                                    </div>
                                    <div className="mt-2 text-trading-blue font-mono">
                                      {formatPrice(forwardPrice(f))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
