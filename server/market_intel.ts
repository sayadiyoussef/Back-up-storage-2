
// Minimal market intelligence providers with safe fallbacks
import { storage } from "./storage.js";

async function safeFetchJSON(url: string, timeoutMs = 5000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function getOilHistory() {
  // Yahoo Finance public endpoints (no API key). 30d daily candles.
  const endpoints = {
    brent: "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=1mo&interval=1d",
    wti: "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=1mo&interval=1d",
  };
  const out:any = {};
  for (const [k, url] of Object.entries(endpoints)) {
    const j = await safeFetchJSON(url);
    if (j && j.chart?.result?.[0]) {
      const r = j.chart.result[0];
      const ts = r.timestamp || [];
      const closes = r.indicators?.quote?.[0]?.close || [];
      out[k] = ts.map((t:number, i:number)=>({ date: new Date(t*1000).toISOString().slice(0,10), price: Number(closes[i]||0) })).filter(x=>x.price);
    } else {
      out[k] = [];
    }
  }
  return out;
}

export async function getTickers(symbols = ["ZL=F","BO=F","BZ=F","CL=F"]) {
  const res:any[] = [];
  for (const s of symbols) {
    const j = await safeFetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=1d`);
    if (j && j.chart?.result?.[0]) {
      const r = j.chart.result[0];
      const closes = r.indicators?.quote?.[0]?.close || [];
      const price = Number(closes[closes.length-1]||0);
      const prev = Number(closes[closes.length-2]||0);
      const change = prev ? ((price - prev)/prev)*100 : 0;
      res.push({ symbol: s, price: Number(price.toFixed(2)), change: Number(change.toFixed(2)) });
    } else {
      res.push({ symbol: s, price: 0, change: 0 });
    }
  }
  return res;
}

export async function getWeather(locations = [
  { name: "Rades", lat: 36.8, lon: 10.18 },
  { name: "Port Klang", lat: 3.0, lon: 101.4 },
  { name: "Belawan", lat: 3.77, lon: 98.68 },
]) {
  const out:any[] = [];
  for (const l of locations) {
    const j = await safeFetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current_weather=true`);
    if (j && j.current_weather) {
      out.push({ location: l.name, temperature: j.current_weather.temperature, windspeed: j.current_weather.windspeed, weathercode: j.current_weather.weathercode });
    } else {
      out.push({ location: l.name, temperature: null, windspeed: null, weathercode: null });
    }
  }
  return out;
}

export async function getLogistics() {
  const vessels = await storage.getAllVessels();
  const fixings = await storage.getAllFixings();
  const nextVessel = vessels.slice().sort((a:any,b:any)=>String(a.eta||'').localeCompare(String(b.eta||'')))[0];
  return { nextVessel, recentFixings: fixings.slice(0,3), vessels: vessels.slice(0,5) };
}

export async function getPolitics() {
  // Placeholder headlines; configure NEWS_FEED_URL env to proxy a feed if desired.
  const today = new Date().toISOString().slice(0,10);
  return [
    { source: "DMA Intel", title: "Malaysia mulls export policy tweaks for palm oil derivatives", date: today, url: "#" },
    { source: "DMA Intel", title: "Indonesian biodiesel mandate update expected", date: today, url: "#" },
  ];
}

export async function getMarketIntel() {
  const [oilHistory, tickers, weather, logistics, politics] = await Promise.all([
    getOilHistory(), getTickers(), getWeather(), getLogistics(), getPolitics()
  ]);
  return { oilHistory, tickers, weather, logistics, politics };
}
