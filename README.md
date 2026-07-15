# 🐉 Empire Tycoon

A browser remake of the *Business Empire: RichMan* mechanics — with one twist: **no tap-to-earn clicker. You start with $100,000** and grow it through businesses, markets, and real estate alone.

## Run it

```
npm install
npm run dev      # http://localhost:5199
npm run build    # production build to dist/
npm run simtest  # engine test suite
```

Time scale: **1 game hour = 10 real seconds.** Markets, demand, and fuel prices move every 5 seconds. Money has no cap — the formatter scales K → M → B → T → Q → Qi → Sx (up to sextillions). State auto-saves to localStorage every 5 s.

## Businesses

- **Idle businesses** — Small Shop, Large Shop Chain, Small/Large Factory, Restaurant. Level them up (income ×1.22/level, cost ×1.32/level; the cap is effectively uncapped at 999).
- **Fleet businesses** — Taxi and Shipping. Vehicles earn per hour and die when their mileage runs out; expand garage slots in packs of 5/10/20.
- **Construction** — hire workers, buy materials, run timed projects, collect payouts manually.
- **Car Dealership** — buy a random used car, pay 22% repair, wait, flip at ×1.65.
- **Bank** — set deposit vs credit interest rates and earn the spread; spreads wider than 6 points scare depositors away. Profit accrues to a vault you collect; the vault gates the Holding merger.
- **IT Company** — devs cost $1,500/hr *always*; profitable only when projects run continuously. Sellable at a 30% tax loss when it bleeds.
- **Football Club** — sign players (+2 rating each, cost ×1.35 per signing), sponsor deals ×1.6 income for 48h.
- **Oil & Gas** — $50M entry, biggest earner; each 24h supply contract compounds income ×1.11 forever.
- **Consumer economy** — every idle business has a drifting demand index; you set the price level against it (or hire a manager to auto-price for 6% of revenue), and marketing campaigns spike demand.
- **Fleet operations** — assign City/Highway/Heavy routes (income vs wear vs fuel), watch the global fuel price, and upgrade the workshop to cut vehicle wear.
- **Crew progression** — construction crews gain +3% payout per finished project; IT teams train seniority for +8% per level.

## Markets — the trading terminal

A Binance-style desktop terminal: a market list on the left, then a price header (pair · large live price · 24h high/low), a candlestick chart beside a live **order book** with gradient depth bars, and a full order-entry rail below. On narrow screens the chart/book become a tab strip and everything stacks. Numbers are tabular/monospace and right-aligned; the price flashes green/red on each tick.

- **Order entry** — a Buy/Sell toggle, **Market / Limit** order types, an amount field with 25/50/75/100% quick buttons, a live cost + slippage readout, and a big submit button (plus company buyout for stocks).
- **Limit orders** — resting buy/sell limits that fill automatically when the market reaches your price (checked against the per-step candle wicks). Click any order-book row to set the price; open orders show on the chart as overlay lines and in a cancellable list.
- **Stocks** — 10 companies, each price mean-reverts inside a fixed min/max band (buy the min, sell the max ≈ 50%/cycle). Dividends pay hourly; buy 100% of a company's limited shares to own it and collect its profit.
- **Crypto** — 20 coins, no dividends, each with a distinct personality (blue-chip slow trends, momentum riders, rubber-band reverters, chaotic degens…). Big swings, all band-clamped so they're wild but not exploitable.
- **Token launches** — a rug-pull meta-game: unaudited tokens launch periodically, get shilled by a random influencer, then resolve — **78% rug** (−97%, then delist) or **22% moon** (4–10×, permanent listing). Shorting the shill is the smart play.
- **Market cap · liquidity · risk** — every asset shows market cap, shares/supply, order-book depth, and a LOW/MED/HIGH/DEGEN risk tag. Trades slip against depth and shove the price, so exiting a big bag in a thin market genuinely costs you (shown live as "exit impact").
- **Charts** — candlestick or line, with zoomable ranges (12H / 1D / 3D / 1W / MAX; coarser ranges merge candles), auto-scaled y-axis, and avg-cost / entry / liquidation / limit-order overlays.
- **Leverage** — long/short 2–10× with margin, a 0.3% open fee, and wick-based liquidations.

## Property & wealth

- **Real estate** — 8 properties, hourly rent, 5 improvement tiers (+25% rent each), zero upkeep, 15% sales tax on resale.
- **Luxury** — cars → private islands. Zero income, resells at 40% (NFT resells at 100%) — the endgame flex.
- **Mergers** — Clothing Brand ($3M + shop chain lvl 10 + factory lvl 20 + 8 vans + 2 trucks → $421,300/hr), Space Agency ($450M), Holding Company ($500M + $420M vault + $40M portfolio).
- **Finances tab** — net-worth breakdown, income by source, open-holdings unrealised P/L, and a lifetime money trail (realised trading P/L, dividends, rent, fees/slippage, liquidation losses).
- **Achievements** — net-worth milestones ($1M, $2M, $10M, $100M, $1B), each with a live progress bar.

## Design & UX

The interface is built on a set of game-UX and conversion-psychology principles:

- **Responsive layout** — a fixed **bottom navigation bar** on phones/tablets (≤900px; icons + labels, 48px tap targets, safe-area inset, active-state indicator, tap feedback) and icon top-tabs on desktop. Verified with no horizontal overflow down to 375px.
- **Goal gradient** — an always-visible milestone strip shows log-scale progress to your next net-worth achievement, with a head start so it's *never* 0%. Every achievement tier shows a climbable progress bar.
- **Loss aversion & contrast** — owned businesses flag "+$X/hr upgrade ready" when you can afford an upgrade; upgrade buttons lead with the income *gain* anchored against the cost.
- **Affordability signals** — unaffordable buys are dimmed; the moment you can afford one, its button glows and gently pulses green.
- **Social proof** — bestseller / popular / top-earner badges and specific founder counts in the shop; an honest 🔥 trending tag on market movers (from real price action).
- **Offline progress modal** — a clear pop-up on return breaking down time away, total earned, and the average rate (offline earnings capped at 24 game-hours).
- **Feedback & micro-interactions** — animated count-up cash hero, floating "+$X" income particles, button hover/active/disabled states, input focus rings, notification toasts, and a bell/notification center that deep-links to the relevant asset.
- **Resource bar** — cash hero locked to the top with ⚡ income/hr and 💎 net worth, kept to three figures to avoid overload.

## Audio

A shuffled background playlist of royalty-free tracks (Pixabay Content License — free for commercial use). If the audio files are missing or fail, an **original generative dark-ambient synth** (Web Audio API — drones, breathing filter, sparse minor-pentatonic notes, sub pulses) takes over as a fallback. Toggle + volume slider in the top bar; preference persists.

## Engine test suite

`npm run simtest` runs 130+ assertions: candle integrity, band clamps, hostile-action guards, accounting exactness, liquidation invariants, token-lifecycle resolution, 24h offline mega-ticks, and 10¹⁸-dollar survival.

---

Built with Vite + React. All static data lives in `src/game/data.js`; the simulation is a pure reducer in `src/game/engine.js`; UI components are in `src/components/`.
