import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

const timeRanges = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
];

export default function MarketChart() {
  const [selectedGrade, setSelectedGrade] = useState("1");
  const [timeRange, setTimeRange] = useState("7d");

  const { data: grades } = useQuery({
    queryKey: ["/api/grades"],
  });

  const { data: marketData, isLoading } = useQuery({
    queryKey: [`/api/market/by-grade/${selectedGrade}`],
  });

  const processChartData = () => {
    if (!(marketData as any)?.data) return [];

    const data = (marketData as any).data;
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    
    return data
      .slice(0, days)
      .reverse()
      .map((item: any) => ({
        date: new Date(item.date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        price: item.priceUsd,
        fullDate: item.date,
      }));
  };

  const chartData = processChartData();
  const selectedGradeName = (grades as any)?.data?.find((g: any) => g.id.toString() === selectedGrade)?.name || "RBD Palm Oil";

  return (
    <Card className="bg-trading-slate border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold text-white">
            Price Trends
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Select value={selectedGrade} onValueChange={setSelectedGrade}>
              <SelectTrigger className="bg-gray-700 border-gray-600 text-white w-48" data-testid="select-chart-grade">
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
            
            <div className="flex border border-gray-600 rounded-lg overflow-hidden">
              {timeRanges.map((range) => (
                <Button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  variant="ghost"
                  size="sm"
                  className={`px-3 py-2 text-sm rounded-none ${
                    timeRange === range.value
                      ? 'bg-trading-blue text-white'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                  data-testid={`button-timerange-${range.value}`}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="h-80" data-testid="chart-container">
          {isLoading ? (
            <Skeleton className="w-full h-full bg-gray-700" />
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              No data available for the selected period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="#94A3B8"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#94A3B8"
                  fontSize={12}
                  domain={['dataMin - 5', 'dataMax + 5']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#F8FAFC'
                  }}
                  labelStyle={{ color: '#94A3B8' }}
                  formatter={(value: any) => [`$${value.toFixed(2)}`, selectedGradeName]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#0EA5E9"
                  strokeWidth={2}
                  dot={{ fill: '#0EA5E9', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, stroke: '#0EA5E9', strokeWidth: 2, fill: '#0EA5E9' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
