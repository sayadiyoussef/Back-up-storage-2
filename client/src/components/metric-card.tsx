import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  color: "blue" | "amber" | "green" | "gray";
}

const colorClasses = {
  blue: "from-trading-blue to-blue-500",
  amber: "from-trading-amber to-orange-500", 
  green: "from-trading-green to-green-500",
  gray: "from-gray-500 to-gray-600",
};

export default function MetricCard({ label, value, change, icon: Icon, color }: MetricCardProps) {
  const renderChangeIndicator = () => {
    if (change > 0) {
      return (
        <div className="flex items-center mt-2">
          <TrendingUp className="w-3 h-3 text-trading-green mr-1" />
          <span className="text-trading-green text-sm font-medium">+{change.toFixed(1)}%</span>
          <span className="text-gray-400 text-sm ml-2">24h</span>
        </div>
      );
    } else if (change < 0) {
      return (
        <div className="flex items-center mt-2">
          <TrendingDown className="w-3 h-3 text-trading-red mr-1" />
          <span className="text-trading-red text-sm font-medium">{change.toFixed(1)}%</span>
          <span className="text-gray-400 text-sm ml-2">24h</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center mt-2">
          <Minus className="w-3 h-3 text-gray-400 mr-1" />
          <span className="text-gray-400 text-sm font-medium">0.0%</span>
          <span className="text-gray-400 text-sm ml-2">24h</span>
        </div>
      );
    }
  };

  return (
    <Card className="bg-trading-slate border-gray-700 hover:border-gray-600 transition-colors" data-testid={`metric-card-${(label ?? 'Metric').toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm font-medium" data-testid="metric-label">
              {label}
            </p>
            <p className="text-2xl font-bold text-white mt-1" data-testid="metric-value">
              {value}
            </p>
            <div data-testid="metric-change">
              {renderChangeIndicator()}
            </div>
          </div>
          <div className={`w-12 h-12 bg-gradient-to-br ${colorClasses[color]} rounded-lg flex items-center justify-center`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
