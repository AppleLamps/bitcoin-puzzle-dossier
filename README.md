# Who Created the 2015 Bitcoin Puzzle?

Sourced investigative dossier on the creator of the 2015 Bitcoin Puzzle Transaction, plus a full ledger of all 256 puzzle addresses with key ranges and solve status.

## Layout

- `index.html` – page markup (case file + puzzle ledger)
- `css/styles.css` – all styling, light and dark
- `js/addresses.js` – the 256 puzzle addresses, in lot order
- `js/puzzle-data.js` – solve dates, open balances, key-range math, lot state helpers
- `js/price.js` – live BTC/USD price (CoinGecko, then mempool.space as fallback)
- `js/modal.js` – per-puzzle detail popup
- `js/ledger.js` – ledger table, filters, collapsed retired lots (#161–256), clickable rows
- `js/app.js` – page wiring: tabs, section rail, landing bounty tile

No build step. Serve the folder statically (for example `python3 -m http.server`). Built with Muse. Deploy on Vercel by importing this repo (framework preset: Other, no build command, output directory: root).
