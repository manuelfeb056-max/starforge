# STARFORGE — RTP & Math Verification

**Game:** STARFORGE — La Forja Estelar (StarforgeGame.sol)
**Date:** 2026-09-21 (v3: NOVA FURNACE retune + FURNACE OVERDRIVE wheel)
**Method:** Monte Carlo simulation, 3,000,000 rounds per state (frontend TS engine)
**Simulator:** `frontend/scripts/montecarlo.mts` (same engine as the demo)
**Bonus:** `frontend/src/nova.ts` (NOVA FURNACE), `frontend/src/overdrive.ts` (FURNACE OVERDRIVE)
**Note:** the on-chain contract (`contracts/StarforgeGame.sol`) still runs the legacy pick stage in host mode; the demo frontend auto-submits it. Demo math below describes the demo experience.

## Declared RTP

| State | RTP (10M) | 95% CI | Band |
|-------|-----------|--------|------|
| Fresh (no artifacts) | **94.24%** | ±0.12% | ✓ 93.94–97.59% |
| Steady (all artifacts) | **97.26%** | ±0.12% | ✓ 93.94–97.59% |

**Artifact spread:** +3.02% (fresh → steady).

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
Mechanics: 3 respins start, every new core resets to 3; each empty cell lands a core with p=0.026.
Core types — value (w=97.2, pool [0.08, 0.2, 0.5, 1.2, 3, 8, 25, 50, 100] xbet, weights [52, 25, 13, 6, 2.6, 1.1, 0.22, 0.06, 0.02]),
Collector (w=0.93, absorbs *current* values of ALL cores incl. specials), Payer (w=0.93, value ×2, can target specials),
Sniper (w=0.94, doubles up to 2 cores incl. specials). Boosted furnace (Overdrive 2nd Chance): +2 respins, specials recharged.
Temple artifact: values ×1.04.
Trigger frequency: 3.69% (3M drops). Mean award 2.02× fresh / 2.10× steady; max observed 901.4× (1M standalone furnaces).
Tail (1M): ≥50× 0.3687%, ≥100× 0.0957%, ≥250× 0.0032%, ≥500× 0.0009%. Rare (x25+) cores render hot-magenta.
Theoretical raw max is unbounded (collector chains); payable spin total is capped at 1000× bet.

## Artifacts (Crucible)

| Artifact | Effect | RTP delta |
|----------|--------|-----------|
| Brasa (0x01) | Constellation patterns ×1.25 | +0.013 |
| Yunque (0x02) | +5% on tier-3 (12+) scatter only | +0.008 |
| Temple (0x04) | Nova core values ×1.04 | +0.009 |

## RTP Breakdown (3M rounds)

| Component | Fresh | Steady |
|-----------|-------|--------|
| Base (scatter + constellations, ×0.967 pay scale) | 0.8221 | 0.8494 |
| NOVA FURNACE (3.69% trigger, avg 2.02×/2.10×) | 0.0746 | 0.0772 |
| FURNACE OVERDRIVE (~90-spin cycle, avg 4.11×/4.15×) | 0.0457 | 0.0460 |
| **Total** | **0.9424** | **0.9726** |

### FURNACE OVERDRIVE — segment detail (3M sims, steady state)

Every paid spin charges the forge (loss +1.6–2.4, win +0.4–0.8, nova +3, ≥10× +0.15, ≥25× +0.05);
at 100 the 6-segment wheel fires, then the bar discharges (reheat returns it to 50%).
Adaptive weights: cold streaks (recent-20 avg < 0) favor Rescue/Instant/Reheat; hot streaks favor Win-Mult/Hell.

| Segment | Rate | Avg award | Award range |
|---------|------|-----------|-------------|
| Rescue (3–8 free spins ×2–×5) | 23.6% | 4.53× | 0–1000× (free spins incl. nova) |
| Win-Mult (×2–×10 on mean of last 2 spins) | 16.6% | 5.14× | 0–10× recent |
| 2nd Chance (boosted nova: +2 respins) | 12.7% | 5.40× | 0–1000× |
| Instant | 21.3% | 4.01× | ×5–×50 |
| Hell (inner wheel) | 3.6% | 13.34× | ×6–×80 |
| Reheat (bar→50% + 1 free spin) | 22.2% | 0.93× | free spin face value |

Max observed overdrive award in 3M: bounded by the 1000× spin cap (0 clamp hits in the full-model sims;
standalone nova tail reached 901.4×). Theoretical segment maxima: Hell 80×, Instant 50×, Win-Mult 10× recent,
Rescue/Second-Chance unbounded in raw math → capped at 1000× payable.

## Risk Parameters

- **RTP_BPS:** 9760 (97.60% declared, steady-state; demo-measured steady 97.26%)
- **Max payout:** 1000× wager (MAX_PAYOUT_X)
- **probabilityWad:** 1e12 (see contract; probability of any profit)

## Verification

- [x] 15/15 parity: Solidity contract vs Python simulator (base game, legacy bonus stage)
- [x] Nova event-log math verified internally consistent (50/50 property test)
- [x] Nova trigger 3+ stars measured 3.759% (200k drops) vs expected ~3.7%
- [x] 3M Monte Carlo fresh: 94.24% (SE ±0.12%) ✓ inside 93.94–97.59% band
- [x] 3M Monte Carlo steady: 97.26% (SE ±0.12%) ✓ inside 93.94–97.59% band
- [x] Nova standalone tail 1M: mean 2.034×, max 901.4×, ≥100× 0.0957%
- [x] Overdrive segment distribution verified (3M): cycle ~90 spins, hell 3.6% @ 13.34× avg
- [x] Frontend headless smoke: 60 base spins + forced nova (fresh/temple) + demoNova + overdrive (cold/hot/hell/rescue/second) + rare-core nova + host path, no exceptions
- [x] Headless screenshots: HUD charge bar, wheel spin, wheel result, reveal, hell wheel, rare ×25 core
