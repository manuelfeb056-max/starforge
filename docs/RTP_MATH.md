# STARFORGE — RTP & Math Verification

**Game:** STARFORGE — La Forja Estelar (StarforgeGame.sol)
**Date:** 2026-09-18
**Method:** Monte Carlo simulation, 10,000,000 rounds per state
**Simulator:** `simulator/sim.py` (integer bps arithmetic, verified 15/15 parity with Solidity)
**Contract:** `contracts/StarforgeGame.sol` (6,497 bytes, Solidity 0.8.30)

## Declared RTP

| State | RTP (10M) | 95% CI | Band |
|-------|-----------|--------|------|
| Fresh (no artifacts) | **93.94%** | ±0.05% | ✓ 93–98% |
| Steady (all artifacts) | **97.59%** | ±0.04% | ✓ 93–98% |

**Artifact spread:** +3.65% (fresh → steady).

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

**Supernova:** 4+ stars in initial drop → pick 5 of 12 prizes.
Prize pool (xbet): [1,1,1,2,2,2,3,3,4,5,6,6]. Trigger frequency: 0.60%.

## Artifacts (Crucible)

| Artifact | Effect | RTP delta |
|----------|--------|-----------|
| Brasa (0x01) | Constellation patterns ×1.25 | +0.013 |
| Yunque (0x02) | +5% on tier-3 (12+) scatter only | +0.008 |
| Temple (0x04) | Supernova pick prizes +10% (applied to sum at settlement) | +0.009 |

## RTP Breakdown (10M rounds)

| Component | Fresh | Steady |
|-----------|-------|--------|
| Scatter pays | 0.780 | 0.789 |
| Constellation patterns | 0.070 | 0.087 |
| Supernova (picks) | 0.090 | 0.099 |
| **Total** | **0.939** | **0.976** |

## Risk Parameters

- **RTP_BPS:** 9760 (97.60% declared, steady-state)
- **Max payout:** 1000× wager (MAX_PAYOUT_X)
- **probabilityWad:** 1e12 (see contract; probability of any profit)

## Verification

- [x] 15/15 parity: Solidity contract vs Python simulator (identical grids, wins, prize shuffles)
- [x] Full session flow: start → spin → supernova → picks → gamble (win/loss) → settle
- [x] Temple +10% applied correctly at settlement (uint16 overflow bug found & fixed)
- [x] 10M Monte Carlo fresh: 93.94% ✓
- [x] 10M Monte Carlo steady: 97.59% ✓
- [x] Frontend rebuilt with final paytable (84K dist, 59KB JS)
