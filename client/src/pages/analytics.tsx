import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import MetricCard from "@/components/metric-card";
import MarketChart from "@/components/market-chart";
import BuyingScoreCard from "@/components/buying-score-card";
import IndicatorInterpretation from "@/components/indicator-interpretation";
import MarketIntel from "@/components/market-intel";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Zap } from "lucide-react";

export default function Analytics() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/market/latest"] });
  const market = (data as any)?.data || [];
  const [gradeId, setGradeId] = useState<string>(market[0]?.gradeId?.toString?.() ?? "1");

  const avgUsd = market.length ? (market.reduce((s: number, r: any) => s + (r.priceUsd || 0), 0) / market.length).toFixed(2) : "0.00";
  const avgUsdTnd = market.length ? (market.reduce((s: number, r: any) => s + (r.usdTnd || 0), 0) / market.length).toFixed(3) : "0.000";
  const upCount = market.filter((r: any) => (r.change24h || 0) > 0).length;
  const downCount = market.filter((r: any) => (r.change24h || 0) < 0).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="flex">
        <Sidebar />
        <main className="flex-1">
          <TopBar title="Analytics" />
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
              ) : (
                <>
                  <MetricCard label="Avg Price (USD)" value={`$${avgUsd}`} change={0.0} icon={BarChart3} />
                  <MetricCard label="USD/TND" value={`${avgUsdTnd}`} change={0.0} icon={Zap} />
                  <MetricCard label="Gainers (24h)" value={`${upCount}`} change={0.0} icon={TrendingUp} />
                  <MetricCard label="Losers (24h)" value={`${downCount}`} change={0.0} icon={TrendingDown} />
                </>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {isLoading ? <Skeleton className="h-80 w-full" /> : <MarketChart />}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Buying Score (par grade)</h2>
                <div className="w-56">
                  <Select value={gradeId} onValueChange={setGradeId}>
                    <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                      <SelectValue placeholder="Sélectionner un grade" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700 text-white">
                      {market.map((m:any)=> (
                        <SelectItem key={m.gradeId} value={String(m.gradeId)}>{m.gradeName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <BuyingScoreCard gradeId={parseInt(gradeId||"1",10)} />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <IndicatorInterpretation gradeId={parseInt(gradeId||"1",10)} />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <h2 className="text-lg font-semibold text-white">Market Intelligence</h2>
              <MarketIntel />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
