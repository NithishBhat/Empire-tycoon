# 🐉 Empire Tycoon

A browser remake of the *Business Empire: RichMan* mechanics — with one twist: **no tap-to-earn clicker. You start with $100,000** and grow it through investments only.

## Run it

```
npm install
npm run dev      # http://localhost:5199
npm run build    # production build to dist/
```

## What's in the game

- **Idle businesses** — Small Shop, Large Shop Chain, Small/Large Factory, Restaurant. Level them up (income ×1.22/level, cost ×1.32/level, max lvl 50).
- **Fleet businesses** — Taxi and Shipping. Vehicles earn per hour and die when their mileage runs out; expand garage slots in packs of 5/10/20.
- **Construction** — hire workers, buy materials, run timed projects, collect payouts manually.
- **Car Dealership** — buy a random used car, pay 22% repair, wait, flip at ×1.65.
- **Bank** — set deposit vs credit interest rates and earn the spread; spreads wider than 6 points scare depositors away (income ×0.2). Profit accrues to a vault you collect. Vault gates the Holding merger.
- **IT Company** — devs cost $1,500/hr *always*; profitable only when projects run continuously. Sellable at a 30% tax loss when it bleeds.
- **Football Club** — sign players (+2 rating each, cost ×1.35 per signing), sponsor deals ×1.6 income for 48h.
- **Oil & Gas** — $50M entry, biggest earner; each 24h supply contract compounds income ×1.11 forever.
- **Stocks** — 10 companies, each price mean-reverts inside a fixed min/max band (buy the min, sell the max ≈ 50%/cycle). Dividends pay hourly; buy 100% of a company's limited shares to own it and collect its profit.
- **Crypto** — 5 coins, no dividends, big swings (Pupcoin = max volatility, Aurum = max market cap).
- **Real estate** — 8 properties, hourly rent, 5 improvement tiers (+25% rent each), zero upkeep, 15% sales tax on resale.
- **Luxury** — cars → private islands. Zero income, resells at 40% (NFT resells at 100%).
- **Mergers** — Clothing Brand ($3M + shop chain lvl 10 + factory lvl 20 + 8 vans + 2 trucks → $421,300/hr), Space Agency ($450M), Holding Company ($500M + $420M vault + $40M portfolio).
- **Achievements** — net-worth milestones: $1M, $2M, $10M, $100M, $1B, with a progress bar to the next one.
- **Consumer economy** — every idle business has a drifting demand index; you set the price level against it (or hire a manager to auto-price for 6% of revenue), and marketing campaigns spike demand.
- **Fleet operations** — assign City/Highway/Heavy routes (income vs wear vs fuel), watch the global fuel price, and upgrade the workshop to cut vehicle wear.
- **Crew progression** — construction crews gain +3% payout per finished project; IT teams train seniority for +8% per level.
- **Offline earnings** — the empire keeps earning while the tab is closed (capped at 24 game-hours), auto-saved to localStorage every 5 s.

Time scale: **1 game hour = 10 real seconds.** Markets, demand, and fuel prices move every 5 seconds. Money has no cap — the formatter goes up to quadrillions.

- **Trading floor** — candlestick charts (real OHLC) with zoomable ranges (12H / 1D / 3D / 1W / MAX, coarser ranges merge candles), avg-cost/entry/liquidation overlays, and **leverage trading**: long/short 2–10× with margin, fees, and wick-based liquidations.
- **Ambient score** — an original generative dark-ambient soundtrack synthesized live with the Web Audio API (low drones, breathing filter, sparse minor-pentatonic notes, deep sub pulses). Toggle with the speaker button; preference persists.
- **Engine test suite** — `npm run simtest` runs ~130 assertions: candle integrity, band clamps, hostile-action guards, accounting exactness, liquidation invariants, 24h offline mega-ticks, and 10^18-dollar survival.

Built with Vite + React. All data in `src/game/data.js`, simulation in `src/game/engine.js`.
"# Empire-tycoon" 
