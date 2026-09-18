# STARFORGE — La Forja Estelar

Casino game entry for **Chain Jam** (deadline 2026-09-20). A scatter-pay 6×5 cosmic-forge slot:
forge minerals, trigger the supernova, double or nothing.

- **Game:** 6×5 scatter-pay slot, cascades, supernova pick bonus, gamble feature, 3 forgeable artifacts (Brasa / Yunque / Temple)
- **Frontend:** Vite + vanilla TypeScript + Canvas 2D, WebAudio-synthesized SFX, EN/ES
- **Contract:** `contracts/StarforgeGame.sol` (Solidity 0.8.30) — provably-fair on-chain settlement path
- **Math:** single source of truth `math-spec.json`; Monte Carlo 10M rounds — **93.94% RTP** fresh, **97.59% RTP** with all artifacts (see `docs/RTP_MATH.md`)
- **Host bridge:** Chain casino host SDK bridge (`src/host.ts`) with `game.manifest.json` (gameId `StarforgeGame`); standalone demo mode when no host

## Repo layout

```
contracts/      StarforgeGame.sol — on-chain game logic
docs/           RTP_MATH.md, SDK_VERSION.md
frontend/       playable game (npm run build → dist/)
simulator/      sim.py + parity.py — Python mirror of the math, 15/15 parity with the contract
math-spec.json  canonical math parameters
```

## Build & run

```bash
cd frontend
npm install
npm run build     # tsc + manifest validation + vite build → dist/
npm run preview   # serve the production build locally
```

Deploy `frontend/dist/` to any static host (e.g. Cloudflare Pages).

## Verification

- `node scripts/run-smoke.cjs host` — host bridge + ABI round-trips
- `node scripts/run-smoke.cjs game` — headless game flow
- `python3 simulator/parity.py` — contract/simulator parity (15/15)
- `python3 simulator/sim.py` — Monte Carlo RTP

## License

MIT
