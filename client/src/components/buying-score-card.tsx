import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Result = {
  gradeId: number;
  gradeName: string;
  score: number;
  bucket: "strong_buy" | "buy" | "watch" | "avoid";
  comment: string;
  indicators: {
    P_today: number;
    MA_20: number;
    Bollinger_low: number;
    Forecast_min: number;
    Forecast_max: number;
    Volatility: number;
    Trend_slope: number;
    Forecast_1d: number;
  }
};

const BucketBadge = ({ bucket }: { bucket: Result["bucket"] }) => {
  const map = {
    strong_buy: { label: "Achat fortement recommandé", className: "bg-emerald-600/20 text-emerald-300 border-emerald-600" },
    buy:        { label: "Bonne opportunité", className: "bg-green-600/20 text-green-300 border-green-600" },
    watch:      { label: "Observer", className: "bg-amber-600/20 text-amber-300 border-amber-600" },
    avoid:      { label: "À éviter", className: "bg-red-600/20 text-red-300 border-red-600" },
  } as const;
  const { label, className } = (map as any)[bucket];
  return <Badge className={cn("border px-2 py-1 rounded-md", className)}>{label}</Badge>;
};

export default function BuyingScoreCard({ gradeId }: { gradeId: number }){
  const { data, isLoading } = useQuery({ queryKey: [`/api/analytics/buying-score/${gradeId}`] });
  const res = (data as any)?.data as Result | undefined;

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle className="text-white">Buying Score</CardTitle>
        {res && <BucketBadge bucket={res.bucket} />}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !res ? (
          <div className="h-24 bg-gray-800 rounded-lg animate-pulse" />
        ) : (
          <>
            <div className="flex items-end gap-4">
              <div className="text-5xl font-bold text-white tabular-nums">{res.score}</div>
              <div className="text-gray-400 mb-2">/ 100</div>
            </div>

            <Progress value={res.score} className="h-2 bg-gray-800" />

            <p className="text-gray-300 text-sm">{res.comment}</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <K label="P_today" v={`$${res.indicators.P_today.toFixed(2)}`} />
              <K label="MA_20" v={`$${res.indicators.MA_20.toFixed(2)}`} />
              <K label="Bollinger_low" v={`$${res.indicators.Bollinger_low.toFixed(2)}`} />
              <K label="Forecast_min (7j)" v={`$${res.indicators.Forecast_min.toFixed(2)}`} />
              <K label="Forecast_max (7j)" v={`$${res.indicators.Forecast_max.toFixed(2)}`} />
              <K label="Volatility (30j)" v={`${(res.indicators.Volatility*100).toFixed(2)}%`} />
              <K label="Trend_slope (USD/j)" v={`${res.indicators.Trend_slope.toFixed(2)}`} />
              <K label="Prévision 1j" v={`$${res.indicators.Forecast_1d.toFixed(2)}`} icon={res.indicators.Trend_slope>=0?TrendingUp:TrendingDown} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function K({ label, v, icon:Icon }: {label:string; v:string; icon?: any}){
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
      <div className="text-xs uppercase text-gray-400">{label}</div>
      <div className="mt-1 text-white font-medium flex items-center gap-1">
        {Icon ? <Icon size={16} /> : <Activity size={16} className="opacity-60" />}{v}
      </div>
    </div>
  )
}
