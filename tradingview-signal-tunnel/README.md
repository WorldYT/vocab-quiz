# TradingView Signal Tunnel

Feed Bitcoin **buy/sell signals** from TradingView (across the 30m, 1h, 4h, and
1D charts) to another computer ("computer three"), live, with the time each
signal fired.

```
TradingView alerts ──webhook──▶  server.js (this computer)  ──ngrok──▶  internet  ──▶  Computer Three
   (one per timeframe)            stores + shows them                    public URL       opens the page
```

## ⚠️ Read this first — what is and isn't possible

- **The tunnel runs on *your* computer, not in the cloud.** ngrok exposes a
  program running on this PC to the internet. So you start the server and ngrok
  here, on the machine that has TradingView. (It's two commands — see below.)
- **"Past" signals can't be back-filled.** TradingView only *sends* a signal at
  the moment it fires. There's no way to pull the markers already drawn on your
  chart. This tool logs every signal from the moment it's running, and saves
  them to `signals.json` so they survive a restart.
- **"Future" signals = every new one, in real time.** As soon as an alert fires
  on any timeframe, it shows up on computer three within a second.
- **TradingView webhooks require a paid plan** (Essential or higher). The free
  plan cannot send webhook alerts. This is the one thing only you can confirm.

---

## Step 1 — Start the server (on this computer)

You need [Node.js](https://nodejs.org) installed (any recent version). Then:

```bash
cd tradingview-signal-tunnel

# Pick a secret password so nobody else can inject fake signals:
#   macOS / Linux:
TV_SECRET=pick-a-long-password node server.js
#   Windows PowerShell:
$env:TV_SECRET="pick-a-long-password"; node server.js
```

You'll see:

```
 Dashboard:     http://localhost:8000/
 Webhook URL:   http://localhost:8000/tradingview
```

Open <http://localhost:8000/> in your browser — that's the live dashboard.

## Step 2 — Open the tunnel with ngrok (on this computer)

You're already logged into ngrok. Grab your authtoken from the dashboard
(sidebar → **Your Authtoken**), then in a **second** terminal:

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE   # only needed once, ever
ngrok http 8000
```

ngrok prints a public URL like:

```
Forwarding   https://a1b2-c3d4.ngrok-free.app -> http://localhost:8000
```

That `https://a1b2-c3d4.ngrok-free.app` is your public address. **Keep both
terminals open** — closing them takes the tunnel down.

## Step 3 — Point TradingView at it (one alert per timeframe)

For each chart you care about (30m, 1h, 4h, 1D):

1. Open the BTC chart on that timeframe with your buy/sell indicator on it.
2. Click the indicator's **⋯ → Add alert** (or the top **Alert** button).
3. Under **Notifications**, tick **Webhook URL** and paste:
   `https://a1b2-c3d4.ngrok-free.app/tradingview`
4. In the alert **Message** box, paste this (change the secret to match Step 1):

   **Buy alert:**
   ```json
   {"secret":"pick-a-long-password","symbol":"{{ticker}}","timeframe":"{{interval}}","action":"BUY","price":{{close}},"bar_time":"{{time}}"}
   ```
   **Sell alert:**
   ```json
   {"secret":"pick-a-long-password","symbol":"{{ticker}}","timeframe":"{{interval}}","action":"SELL","price":{{close}},"bar_time":"{{time}}"}
   ```

   The `{{interval}}` placeholder automatically fills in the timeframe (30, 60,
   240, 1D), so each alert is tagged with the chart it came from.

   > Using a **strategy** instead of a buy/sell indicator? Use one alert with
   > `"action":"{{strategy.order.action}}"` and `"price":{{strategy.order.price}}`.

5. Set **Trigger = Once Per Bar Close** (recommended) and **Expiration = Open-ended**.
6. Repeat for every timeframe. More timeframes = more alerts.

## Step 4 — Connect computer three

On computer three, just open the ngrok URL in any browser:

```
https://a1b2-c3d4.ngrok-free.app/
```

It shows a live table of every buy/sell signal — action, symbol, timeframe,
price, and the time it arrived — updating the instant a new one fires. Filter
buttons at the top switch between 30m / 1h / 4h / 1D / All.

> First visit to a free ngrok URL shows a one-time "Visit Site" warning page —
> click through it once.

---

## For developers / automation on computer three

If computer three should *consume* the signals in code rather than watch a page:

| Endpoint | What it gives you |
| --- | --- |
| `GET /signals` | Full JSON history. Add `?timeframe=4h` to filter. |
| `GET /events`  | Server-Sent Events stream — pushes each new signal live. |
| `GET /health`  | `{ ok, signals, uptime }` for monitoring. |
| `POST /tradingview` | Webhook intake (also `/webhook`, `/signal`, `/hook`). |

Example — live stream from the command line:

```bash
curl -N https://a1b2-c3d4.ngrok-free.app/events
```

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8000` | Port the server listens on (match your `ngrok http` port). |
| `TV_SECRET` | _(off)_ | If set, webhooks must include the same value in their `secret` field, or they're rejected. **Strongly recommended** since the URL is public. |

## Troubleshooting

- **Nothing shows up:** confirm the alert actually fired (TradingView → Alerts
  log), and that the webhook URL ends in `/tradingview`. Watch the server
  terminal — it logs every accepted signal and every rejected one.
- **`bad secret` in the server log:** the `secret` in the alert Message doesn't
  match your `TV_SECRET`. Make them identical.
- **ngrok URL changed:** free ngrok gives a new URL each restart. Update the
  webhook URL in your alerts, or reserve a static domain in the ngrok dashboard.
- **Want it always-on?** Keep this PC awake, or move `server.js` to a small
  cloud server and skip ngrok entirely (point the alerts straight at it).
