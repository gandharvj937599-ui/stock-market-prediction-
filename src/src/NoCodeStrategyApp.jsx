// NoCodeStrategyApp.jsx
// Single-file React component (default export) implementing a minimal website prototype
// for: (1) No-code strategy builder (form mode) and (2) Automated testing/replication
// - Tailwind CSS classes used for styling (ensure Tailwind is available in your project)
// - This is a frontend-only prototype: the backtesting is simulated in-browser using generated
//   historical price data. Replace simulation logic with API calls to your backtest service.
// Usage notes:
// 1. Create a React app (e.g., with Vite + React + Tailwind) and drop this file in src/.
// 2. Import and render <NoCodeStrategyApp /> in your App.jsx.
// 3. Hook the runBacktest() and scheduleJob() placeholders to backend endpoints for real runs.

import React, { useEffect, useMemo, useState } from "react";

// --- Utilities: simple indicator functions ---
function sma(values, window) {
  const res = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) res[i] = sum / window;
  }
  return res;
}

function ema(values, window) {
  const res = Array(values.length).fill(null);
  const k = 2 / (window + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      prev = values[0];
      res[i] = prev;
    } else {
      prev = values[i] * k + prev * (1 - k);
      res[i] = prev;
    }
  }
  return res;
}

// --- Generate synthetic historical OHLCV data (for demo) ---
function generateSampleData(days = 365) {
  const data = [];
  let price = 100;
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));
    const drift = (Math.sin(i / 10) + Math.random() * 0.5) * 0.2;
    price = Math.max(1, price * (1 + drift / 100));
    const open = price * (1 + (Math.random() - 0.5) * 0.01);
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.round(1000 + Math.random() * 2000);
    data.push({ date: date.toISOString().slice(0, 10), open, high, low, close, volume });
  }
  return data;
}

// --- Simple backtester: supports only buy/close rules for demo purposes ---
function runInBrowserBacktest(strategy, data, initialCapital = 10000) {
  // strategy: {name, rules: [{indicator, period, operator, threshold, action, sizePercent}], sizing}
  // data: array of {date, close}
  // returns trades, equitySeries
  const closes = data.map((d) => d.close);

  // compute indicators
  const indicators = {};
  // precompute SMA/EMA for unique periods
  const periods = Array.from(new Set(strategy.rules.map((r) => r.period || 14)));
  for (const p of periods) {
    indicators[`SMA_${p}`] = sma(closes, p);
    indicators[`EMA_${p}`] = ema(closes, p);
  }

  let position = 0;
  let cash = initialCapital;
  let equity = initialCapital;
  const equitySeries = [];
  const trades = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    // evaluate rules (simple: if any buy rule true and not in position -> buy; if any sell rule true and in position -> close)
    let buySignal = false;
    let sellSignal = false;
    for (const rule of strategy.rules) {
      const indKey = `${rule.indicator}_${rule.period}`;
      const indVal = indicators[indKey] ? indicators[indKey][i] : null;
      if (indVal === null || indVal === undefined) continue;
      const op = rule.operator;
      let cond = false;
      if (op === "<") cond = indVal < rule.threshold;
      if (op === ">") cond = indVal > rule.threshold;
      if (op === "crosses_up") {
        if (i === 0) cond = false;
        else {
          const prev = indicators[indKey][i - 1];
          cond = prev <= rule.threshold && indVal > rule.threshold;
        }
      }
      if (op === "crosses_down") {
        if (i === 0) cond = false;
        else {
          const prev = indicators[indKey][i - 1];
          cond = prev >= rule.threshold && indVal < rule.threshold;
        }
      }
      if (rule.action === "buy" && cond) buySignal = true;
      if (rule.action === "sell" && cond) sellSignal = true;
    }

    // simple execution at close price
    if (buySignal && position === 0) {
      const invest = (strategy.sizing.percentOfEquity / 100) * cash;
      const qty = invest / row.close;
      position = qty;
      cash -= qty * row.close;
      trades.push({ type: "BUY", date: row.date, price: row.close, qty });
    }
    if (sellSignal && position > 0) {
      cash += position * row.close;
      trades.push({ type: "SELL", date: row.date, price: row.close, qty: position });
      position = 0;
    }

    equity = cash + position * row.close;
    equitySeries.push({ date: row.date, equity });
  }

  const returns = equitySeries.map((e) => e.equity);
  const cumulativeReturn = ((returns[returns.length - 1] - returns[0]) / returns[0]) * 100;

  // max drawdown simple
  let peak = -Infinity;
  let maxDD = 0;
  for (const v of returns) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    trades,
    equitySeries,
    summary: { startEquity: returns[0], endEquity: returns[returns.length - 1], cumulativeReturn, maxDrawdownPercent: maxDD * 100 },
  };
}

// --- Simple SVG line chart for equity series ---
function EquityChart({ series }) {
  if (!series || series.length === 0) return <div className="text-sm text-gray-500">No data</div>;
  const values = series.map((s) => s.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 600,
    h = 120,
    padding = 8;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - padding * 2) + padding;
      const y = h - ((v - min) / (max - min || 1)) * (h - padding * 2) - padding;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="bg-white rounded shadow-sm">
      <polyline fill="none" stroke="#0ea5a4" strokeWidth="2" points={points} />
    </svg>
  );
}

// --- Main App ---
export default function NoCodeStrategyApp() {
  const [data] = useState(() => generateSampleData(365));

  // Strategy builder state
  const [strategyName, setStrategyName] = useState("My First Strategy");
  const [rules, setRules] = useState([
    { id: 1, indicator: "SMA", period: 14, operator: "<", threshold: 100, action: "buy" },
    { id: 2, indicator: "SMA", period: 14, operator: ">", threshold: 110, action: "sell" },
  ]);
  const [sizing, setSizing] = useState({ percentOfEquity: 20 });
  const [results, setResults] = useState(null);
  const [runs, setRuns] = useState(() => JSON.parse(localStorage.getItem("runs_v1") || "[]"));
  const [jobs, setJobs] = useState(() => JSON.parse(localStorage.getItem("jobs_v1") || "[]"));

  useEffect(() => {
    localStorage.setItem("runs_v1", JSON.stringify(runs));
  }, [runs]);
  useEffect(() => {
    localStorage.setItem("jobs_v1", JSON.stringify(jobs));
  }, [jobs]);

  function addRule() {
    const id = Math.max(0, ...rules.map((r) => r.id)) + 1;
    setRules([...rules, { id, indicator: "SMA", period: 14, operator: "<", threshold: 100, action: "buy" }]);
  }
  function updateRule(id, patch) {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRule(id) {
    setRules(rules.filter((r) => r.id !== id));
  }

  function saveStrategy() {
    const obj = { name: strategyName, rules, sizing, createdAt: new Date().toISOString() };
    const stored = JSON.parse(localStorage.getItem("strategies_v1") || "[]");
    stored.push(obj);
    localStorage.setItem("strategies_v1", JSON.stringify(stored));
    alert("Strategy saved locally. Connect to backend to persist in DB.");
  }

  function runBacktest() {
    const strategy = { name: strategyName, rules, sizing };
    const out = runInBrowserBacktest(strategy, data, 10000);
    const run = { id: Date.now(), strategy, out, runAt: new Date().toISOString() };
    setResults(run);
    setRuns([run, ...runs].slice(0, 20));
  }

  function scheduleJob(cronExpr) {
    // Demo: schedule job stored locally. Replace with backend scheduler / Airflow / cloud function.
    const job = { id: Date.now(), name: strategyName, cron: cronExpr, createdAt: new Date().toISOString() };
    setJobs([job, ...jobs]);
    alert("Scheduled locally. Hook this to an orchestrator for real runs.");
  }

  const summary = useMemo(() => {
    if (!results) return null;
    return results.out.summary;
  }, [results]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6">
      <header className="max-w-6xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">No‑Code Strategy Builder & Auto‑Tester</h1>
          <div className="text-sm text-gray-600">Demo prototype • Frontend-only</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
        {/* Left: Builder */}
        <section className="col-span-5 bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Strategy Builder (Form Mode)</h2>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700">Strategy Name</label>
            <input value={strategyName} onChange={(e) => setStrategyName(e.target.value)} className="mt-1 block w-full border rounded p-2" />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium">Sizing (% of equity)</label>
            <input type="number" value={sizing.percentOfEquity} onChange={(e) => setSizing({ percentOfEquity: Number(e.target.value) })} className="mt-1 block w-1/3 border rounded p-2" />
          </div>

          <div className="space-y-3">
            {rules.map((r) => (
              <div key={r.id} className="border rounded p-2 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Rule #{r.id}</div>
                  <button onClick={() => removeRule(r.id)} className="text-red-500 text-sm">Remove</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select value={r.indicator} onChange={(e) => updateRule(r.id, { indicator: e.target.value })} className="border rounded p-1">
                    <option value="SMA">SMA</option>
                    <option value="EMA">EMA</option>
                  </select>
                  <input type="number" value={r.period} onChange={(e) => updateRule(r.id, { period: Number(e.target.value) })} className="border rounded p-1" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <select value={r.operator} onChange={(e) => updateRule(r.id, { operator: e.target.value })} className="border rounded p-1">
                    <option value="<">&lt;</option>
                    <option value=">">&gt;</option>
                    <option value="crosses_up">crosses_up</option>
                    <option value="crosses_down">crosses_down</option>
                  </select>
                  <input type="number" value={r.threshold} onChange={(e) => updateRule(r.id, { threshold: Number(e.target.value) })} className="border rounded p-1" />
                  <select value={r.action} onChange={(e) => updateRule(r.id, { action: e.target.value })} className="border rounded p-1">
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={addRule} className="px-3 py-1 bg-sky-500 text-white rounded">+ Add rule</button>
            <button onClick={saveStrategy} className="px-3 py-1 bg-emerald-600 text-white rounded">Save</button>
            <button onClick={runBacktest} className="px-3 py-1 bg-indigo-600 text-white rounded">Run Backtest</button>
          </div>

          <div className="mt-4 text-xs text-gray-500">Tip: This demo runs a simple in-browser simulator. Connect to a backend for robust data & realistic execution models.</div>
        </section>

        {/* Middle: Backtest results */}
        <section className="col-span-4 bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Backtest & Results</h2>

          {results ? (
            <>
              <div className="mb-2 text-sm font-medium">Strategy: {results.strategy.name}</div>
              <div className="mb-3"><EquityChart series={results.out.equitySeries} /></div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 border rounded">
                  <div className="text-xs text-gray-500">Start Equity</div>
                  <div className="font-semibold">{results.out.summary.startEquity.toFixed(2)}</div>
                </div>
                <div className="p-2 border rounded">
                  <div className="text-xs text-gray-500">End Equity</div>
                  <div className="font-semibold">{results.out.summary.endEquity.toFixed(2)}</div>
                </div>
                <div className="p-2 border rounded">
                  <div className="text-xs text-gray-500">Return</div>
                  <div className="font-semibold">{results.out.summary.cumulativeReturn.toFixed(2)}%</div>
                </div>
                <div className="p-2 border rounded">
                  <div className="text-xs text-gray-500">Max Drawdown</div>
                  <div className="font-semibold">{results.out.summary.maxDrawdownPercent.toFixed(2)}%</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-sm font-medium">Trades ({results.out.trades.length})</div>
                <div className="mt-2 max-h-32 overflow-auto text-xs border rounded p-2">
                  {results.out.trades.length === 0 ? (
                    <div className="text-gray-500">No trades executed.</div>
                  ) : (
                    results.out.trades.map((t, idx) => (
                      <div key={idx} className="flex justify-between py-1 border-b">
                        <div>{t.type} {t.qty.toFixed(2)} @ {t.price.toFixed(2)}</div>
                        <div className="text-gray-500">{t.date}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">Run a backtest to see results here.</div>
          )}

          <div className="mt-4 border-t pt-3">
            <div className="text-sm font-medium">Past Runs</div>
            <div className="mt-2 space-y-2 text-xs max-h-40 overflow-auto">
              {runs.length === 0 && <div className="text-gray-500">No previous runs</div>}
              {runs.map((r) => (
                <div key={r.id} className="p-2 border rounded flex justify-between items-center">
                  <div>
                    <div className="font-medium">{r.strategy.name}</div>
                    <div className="text-gray-500">{new Date(r.runAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <button onClick={() => { setResults(r); }} className="px-2 py-1 bg-slate-200 rounded text-xs">View</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Automation & Jobs */}
        <section className="col-span-3 bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">Automation & Replication</h2>
          <div className="text-sm mb-2">Schedule automated re-runs of this strategy (demo stores jobs locally).</div>
          <div className="mb-2">
            <label className="block text-xs">Cron expression (simple)</label>
            <input placeholder="e.g., daily" id="cron" className="mt-1 block w-full border rounded p-2" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => scheduleJob(document.getElementById("cron").value || "daily")} className="px-3 py-1 bg-yellow-500 text-white rounded">Schedule</button>
            <button onClick={() => {
              // Quick replication: re-run with same data snapshot
              if (!results) return alert("Run a backtest first to create a snapshot to replicate.");
              const replicated = { ...results, id: Date.now(), runAt: new Date().toISOString() };
              setRuns([replicated, ...runs].slice(0, 20));
              alert("Replicated run locally (demo). Hook to backend for true replication.");
            }} className="px-3 py-1 bg-emerald-600 text-white rounded">Replicate</button>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium">Scheduled Jobs</div>
            <div className="mt-2 text-xs max-h-48 overflow-auto">
              {jobs.length === 0 && <div className="text-gray-500">No scheduled jobs</div>}
              {jobs.map((j) => (
                <div key={j.id} className="p-2 border rounded flex justify-between items-center">
                  <div>
                    <div className="font-medium">{j.name}</div>
                    <div className="text-gray-500">{j.cron}</div>
                  </div>
                  <div>
                    <button onClick={() => { setJobs(jobs.filter((x) => x.id !== j.id)); }} className="px-2 py-1 bg-red-100 rounded text-xs">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-500">Note: For production, connect scheduling to a backend orchestrator (Airflow, Cloud Scheduler) and persist jobs in DB.</div>
        </section>

        {/* Footer: quick data preview */}
        <section className="col-span-12 mt-4">
          <div className="bg-white rounded p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Sample Data (last 5 rows)</div>
              <div className="text-xs text-gray-500">Synthetic demo data</div>
            </div>
            <div className="mt-2 overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left"><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead>
                <tbody>
                  {data.slice(-5).map((d, i) => (
                    <tr key={i}><td>{d.date}</td><td>{d.open.toFixed(2)}</td><td>{d.high.toFixed(2)}</td><td>{d.low.toFixed(2)}</td><td>{d.close.toFixed(2)}</td><td>{d.volume}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto text-center text-xs text-gray-500 mt-6">Prototype • Replace simulation with backend backtester, feature store & scheduler for production.</footer>
    </div>
  );
}
