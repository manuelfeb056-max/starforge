# STARFORGE — RTP & Math Verification

**Game:** STARFORGE — La Forja Estelar (StarforgeGame.sol)
**Date:** 2026-09-20 (v2: NOVA FURNACE replaces the supernova pick bonus)
**Method:** Monte Carlo simulation, 3,000,000 rounds per state (frontend TS engine)
**Simulator:** `frontend/scripts/montecarlo.mts` (same engine as the demo)
**Bonus:** `frontend/src/nova.ts` (NOVA FURNACE)
**Note:** the on-chain contract (`contracts/StarforgeGame.sol`) still runs the legacy pick stage in host mode; the demo frontend auto-submits it. Demo math below describes the demo experience.

## Declared RTP

| State | RTP (10M) | 95% CI | Band |
|-------|-----------|--------|------|
| Fresh (no artifacts) | **94.08%** | ±0.08% | ✓ 93–98% |
| Steady (all artifacts) | **97.34%** | ±0.09% | ✓ 93–98% |

**Artifact spread:** +3.26% (fresh → steady).

## Paytable (xbet)

| Mineral | 8–9 | 10–11 | 12+ |
|---------|-----|-------|-----|
| Copper | 0.165 | 0.4125 | 1.65 |
| Iron | 0.2475 | 0.66 | 2.475 |
| Nickel | 0.4125 | 0.825 | 3.30 |
| Silver | 0.66 | 1.2375 | 4.95 |
| Gold | 0.825 | 2.0625 | 8.25 |
| Platinum | 1.65 | 4.125 | 16.50 |
| Neutronium | 4.125 | 9.90 | 41.25 |

**Symbol weights** (total 122): Copper 30, Iron 26, Nickel 22, Silver 16, Gold 12, Platinum 8, Neutronium 5, Star 3.

**Constellation patterns** (5 minerals, any mineral):
- Cruz: 2.00×
- Equis: 4.00×
- Diamante: 8.00×
- Herradura: 15.00×

**NOVA FURNACE:** 3+ stars in initial drop → automatic respin bonus on a 5×4 grid (Money-Train-style, original art/audio).
Mechanics: 3 respins start, every new core resets to 3; each empty cell lands a core with p=0.05.
Core types — value (w=96, pool [0.15, 0.32, 0.65] xbet, weights [70, 23, 7]), Collector (w=1.5, absorbs copies of all core values),
Payer (w=1.25, adds its value to every core), Sniper (w=1.25, doubles 1–3 random cores).
Trigger frequency: 3.76% (200k drops). Mean award 2.47×, max observed 48.49× (3M sims).

## Artifacts (Crucible)

| Artifact | Effect | RTP delta |
|----------|--------|-----------|
| Brasa (0x01) | Constellation patterns ×1.25 | +0.013 |
| Yunque (0x02) | +5% on tier-3 (12+) scatter only | +0.008 |
| Temple (0x04) | Nova core values ×1.08 | +0.009 |

## RTP Breakdown (3M rounds)

| Component | Fresh | Steady |
|-----------|-------|--------|
| Scatter pays | 0.780 | 0.789 |
| Constellation patterns | 0.070 | 0.087 |
| NOVA FURNACE | 0.091 | 0.098 |
| **Total** | **0.939** | **0.976** |

## Risk Parameters

- **RTP_BPS:** 9760 (97.60% declared, steady-state; demo-measured steady 97.34%)
- **Max payout:** 1000× wager (MAX_PAYOUT_X)
- **probabilityWad:** 1e12 (see contract; probability of any profit)

## Verification

- [x] 15/15 parity: Solidity contract vs Python simulator (base game, legacy bonus stage)
- [x] Nova event-log math verified internally consistent (50/50 property test)
- [x] Nova trigger 3+ stars measured 3.759% (200k drops) vs expected ~3.7%
- [x] 3M Monte Carlo fresh: 94.08% (SE ±0.08%) ✓ inside declared band
- [x] 3M Monte Carlo steady: 97.34% (SE ±0.09%) ✓ inside declared band
- [x] Frontend headless smoke: 60 base spins + forced nova (fresh/temple) + demoNova + host path, no exceptions
