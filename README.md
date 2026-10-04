# Who Created the 2015 Bitcoin Puzzle?

Landing page on the 2015 Bitcoin Puzzle Transaction (solve count, live USD prize pool, how to attempt it, and an in-browser brute-force cracker), a sourced investigative dossier on the creator, and a full ledger of all 256 puzzle addresses with key ranges and solve status.

## Layout

- `index.html` – page markup (puzzle landing page, case file, puzzle ledger, web cracker)
- `css/styles.css` – all styling, light and dark
- `js/addresses.js` – the 256 puzzle addresses, in lot order
- `js/crypto.js` – self-contained SHA-256, RIPEMD-160, secp256k1 and Base58Check (shared by page and worker)
- `js/cracker-worker.js` – Web Worker that walks a key interval with batched EC point addition; reports hits, progress, benchmark results and per-lane positions on stop
- `js/cracker.js` – cracker tab: grouped puzzle picker with quick picks, strategy, thread count, 3-second benchmark, stop/resume that keeps every thread's position, live stats and per-thread view, event log, verified result card with copy buttons
- `js/home.js` – landing page stats, prize pool, odds table
- `js/puzzle-data.js` – solve dates, open balances, key-range math, lot state helpers
- `js/price.js` – live BTC/USD price (CoinGecko, then mempool.space as fallback)
- `js/modal.js` – per-puzzle detail popup
- `js/ledger.js` – ledger table, filters, collapsed retired lots (#161–256), clickable rows
- `js/app.js` – page wiring: tabs, section rail
- `js/donate.js` – copy-to-clipboard for the BTC tip address in the header
- `og-image.png`, `favicon.svg`, `robots.txt`, `sitemap.xml` – social card, icon, crawler files

SEO: `index.html` carries full Open Graph and Twitter `summary_large_image` tags plus JSON-LD (WebSite, Person, WebPage, SoftwareApplication, FAQPage). The canonical URL is set to `https://bitcoin-puzzle-dossier.vercel.app/`; change it in the `<head>`, `robots.txt` and `sitemap.xml` if the site moves to a custom domain.

The web cracker runs entirely on the visitor's device and never sends keys anywhere. On already-solved lots (#1–#25 or so) it finds the real private key in seconds, which is the easiest way to confirm the engine is genuine.

No build step. Serve the folder statically (for example `python3 -m http.server`). Built with Muse. Deploy on Vercel by importing this repo (framework preset: Other, no build command, output directory: root).
