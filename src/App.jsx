import { useState, useEffect, useRef } from "react";

const C = {
  bg:      "#0a0e17",
  panel:   "#0f1623",
  border:  "#1a2235",
  accent:  "#f0b90b",
  green:   "#0ecb81",
  red:     "#f6465d",
  muted:   "#4a5568",
  text:    "#e2e8f0",
  subtext: "#718096",
};

const SYMBOL   = "BTCUSDT";
const INTERVAL = "15m";

// ── Indicatori ───────────────────────────────────────────────
function calcRSI(candles, period = 14) {
  const closes = candles.map(c => c.close);
  const rsis = new Array(period).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsis.push(+(100 - 100 / (1 + rs)).toFixed(2));
  }
  return rsis;
}

function calcEMA(arr, period) {
  const k = 2 / (period + 1);
  const emas = [];
  let ema = null;
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { emas.push(null); continue; }
    if (i === period - 1) {
      ema = arr.slice(0, period).reduce((a, b) => a + b) / period;
    } else {
      ema = arr[i] * k + ema * (1 - k);
    }
    emas.push(+ema.toFixed(2));
  }
  return emas;
}

function calcMACD(candles) {
  const closes   = candles.map(c => c.close);
  const ema12    = calcEMA(closes, 12);
  const ema26    = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => (v && ema26[i] ? +(v - ema26[i]).toFixed(2) : null));
  const valid    = macdLine.map(v => v ?? 0);
  const signal   = calcEMA(valid, 9);
  const hist     = macdLine.map((v, i) => (v !== null && signal[i] ? +(v - signal[i]).toFixed(2) : null));
  return { macdLine, signal, hist };
}

function getSignal(rsis, hist) {
  const rsi     = rsis[rsis.length - 1];
  const histNow = hist[hist.length - 1];
  const histPrv = hist[hist.length - 2];
  if (!rsi || !histNow || !histPrv) return "HOLD";
  if (rsi < 30 && histPrv < 0 && histNow > 0) return "LONG";
  if (rsi > 70 && histPrv > 0 && histNow < 0) return "SHORT";
  return "HOLD";
}

// ── Fetch lumânări REST ──────────────────────────────────────
async function fetchCandles() {
  const url = `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${INTERVAL}&limit=60`;
  const res  = await fetch(url);
  const data = await res.json();
  return data.map(k => ({
    time:  new Date(k[0]),
    open:  parseFloat(k[1]),
    high:  parseFloat(k[2]),
    low:   parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

// ── Componente UI ────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 1,
    }}>{label}</span>
  );
}

function StatBox({ label, value, color, sub }) {
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "12px 16px", flex: 1, minWidth: 90,
    }}>
      <div style={{ color: C.subtext, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || C.text, fontSize: 17, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: C.subtext, fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CandleChart({ candles, signals }) {
  const W = 700, H = 200;
  const pad = { l: 50, r: 10, t: 10, b: 20 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const visible = candles.slice(-50);
  const prices  = visible.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rangeP = maxP - minP || 1;
  const cw = iW / visible.length;
  const bw = Math.max(cw * 0.6, 2);
  const py = p => pad.t + iH - ((p - minP) / rangeP) * iH;
  const cx = i => pad.l + i * cw + cw / 2;
  const yTicks = Array.from({ length: 5 }, (_, i) => minP + (rangeP / 4) * i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={py(v)} y2={py(v)} stroke={C.border} strokeDasharray="3,3" />
          <text x={pad.l - 4} y={py(v) + 4} textAnchor="end" fill={C.subtext} fontSize={8}>
            {(v / 1000).toFixed(1)}k
          </text>
        </g>
      ))}
      {visible.map((c, i) => {
        const isUp  = c.close >= c.open;
        const color = isUp ? C.green : C.red;
        const bodyY = py(Math.max(c.open, c.close));
        const bodyH = Math.max(Math.abs(py(c.open) - py(c.close)), 1);
        const sig   = signals[candles.length - visible.length + i];
        return (
          <g key={i}>
            <line x1={cx(i)} x2={cx(i)} y1={py(c.high)} y2={py(c.low)} stroke={color} strokeWidth={1} />
            <rect x={cx(i) - bw / 2} y={bodyY} width={bw} height={bodyH} fill={color} rx={1} />
            {sig === "LONG"  && <text x={cx(i)} y={py(c.low) + 12}  textAnchor="middle" fill={C.green} fontSize={9} fontWeight="bold">▲</text>}
            {sig === "SHORT" && <text x={cx(i)} y={py(c.high) - 4} textAnchor="middle" fill={C.red}   fontSize={9} fontWeight="bold">▼</text>}
          </g>
        );
      })}
    </svg>
  );
}

function RSIChart({ rsis }) {
  const W = 700, H = 70;
  const pad = { l: 50, r: 10, t: 8, b: 16 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const visible = rsis.slice(-50).filter(Boolean);
  const py = v => pad.t + iH - (v / 100) * iH;
  const px = i => pad.l + (i / Math.max(visible.length - 1, 1)) * iW;
  const path = visible.map((v, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <line x1={pad.l} x2={W - pad.r} y1={py(70)} y2={py(70)} stroke={C.red}   strokeDasharray="3,3" opacity={0.5} />
      <line x1={pad.l} x2={W - pad.r} y1={py(30)} y2={py(30)} stroke={C.green} strokeDasharray="3,3" opacity={0.5} />
      <text x={pad.l - 4} y={py(70) + 3} textAnchor="end" fill={C.red}   fontSize={7}>70</text>
      <text x={pad.l - 4} y={py(30) + 3} textAnchor="end" fill={C.green} fontSize={7}>30</text>
      <path d={path} fill="none" stroke={C.accent} strokeWidth={1.5} />
      {visible.length > 0 && (
        <circle cx={px(visible.length - 1)} cy={py(visible[visible.length - 1])} r={3} fill={C.accent} />
      )}
    </svg>
  );
}

function MACDChart({ hist }) {
  const W = 700, H = 70;
  const pad = { l: 50, r: 10, t: 8, b: 16 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const visible = hist.slice(-50).filter(v => v !== null);
  const maxV = Math.max(...visible.map(Math.abs)) || 1;
  const py = v => pad.t + iH / 2 - (v / (maxV * 2)) * iH;
  const bw = Math.max((iW / visible.length) * 0.7, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <line x1={pad.l} x2={W - pad.r} y1={py(0)} y2={py(0)} stroke={C.border} strokeWidth={1} />
      {visible.map((v, i) => {
        const x    = pad.l + (i / visible.length) * iW;
        const barY = v >= 0 ? py(v) : py(0);
        const barH = Math.abs(py(v) - py(0));
        return <rect key={i} x={x} y={barY} width={bw} height={Math.max(barH, 1)} fill={v >= 0 ? C.green : C.red} opacity={0.8} />;
      })}
    </svg>
  );
}

function TradeLog({ trades }) {
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 12, maxHeight: 160, overflowY: "auto",
    }}>
      <div style={{ color: C.subtext, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>ISTORIC SEMNALE</div>
      {trades.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Aștept primul semnal...</div>}
      {[...trades].reverse().map((t, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12,
        }}>
          <span style={{ color: C.subtext, fontSize: 10 }}>{t.time.toLocaleTimeString("ro-RO")}</span>
          <Badge label={t.type} color={t.type === "LONG" ? C.green : C.red} />
          <span style={{ color: C.text, fontFamily: "monospace" }}>${t.price.toLocaleString()}</span>
          <span style={{ color: t.pnl >= 0 ? C.green : C.red, fontFamily: "monospace" }}>
            {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── APP PRINCIPAL ────────────────────────────────────────────
export default function App() {
  const [candles,    setCandles]    = useState([]);
  const [signals,    setSignals]    = useState([]);
  const [trades,     setTrades]     = useState([]);
  const [position,   setPosition]   = useState(null);
  const [balance,    setBalance]    = useState(1000);
  const [status,     setStatus]     = useState("Se conectează...");
  const [lastUpdate, setLastUpdate] = useState(null);
  const posRef = useRef(position);
  posRef.current = position;

  // ── Încarcă lumânări reale ───────────────────────────────
  const loadCandles = async () => {
    try {
      const data = await fetchCandles();
      setCandles(data);
      setStatus("LIVE");
      setLastUpdate(new Date());
    } catch {
      setStatus("Eroare conexiune");
    }
  };

  useEffect(() => {
    loadCandles();
    const id = setInterval(loadCandles, 30000);
    return () => clearInterval(id);
  }, []);

  // ── WebSocket preț tick-by-tick ──────────────────────────
  useEffect(() => {
    let ws;
    const connect = () => {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${SYMBOL.toLowerCase()}@kline_${INTERVAL}`);
      ws.onmessage = evt => {
        const k = JSON.parse(evt.data).k;
        const updated = {
          time:  new Date(k.t),
          open:  parseFloat(k.o),
          high:  parseFloat(k.h),
          low:   parseFloat(k.l),
          close: parseFloat(k.c),
        };
        setCandles(prev => {
          if (!prev.length) return [updated];
          const last = prev[prev.length - 1];
          if (last.time.getTime() === updated.time.getTime()) {
            return [...prev.slice(0, -1), updated];
          }
          return [...prev.slice(-59), updated];
        });
        setLastUpdate(new Date());
      };
      ws.onerror = () => setStatus("WebSocket eroare");
      ws.onclose = () => setTimeout(connect, 3000);
    };
    connect();
    return () => ws && ws.close();
  }, []);

  // ── Indicatori ───────────────────────────────────────────
  const rsis         = candles.length > 20 ? calcRSI(candles) : [];
  const { hist }     = candles.length > 30 ? calcMACD(candles) : { hist: [] };
  const currentSignal = rsis.length && hist.length ? getSignal(rsis, hist) : "HOLD";
  const currentPrice  = candles[candles.length - 1]?.close || 0;
  const openPrice     = candles[candles.length - 1]?.open  || currentPrice;
  const priceChange   = openPrice ? +((currentPrice - openPrice) / openPrice * 100).toFixed(2) : 0;
  const currentRSI    = rsis[rsis.length - 1] || null;

  // ── Semnale pe grafic ────────────────────────────────────
  useEffect(() => {
    if (candles.length < 30) return;
    const sigs = candles.map((_, i) => {
      if (i < 30) return null;
      const r = calcRSI(candles.slice(0, i + 1));
      const { hist: h } = calcMACD(candles.slice(0, i + 1));
      return getSignal(r, h);
    });
    setSignals(sigs);
  }, [candles.length]);

  // ── Logica pozitie ───────────────────────────────────────
  useEffect(() => {
    if (!currentPrice) return;
    const pos = posRef.current;
    if (currentSignal === "LONG" && !pos) {
      setPosition({ side: "LONG", entry: currentPrice });
    } else if (currentSignal === "SHORT" && !pos) {
      setPosition({ side: "SHORT", entry: currentPrice });
    } else if (pos && currentSignal !== "HOLD" && currentSignal !== pos.side) {
      const pnl = pos.side === "LONG"
        ? (currentPrice - pos.entry) / pos.entry * 100 * 2
        : (pos.entry - currentPrice) / pos.entry * 100 * 2;
      setTrades(t => [...t, { type: pos.side, price: pos.entry, pnl: +pnl.toFixed(2), time: new Date() }]);
      setBalance(b => +(b * (1 + pnl / 100)).toFixed(2));
      setPosition(null);
    }
  }, [currentSignal, currentPrice]);

  const signalColor = currentSignal === "LONG" ? C.green : currentSignal === "SHORT" ? C.red : C.accent;
  const pnlLive = position
    ? +(position.side === "LONG"
        ? (currentPrice - position.entry) / position.entry * 100 * 2
        : (position.entry - currentPrice) / position.entry * 100 * 2
      ).toFixed(2)
    : null;
  const isLive = status === "LIVE";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Inter', system-ui, sans-serif", padding: "12px 8px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ background: C.accent, color: "#000", fontWeight: 800, fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>BINANCE</span>
            <span style={{ color: C.subtext, fontSize: 12 }}>BTC/USDT FUTURES</span>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: isLive ? C.green : C.red,
              display: "inline-block",
              animation: isLive ? "pulse 1.5s infinite" : "none",
            }} />
            <span style={{ color: isLive ? C.green : C.red, fontSize: 10 }}>{status}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: "monospace", fontSize: 30, fontWeight: 800, color: C.text, letterSpacing: -1 }}>
              {currentPrice ? `$${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: priceChange >= 0 ? C.green : C.red }}>
              {priceChange >= 0 ? "▲" : "▼"} {Math.abs(priceChange).toFixed(2)}%
            </span>
          </div>
          {lastUpdate && (
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
              {lastUpdate.toLocaleTimeString("ro-RO")}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: C.subtext, fontSize: 10, marginBottom: 4 }}>SEMNAL CURENT</div>
          <Badge label={currentSignal} color={signalColor} />
          <div style={{ color: C.subtext, fontSize: 10, marginTop: 4 }}>
            Leverage: <span style={{ color: C.accent }}>2x</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <StatBox label="CAPITAL" value={`$${balance.toLocaleString()}`}
          color={balance >= 1000 ? C.green : C.red}
          sub={`${((balance - 1000) / 10).toFixed(1)}% total`} />
        <StatBox label="RSI (14)"
          value={currentRSI ? currentRSI.toFixed(1) : "—"}
          color={currentRSI < 30 ? C.green : currentRSI > 70 ? C.red : C.text}
          sub={currentRSI ? (currentRSI < 30 ? "OVERSOLD" : currentRSI > 70 ? "OVERBOUGHT" : "NEUTRU") : ""} />
        <StatBox label="POZITIE"
          value={position ? position.side : "—"}
          color={position?.side === "LONG" ? C.green : position?.side === "SHORT" ? C.red : C.muted}
          sub={position ? `$${position.entry.toLocaleString()}` : "Nicio pozitie"} />
        <StatBox label="P&L LIVE"
          value={pnlLive !== null ? `${pnlLive > 0 ? "+" : ""}${pnlLive}%` : "—"}
          color={pnlLive > 0 ? C.green : pnlLive < 0 ? C.red : C.muted}
          sub={pnlLive !== null ? `$${(balance * Math.abs(pnlLive) / 100).toFixed(2)}` : ""} />
      </div>

      {/* Grafic lumânări */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 8px", marginBottom: 8 }}>
        <div style={{ color: C.subtext, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
          GRAFIC LUMÂNĂRI · 15M &nbsp;
          <span style={{ color: C.green }}>▲ LONG</span> &nbsp;
          <span style={{ color: C.red }}>▼ SHORT</span>
        </div>
        {candles.length > 0
          ? <CandleChart candles={candles} signals={signals} />
          : <div style={{ color: C.muted, textAlign: "center", padding: 40, fontSize: 12 }}>Se încarcă datele de la Binance...</div>
        }
      </div>

      {/* RSI */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px", marginBottom: 8 }}>
        <div style={{ color: C.subtext, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>RSI (14)</div>
        {rsis.length > 0 ? <RSIChart rsis={rsis} /> : <div style={{ color: C.muted, fontSize: 11, padding: 10 }}>Se calculează...</div>}
      </div>

      {/* MACD */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px", marginBottom: 12 }}>
        <div style={{ color: C.subtext, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>MACD HISTOGRAM</div>
        {hist.length > 0 ? <MACDChart hist={hist} /> : <div style={{ color: C.muted, fontSize: 11, padding: 10 }}>Se calculează...</div>}
      </div>

      <TradeLog trades={trades} />

      <div style={{ textAlign: "center", color: C.muted, fontSize: 10, marginTop: 12, letterSpacing: 1 }}>
        DATE REALE BINANCE · LEVERAGE 2x · SL 2% · TP 4%
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${C.panel}}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>
    </div>
  );
}
