import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import MetricCard from "@/components/metric-card";
import MarketChart from "@/components/market-chart";
import ChatPreview from "@/components/chat-preview";
import MarketTable from "@/components/market-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Droplets, DollarSign, Layers, Zap } from "lucide-react";

export default function Dashboard() {
  const { data: marketData, isLoading } = useQuery({
    queryKey: ["/api/market/latest"],
  });

  const latestData = (marketData as any)?.data || [];

  const getMetrics = () => {
    if (latestData.length === 0) return [];

    const rbdPalmOil = latestData.find((d: any) => d.gradeName === "RBD PO");
    const rbdPalmStearin = latestData.find((d: any) => d.gradeName === "RBD PS");
    const usdTnd = rbdPalmOil?.usdTnd || 3.184;

    return [
      {
        label: "RBD PO",
        value: rbdPalmOil ? `$${rbdPalmOil.priceUsd}` : "$0.00",
        change: rbdPalmOil?.change24h || 0,
        icon: Zap,
        color: "blue" as const
      },
      {
        label: "RBD Palm Stearin", 
        value: rbdPalmStearin ? `$${rbdPalmStearin.priceUsd}` : "$0.00",
        change: rbdPalmStearin?.change24h || 0,
        icon: Droplets,
        color: "amber" as const
      },
      {
        label: "USD/TND",
        value: usdTnd.toFixed(3),
        change: 0.8,
        icon: DollarSign,
        color: "green" as const
      },
      {
        label: "Active Grades",
        value: "7",
        change: 0,
        icon: Layers,
        color: "gray" as const
      }
    ];
  };

  const metrics = getMetrics();

  return (
    <div className="flex h-screen overflow-hidden bg-trading-dark">
      <Sidebar />
      
      <div className="flex-1 overflow-hidden flex flex-col">
        <TopBar />
        
        <main className="flex-1 overflow-y-auto p-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 bg-trading-slate" />
              ))
            ) : (
              metrics.map((metric, index) => (
                <MetricCard key={index} {...metric} />
              ))
            )}
          </div>

          {/* Charts and Chat Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <MarketChart />
            </div>
            <div>
              <ChatPreview />
            </div>
          </div>

          {/* Market Data Table */}
          <MarketTable />
        </main>
      </div>
    </div>
  );
}
