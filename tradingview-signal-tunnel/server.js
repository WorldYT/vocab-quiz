#!/usr/bin/env node
/*
 * TradingView Signal Tunnel
 * -------------------------
 * A tiny, zero-dependency Node server that:
 *   1. Receives BUY/SELL alerts from TradingView (via webhook alerts).
 *   2. Stores every signal (with the time it arrived + the chart timeframe).
 *   3. Serves a live dashboard + JSON feed so another computer can watch them.
 *
 * You run this on the computer that has the data ("this computer"), then point
 * ngrok at it so "computer three" (or TradingView) can reach it over the internet.
 *
 * Run:   node server.js
 * Then:  ngrok http 8000
 *
 * Optional environment variables:
 *   PORT       - port to listen on (default 8000)
 *   TV_SECRET  - shared secret. If set, incoming webhooks must include the same
 *                value in the "secret" field of the JSON, or they are rejected.
 *                This stops random people who find your ngrok URL from injecting
 *                fake signals.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 8000;
const SECRET = process.env.TV_SECRET || '';
const DATA_FILE = path.join(__dirname, 'signals.json');
const MAX_SIGNALS = 5000; // keep memory/disk bounded

// ---------------------------------------------------------------------------
// Storage (in-memory + persisted to disk so past signals survive a restart)
// ---------------------------------------------------------------------------
let signals = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    signals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(signals)) signals = [];
  }
} catch (err) {
  console.error('Could not read existing signals.json, starting fresh:', err.message);
  signals = [];
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(signals.slice(-MAX_SIGNALS), null, 2));
  } catch (err) {
    console.error('Failed to write signals.json:', err.message);
  }
}

// Map TradingView's {{interval}} codes to friendly labels.
function prettyTimeframe(tf) {
  if (tf === undefined || tf === null || tf === '') return 'unknown';
  const raw = String(tf).trim();
  const map = {
    '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m', '45': '45m',
    '60': '1h', '120': '2h', '180': '3h', '240': '4h',
    '1D': '1D', 'D': '1D', '1W': '1W', 'W': '1W', '1M': '1M', 'M': '1M',
  };
  return map[raw] || raw;
}

function normalizeAction(action) {
  if (!action) return 'INFO';
  const a = String(action).trim().toUpperCase();
  if (['BUY', 'LONG', 'STRONGBUY', 'STRONG_BUY'].includes(a)) return 'BUY';
  if (['SELL', 'SHORT', 'STRONGSELL', 'STRONG_SELL', 'EXIT'].includes(a)) return 'SELL';
  return a;
}

// ---------------------------------------------------------------------------
// Live updates via Server-Sent Events (SSE)
// ---------------------------------------------------------------------------
const sseClients = new Set();

function broadcast(signal) {
  const payload = `data: ${JSON.stringify(signal)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) { /* client gone */ }
  }
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function handleWebhook(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1e6) req.destroy(); // 1MB hard cap
  });
  req.on('end', () => {
    // TradingView sends the alert "message" as the request body. People usually
    // put JSON in there, but it might arrive as text/plain. Try JSON, fall back
    // to treating the whole thing as a plain message.
    let data;
    try {
      data = JSON.parse(body);
    } catch (_) {
      data = { message: body.trim() };
    }

    if (SECRET) {
      if (!data || String(data.secret || '') !== SECRET) {
        console.warn('Rejected webhook: bad or missing secret');
        return sendJSON(res, 401, { ok: false, error: 'bad secret' });
      }
    }

    const signal = {
      id: `${Date.now()}-${Math.floor(signals.length + 1)}`,
      received_at: new Date().toISOString(),
      symbol: (data.symbol || data.ticker || 'BTCUSD').toString(),
      timeframe: prettyTimeframe(data.timeframe || data.interval),
      action: normalizeAction(data.action || data.signal || data.side),
      price: data.price !== undefined ? data.price : (data.close !== undefined ? data.close : null),
      bar_time: data.bar_time || data.time || null, // when the bar/candle closed on the chart
      message: data.message || data.comment || '',
      raw: data,
    };
    // strip secret so we never echo it back out to the dashboard
    if (signal.raw && typeof signal.raw === 'object') delete signal.raw.secret;

    signals.push(signal);
    if (signals.length > MAX_SIGNALS) signals = signals.slice(-MAX_SIGNALS);
    persist();
    broadcast(signal);

    console.log(`[${signal.received_at}] ${signal.action} ${signal.symbol} ${signal.timeframe} @ ${signal.price}`);
    sendJSON(res, 200, { ok: true, stored: signal.id });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // Webhook intake. Accept a few path spellings so it's forgiving.
  if (req.method === 'POST' && ['/tradingview', '/webhook', '/signal', '/hook'].includes(url.pathname)) {
    return handleWebhook(req, res);
  }

  // Full history as JSON (for computer three to poll programmatically).
  if (req.method === 'GET' && url.pathname === '/signals') {
    const tf = url.searchParams.get('timeframe');
    let out = signals;
    if (tf) out = signals.filter((s) => s.timeframe === tf);
    return sendJSON(res, 200, { ok: true, count: out.length, signals: out });
  }

  // Live stream of new signals (Server-Sent Events).
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 25000);
    req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJSON(res, 200, { ok: true, signals: signals.length, uptime: process.uptime() });
  }

  // The dashboard.
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(DASHBOARD_HTML);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found. Try / (dashboard), /signals (JSON), or POST /tradingview (webhook).');
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(' TradingView Signal Tunnel is running');
  console.log(`   Dashboard:     http://localhost:${PORT}/`);
  console.log(`   Webhook URL:   http://localhost:${PORT}/tradingview`);
  console.log(`   JSON feed:     http://localhost:${PORT}/signals`);
  console.log(`   Secret check:  ${SECRET ? 'ON' : 'OFF (set TV_SECRET to enable)'}`);
  console.log('');
  console.log(' Next: expose it with ->  ngrok http ' + PORT);
  console.log('====================================================');
});

// ---------------------------------------------------------------------------
// Dashboard HTML (kept inline so the whole thing is a single runnable file)
// ---------------------------------------------------------------------------
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bitcoin Buy/Sell Signals</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#0d1117; color:#e6edf3; }
  header { padding:16px 20px; border-bottom:1px solid #21262d; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  h1 { font-size:18px; margin:0; }
  .dot { width:10px; height:10px; border-radius:50%; background:#3fb950; display:inline-block; margin-right:6px; }
  .dot.off { background:#f85149; }
  .filters { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
  .filters button { background:#21262d; color:#e6edf3; border:1px solid #30363d; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px; }
  .filters button.active { background:#1f6feb; border-color:#1f6feb; }
  .stats { padding:10px 20px; font-size:13px; color:#8b949e; border-bottom:1px solid #21262d; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:10px 14px; border-bottom:1px solid #21262d; font-size:14px; white-space:nowrap; }
  th { color:#8b949e; font-weight:600; position:sticky; top:0; background:#0d1117; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  td.action { font-weight:700; }
  .BUY { color:#3fb950; }
  .SELL { color:#f85149; }
  .tf { background:#21262d; padding:2px 8px; border-radius:10px; font-size:12px; }
  .muted { color:#8b949e; }
  tr.new { animation: flash 1.2s ease-out; }
  @keyframes flash { from { background:#1f6feb44; } to { background:transparent; } }
  .empty { padding:40px 20px; color:#8b949e; }
  code { background:#161b22; padding:2px 6px; border-radius:4px; }
</style>
</head>
<body>
<header>
  <h1>📈 Bitcoin Buy / Sell Signals</h1>
  <span id="status"><span class="dot" id="dot"></span><span id="statusText">connecting…</span></span>
  <div class="filters" id="filters">
    <button data-tf="ALL" class="active">All</button>
    <button data-tf="30m">30m</button>
    <button data-tf="1h">1h</button>
    <button data-tf="4h">4h</button>
    <button data-tf="1D">1D</button>
  </div>
</header>
<div class="stats" id="stats">Loading…</div>
<table>
  <thead>
    <tr>
      <th>Received (your time)</th>
      <th>Action</th>
      <th>Symbol</th>
      <th>Timeframe</th>
      <th>Price</th>
      <th>Bar time</th>
      <th>Note</th>
    </tr>
  </thead>
  <tbody id="rows"></tbody>
</table>
<div class="empty" id="empty">No signals yet. Once a TradingView alert fires, it will appear here instantly.</div>

<script>
let all = [];
let filter = 'ALL';

function fmt(ts) {
  if (!ts) return '<span class="muted">—</span>';
  try { return new Date(ts).toLocaleString(); } catch(_) { return ts; }
}

function render() {
  const rows = document.getElementById('rows');
  const data = (filter === 'ALL' ? all : all.filter(s => s.timeframe === filter)).slice().reverse();
  document.getElementById('empty').style.display = data.length ? 'none' : 'block';
  rows.innerHTML = data.map(s => \`
    <tr>
      <td>\${fmt(s.received_at)}</td>
      <td class="action \${s.action}">\${s.action}</td>
      <td>\${s.symbol || ''}</td>
      <td><span class="tf">\${s.timeframe || '?'}</span></td>
      <td>\${s.price != null ? s.price : '<span class="muted">—</span>'}</td>
      <td class="muted">\${s.bar_time || '—'}</td>
      <td class="muted">\${(s.message || '').replace(/</g,'&lt;')}</td>
    </tr>\`).join('');
  const buys = all.filter(s => s.action === 'BUY').length;
  const sells = all.filter(s => s.action === 'SELL').length;
  document.getElementById('stats').innerHTML =
    \`<b>\${all.length}</b> signals &nbsp;•&nbsp; <span class="BUY">\${buys} buy</span> &nbsp;•&nbsp; <span class="SELL">\${sells} sell</span>\`;
}

document.getElementById('filters').addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') return;
  filter = e.target.dataset.tf;
  document.querySelectorAll('#filters button').forEach(b => b.classList.toggle('active', b === e.target));
  render();
});

function setStatus(on) {
  document.getElementById('dot').className = 'dot' + (on ? '' : ' off');
  document.getElementById('statusText').textContent = on ? 'live' : 'reconnecting…';
}

async function load() {
  try {
    const r = await fetch('/signals');
    const j = await r.json();
    all = j.signals || [];
    render();
  } catch (e) { /* ignore */ }
}

function connect() {
  const es = new EventSource('/events');
  es.onopen = () => setStatus(true);
  es.onerror = () => setStatus(false);
  es.onmessage = (ev) => {
    try {
      const s = JSON.parse(ev.data);
      all.push(s);
      render();
      const first = document.querySelector('#rows tr');
      if (first && (filter === 'ALL' || s.timeframe === filter)) first.classList.add('new');
    } catch(_) {}
  };
}

load().then(connect);
setInterval(load, 30000); // safety re-sync every 30s
</script>
</body>
</html>`;
