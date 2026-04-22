import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import MarketChart from "@/components/market-chart";
import MarketTable from "@/components/market-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export default function Market() {
  const [selectedGrade, setSelectedGrade] = useState<string>("1");
  
  const { data: grades } = useQuery({
    queryKey: ["/api/grades"],
  });

  const { data: marketData, refetch, isLoading } = useQuery({
    queryKey: ["/api/market"],
  });

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-trading-dark">
      <Sidebar />
      
      <div className="flex-1 overflow-hidden flex flex-col">
        <TopBar />
        
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Market Data</h1>
                <p className="text-gray-400">Real-time oil price tracking and analysis</p>
              </div>
              <Button
                onClick={handleRefresh}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
                disabled={isLoading}
                data-testid="button-refresh"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Chart Section */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">
            <div className="xl:col-span-3">
              <MarketChart />
            </div>
            
            {/* Grade Selector */}
            <Card className="bg-trading-slate border-gray-700">
              <CardHeader>
                <CardTitle className="text-white text-lg">Oil Grades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white" data-testid="select-grade">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 border-gray-600">
                    {(grades as any)?.data?.map((grade: any) => (
                      <SelectItem key={grade.id} value={grade.id.toString()}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="space-y-3">
                  {(grades as any)?.data?.slice(0, 5).map((grade: any) => (
                    <div
                      key={grade.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedGrade === grade.id.toString()
                          ? 'border-trading-blue bg-trading-blue/10'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                      onClick={() => setSelectedGrade(grade.id.toString())}
                      data-testid={`grade-item-${grade.id}`}
                    >
                      <p className="text-white font-medium text-sm">{grade.name}</p>
                      <p className="text-gray-400 text-xs mt-1">{grade.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Market Data Table */}
          <MarketTable />
        </main>
      </div>
    </div>
  );
}
