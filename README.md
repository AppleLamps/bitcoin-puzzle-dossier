# Bitcoin Puzzle Dossier

A research-driven, browser-based companion to the 2015 Bitcoin Puzzle Transaction. This project brings together the historical context, live solve status, full ledger of all 256 puzzle addresses, and a locally running brute-force cracker that verifies candidate keys without sending anything off-device.

## Overview

The 2015 Bitcoin Puzzle Transaction remains one of the most recognizable private-key puzzles in Bitcoin history. This site presents:

- the puzzle mechanics and how each puzzle’s keyspace is defined
- live solve tracking and the current prize pool
- the complete ledger of all puzzle addresses and key ranges
- a sourced dossier investigating the likely creator and historical evidence
- a browser-based solver that can test keys locally in the visitor’s own browser

## Key features

- Live BTC/USD prize pool and unsolved-lot tracking
- Full 256-address ledger with filters, puzzle metadata, and clickable rows
- Dedicated case-file section covering the creator investigation and leading theories
- In-browser cryptographic engine using a self-contained secp256k1 implementation
- Privacy-preserving operation: the web cracker runs entirely on the user’s device

## Project structure

- `index.html` – application shell, page sections, and SEO metadata
- `css/styles.css` – all styling, including light and dark themes
- `js/addresses.js` – the 256 puzzle addresses in puzzle order
- `js/crypto.js` – self-contained SHA-256, RIPEMD-160, secp256k1, and Base58Check logic used by the app and worker
- `js/cracker-worker.js` – worker that iterates key intervals and reports progress and hits
- `js/cracker.js` – interactive cracking UI with strategy controls, stats, event logging, and result verification
- `js/home.js` – landing-page stats, odds table, and prize-pool logic
- `js/puzzle-data.js` – key-range math, puzzle state helpers, and solve metadata
- `js/price.js` – live BTC/USD pricing with fallback providers
- `js/modal.js` – per-lot detail popup
- `js/ledger.js` – ledger table, filters, and collapsed retired-lot handling
- `js/app.js` – tab navigation and page wiring
- `js/donate.js` – copy-to-clipboard donation action
- `og-image.png`, `favicon.svg`, `robots.txt`, `sitemap.xml` – static assets and SEO files

## Local development

This project is a static site with no build pipeline.

1. Clone the repository.
2. From the project root, serve the files locally:

   `python3 -m http.server 8000`

3. Open `http://localhost:8000/` in a browser.

The web cracker performs all key generation and validation locally; it does not transmit keys to any backend.

## Deployment

This site can be deployed as a static application.

- Vercel: import the repository, select the framework preset `Other`, leave the build command blank, and set the output directory to the project root.
- If you move the site to a custom domain, update the canonical URL, `robots.txt`, and `sitemap.xml` to match the new host.

## Notes

The web cracker is designed to be trustworthy and transparent. On already-solved puzzles, it can usually recover the real private key within seconds, which provides a straightforward check that the implementation is working as expected.
