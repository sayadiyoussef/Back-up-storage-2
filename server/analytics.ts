import type { MarketData } from "../shared/schema.ts";

export interface Indicators {
  P_today: number;
  MA_20: number;
  Bollinger_low: number;
  Forecast_min: number;
  Forecast_max: number;
  Volatility: number; // daily return std over 30d (e.g., 0.021 = 2.1%)
  Trend_slope: number; // USD/day (linear regression over last 10 days)
  Forecast_1d: number; // next-day price (linear projection)
}

export interface ScoreResult {
  indicators: Indicators;
  score: number; // 0..100
  bucket: "strong_buy" | "buy" | "watch" | "avoid";
  comment: string;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
}
function stddev(arr: number[]): number {
  const m = mean(arr);
  return arr.length ? Math.sqrt(mean(arr.map(x => (x-m)*(x-m)))) : 0;
}

function linearRegressionSlope(y: number[]): number {
  // slope of y over x=1..n
  const n = y.length;
  if (n < 2) return 0;
  const x = Array.from({length:n}, (_,i)=>i+1);
  const xmean = mean(x);
  const ymean = mean(y);
  const num = x.reduce((s, xi, i) => s + (xi - xmean) * (y[i] - ymean), 0);
  const den = x.reduce((s, xi) => s + (xi - xmean)*(xi - xmean), 0);
  if (den === 0) return 0;
  return num / den;
}

export function computeIndicators(ts: MarketData[]): Indicators {
  // ts expected sorted ascending by date
  const prices = ts.map(t=>t.priceUsd);
  const n = prices.length;
  const last = prices[n-1] ?? 0;

  const window20 = prices.slice(Math.max(0, n-20));
  const ma20 = mean(window20);
  const std20 = stddev(window20);
  const bollLow = ma20 - 2*std20;

  // daily returns for volatility
  const returns:number[] = [];
  for (let i=1;i<n;i++){
    const prev = prices[i-1];
    const cur = prices[i];
    if (prev>0){
      returns.push((cur - prev)/prev);
    }
  }
  const vol30 = stddev(returns.slice(Math.max(0, returns.length-30)));

  // trend slope over last 10 days
  const last10 = prices.slice(Math.max(0, n-10));
  const slope = linearRegressionSlope(last10);

  // forecast next 7 days via linear projection + residual band
  const resid = last10.map((p, i) => {
    const x = i+1;
    const yhat = last10[0] + slope*(x-1);
    return p - yhat;
  });
  const residStd = stddev(resid);
  const forecasts = Array.from({length:7}, (_,h)=> last + slope*(h+1));
  const fmin = Math.min(...forecasts) - residStd;
  const fmax = Math.max(...forecasts) + residStd;
  const f1 = last + slope*1;

  return {
    P_today: last,
    MA_20: ma20,
    Bollinger_low: bollLow,
    Forecast_min: fmin,
    Forecast_max: fmax,
    Volatility: vol30,
    Trend_slope: slope,
    Forecast_1d: f1,
  };
}

export function computeBuyingScore(ind: Indicators): ScoreResult {
  const base = 50;

  // bonus_bollinger 10..15 if below lower band, proportional
  let bonus_boll = 0;
  if (ind.P_today < ind.Bollinger_low) {
    const diff = Math.max(0, ind.Bollinger_low - ind.P_today);
    const denom = Math.max(1e-9, (ind.MA_20 - ind.Bollinger_low)); // ~= 2*std
    const proximity = Math.min(1, diff / denom);
    bonus_boll = 10 + 5*proximity;
  }

  // bonus_forecast
  let bonus_forecast = 0;
  if (ind.P_today <= ind.Forecast_min) {
    bonus_forecast = 20;
  } else if (ind.P_today <= ind.MA_20) {
    bonus_forecast = 10;
  }

  // bonus_trend 5..10 if negative slope magnitude scaled by 0.15% of price/day
  let bonus_trend = 0;
  if (ind.Trend_slope < 0) {
    const rel = Math.min(1, Math.abs(ind.Trend_slope) / Math.max(1, ind.MA_20) / 0.0015);
    bonus_trend = 5 + 5*rel;
  }

  // malus_volatility
  const threshold = 0.025; // 2.5% daily std
  let malus_vol = 0;
  if (ind.Volatility > threshold) {
    const over = Math.min(1, (ind.Volatility - threshold) / 0.025); // up to 5%
    malus_vol = 10 + 10*over;
  }

  let score = base + bonus_boll + bonus_forecast + bonus_trend - malus_vol;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let bucket: ScoreResult["bucket"];
  if (score >= 85) bucket = "strong_buy";
  else if (score >= 65) bucket = "buy";
  else if (score >= 50) bucket = "watch";
  else bucket = "avoid";

  // comment
  const bits:string[] = [];
  if (bonus_boll>0) bits.push("Prix sous la bande de Bollinger");
  if (bonus_forecast===20) bits.push("≤ prévision min 7j");
  else if (bonus_forecast===10) bits.push("≤ MA20");
  if (bonus_trend>0) bits.push("tendance récente baissière");
  if (malus_vol>0) bits.push("volatilité élevée");
  const comment = bits.length ? bits.join(" + ")+" = opportunité" : "Situation neutre";

  return { indicators: ind, score, bucket, comment };
}


export function interpretIndicators(ind: Indicators) {
  const notes: any = {};

  // Bollinger interpretation
  const width = ind.MA_20 - ind.Bollinger_low;
  const dist = ind.MA_20 - ind.P_today;
  const pct = width ? (dist / width) : 0;
  if (pct > 1.1) notes.bollinger = "Prix nettement sous la bande inférieure → possible survente / opportunité d'achat contrarien";
  else if (pct > 0.6) notes.bollinger = "Prix proche de la bande basse → biais haussier à court terme si rebond";
  else if (pct < -0.1) notes.bollinger = "Prix au-dessus de la moyenne mobile → momentum positif";
  else notes.bollinger = "Prix autour de la MA20 → situation neutre";

  // Volatility interpretation
  if (ind.Volatility >= 0.03) notes.volatility = "Volatilité >3% (30j) → risque élevé; adapter la taille des positions";
  else if (ind.Volatility >= 0.02) notes.volatility = "Volatilité modérée (2–3%)";
  else notes.volatility = "Volatilité faible (<2%) → conditions calmes";

  // Trend slope
  if (ind.Trend_slope < -2) notes.trend = "Tendance baissière marquée (régression 10j)";
  else if (ind.Trend_slope < 0) notes.trend = "Tendance légèrement baissière";
  else if (ind.Trend_slope > 2) notes.trend = "Tendance haussière marquée";
  else notes.trend = "Tendance latérale";

  // Forecast vs price
  const diff = ind.Forecast_1d - ind.P_today;
  if (diff > 5) notes.forecast = "Projection 1j haussière (> +$5)";
  else if (diff > 0) notes.forecast = "Projection 1j légèrement haussière";
  else if (diff < -5) notes.forecast = "Projection 1j baissière (< -$5)";
  else notes.forecast = "Projection 1j neutre";

  // Summary
  const positives = ["bollinger","trend","forecast"].filter(k => /haussi|survente|au-dessus/.test(notes[k]||"")).length;
  const negatives = ["volatility","trend","forecast"].filter(k => /risque|baissi/.test(notes[k]||"")).length;
  let summary = "Signal neutre";
  if (positives >= 2 && negatives === 0) summary = "Contexte favorable";
  else if (negatives >= 2 && positives === 0) summary = "Contexte défavorable";
  else if (positives > negatives) summary = "Légère préférence à l'achat";
  else if (negatives > positives) summary = "Légère préférence à la prudence";
  notes.summary = summary;

  return notes;
}
