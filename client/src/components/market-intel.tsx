
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

function SmallChart({ data, title }: {data: any[]; title: string}){
  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader><CardTitle className="text-white text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="price" stroke="#0EA5E9" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export default function MarketIntel(){
  const { data, isLoading } = useQuery({ queryKey: ["/api/market/intel"] });
  const d = (data as any)?.data || {};

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
      <div className="xl:col-span-2">
        <SmallChart data={(d.oilHistory?.brent||[]).map((x:any)=>({date:x.date.slice(5), price:x.price}))} title="Brent (30j)" />
      </div>
      <div className="xl:col-span-2">
        <SmallChart data={(d.oilHistory?.wti||[]).map((x:any)=>({date:x.date.slice(5), price:x.price}))} title="WTI (30j)" />
      </div>
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader><CardTitle className="text-white">Tickers</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(d.tickers||[]).map((t:any)=>(
            <div key={t.symbol} className="flex justify-between text-sm text-gray-200">
              <span>{t.symbol}</span>
              <span>${t.price} <span className={t.change>=0? 'text-green-400': 'text-red-400'}>({t.change}%)</span></span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader><CardTitle className="text-white">Weather</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-gray-200">
          {(d.weather||[]).map((w:any)=>(
            <div key={w.location} className="flex justify-between">
              <span>{w.location}</span>
              <span>{w.temperature!==null? `${w.temperature}°C / wind ${w.windspeed}km/h` : 'N/A'}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="bg-gray-900 border-gray-700 xl:col-span-2">
        <CardHeader><CardTitle className="text-white">Logistics</CardTitle></CardHeader>
        <CardContent className="text-sm text-gray-200 space-y-2">
          <div><strong>Next vessel:</strong> {d.logistics?.nextVessel?.name || 'N/A'} ETA {d.logistics?.nextVessel?.eta || '—'}</div>
          <div><strong>Recent fixings:</strong></div>
          <ul className="list-disc list-inside">
            {(d.logistics?.recentFixings||[]).map((f:any)=>(
              <li key={f.id}>{f.date} · {f.route} · {f.grade} · {f.volume} · ${f.priceUsd}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="bg-gray-900 border-gray-700 xl:col-span-2">
        <CardHeader><CardTitle className="text-white">Politics</CardTitle></CardHeader>
        <CardContent className="text-sm text-gray-200 space-y-1">
          {(d.politics||[]).map((n:any,i:number)=>(
            <div key={i} className="flex justify-between">
              <span>{n.title}</span>
              <a className="text-blue-400 hover:underline" href={n.url} target="_blank" rel="noreferrer">source</a>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
