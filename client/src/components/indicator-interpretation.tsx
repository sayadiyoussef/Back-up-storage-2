
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function IndicatorInterpretation({ gradeId }: { gradeId: number }){
  const { data, isLoading } = useQuery({ queryKey: ["/api/analytics/interpret/"+gradeId] });
  const res = (data as any)?.data;
  const notes = res?.notes || {};

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white">Interprétation des indicateurs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-gray-200 text-sm">
        {isLoading ? (
          <div className="h-24 bg-gray-800 rounded animate-pulse" />
        ) : !res ? (
          <div className="text-gray-400">Aucune donnée</div>
        ) : (
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Bollinger :</strong> {notes.bollinger}</li>
            <li><strong>Volatilité :</strong> {notes.volatility}</li>
            <li><strong>Tendance :</strong> {notes.trend}</li>
            <li><strong>Prévision :</strong> {notes.forecast}</li>
            <li><strong>Résumé :</strong> {notes.summary}</li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
