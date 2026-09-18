#!/usr/bin/env python3
"""STARFORGE math simulator — mirrors math-spec.json EXACTLY.
Monte Carlo RTP verification. The Solidity contract and frontend demo
must produce the same distribution.

Conventions (shared with StarforgeGame.sol):
- grid index = col*5 + row (column-major); col c -> indices c*5..c*5+4, row 0 = top
- symbol draw: uniform over 122 weights, uint16 rejection at 65514
- wild: optimal assignment; ties -> wild-assigned version wins, wild IS removed
- cascade refill: column gravity (survivors sink), new draws fill top-down,
  RNG consumed c=0..5, r=0..4
"""
import random, sys

SYM = ['copper','iron','nickel','silver','gold','platinum','neutronium','star','wild']
W = [30,26,22,16,12,8,5,3]  # wild never drawn from base weights
MINERALS = list(range(7))
STAR, WILD = 7, 8
TABLE = []
for i, w in enumerate(W):
    TABLE.extend([i]*w)

BASE_PAY = {  # bps of wager, tiers [8-9, 10-11, 12+]
    0:[2000,5000,20000], 1:[3000,8000,30000], 2:[5000,10000,40000], 3:[8000,15000,60000],
    4:[10000,25000,100000], 5:[20000,50000,200000], 6:[50000,120000,500000],
}
PAY_SCALE = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
PAY = {m: [round(p*PAY_SCALE) for p in v] for m, v in BASE_PAY.items()}

PATTERNS = [  # (cells col-major, pay bps, id)
    ([11,12,13,7,17], 20000, 1),    # cruz
    ([6,18,12,8,16], 40000, 2),     # equis
    ([10,14,2,22,12], 80000, 3),    # diamante
    ([6,7,8,13,18], 150000, 4),     # herradura
]
PRIZES = [10000,10000,10000,20000,20000,20000,30000,30000,40000,50000,60000,60000]

# ---- FINAL artifact design (all multipliers on rare events) ----
# brasa  (0x01): constellation pattern pays xBRASA_MULT
# yunque (0x02): tier-3 (12+) scatter pays +YUNQUE_PCT%
# temple (0x04): TEMPLE_MODE 'pick6' = supernova picks 5->6;
#                          'prize110' = supernova pick prizes +10%
# (cascade cap always 2)
BRASA_MULT = (5, 4)  # x1.25
YUNQUE_PCT = 5
TEMPLE_MODE = 'prize110'

def tier_pay(count, m):
    if count >= 12: return PAY[m][2]
    if count >= 10: return PAY[m][1]
    if count >= 8:  return PAY[m][0]
    return 0

def draw_cell(rng):
    # rejection sampling mirror: randrange(122) == v % 122 for v < 65514
    return TABLE[rng.randrange(122)]

def evaluate_step(grid, artifacts):
    """Returns (win_xbet, pay_sym[9] bool, star_count, pat_id, pat_win)."""
    from collections import Counter
    counts = Counter(grid)
    pay_sym = [False]*9
    scatter = 0
    tier3 = 0  # tier-3 (12+) scatter component, for yunque
    for m in MINERALS:
        c = counts.get(m,0)
        p = tier_pay(c, m)
        if p:
            scatter += p
            if c >= 12: tier3 += p
            pay_sym[m] = True
    if artifacts & 0b010:  # yunque: +YUNQUE_PCT% on tier-3 scatter
        scatter = scatter + tier3 * YUNQUE_PCT // 100
    # constellations: highest matching pattern
    pat_id, pat_win = 0, 0
    for cells, pay, pid in PATTERNS:
        vals = [grid[i] for i in cells]
        if vals and all(v == vals[0] and v in MINERALS for v in vals):
            if pay > pat_win: pat_win, pat_id = pay, pid
    if artifacts & 0b001:  # brasa: constellation pays xBRASA_MULT
        pat_win = pat_win * BRASA_MULT[0] // BRASA_MULT[1]
    return scatter + pat_win, pay_sym, counts.get(STAR, 0), pat_id, pat_win

def collapse(grid, pay_sym, rng):
    """Column gravity: survivors sink, new draws fill from top. Returns new grid."""
    g = grid[:]
    for c in range(6):
        surv = []
        for r in range(5):
            s = g[c*5+r]
            if not pay_sym[s]:
                surv.append(s)
        top = 5 - len(surv)
        for r in range(5):
            g[c*5+r] = draw_cell(rng) if r < top else surv[r-top]
    return g

def run_spin(rng, artifacts):
    # Final design: cascade cap always 2; temple boosts supernova.
    cascade_cap = 2
    sn_picks = 6 if (artifacts & 0b100) and TEMPLE_MODE == 'pick6' else 5
    sn_prize_mult = (11, 10) if (artifacts & 0b100) and TEMPLE_MODE == 'prize110' else (1, 1)
    grid = [draw_cell(rng) for _ in range(30)]
    stars = sum(1 for s in grid if s == STAR)
    total = 0; pat_total = 0; steps = 0
    for _ in range(cascade_cap):
        w, pay_sym, _, _, pat = evaluate_step(grid, artifacts)
        total += w; pat_total += pat; steps += 1
        if not any(pay_sym):
            break
        grid = collapse(grid, pay_sym, rng)
    sn = 0
    if stars >= 4:
        pool = PRIZES[:]; rng.shuffle(pool)
        sn = sum(pool[:sn_picks]) * sn_prize_mult[0] // sn_prize_mult[1]
    return total, sn, pat_total

def simulate(n, artifacts, seed=12345):
    rng = random.Random(seed)
    tot = sn_tot = pat_tot = 0; sn_hits = 0
    for _ in range(n):
        base, sn, pat = run_spin(rng, artifacts)
        tot += base + sn; sn_tot += sn; pat_tot += pat
        if sn: sn_hits += 1
    return tot/(n*10000), sn_tot/(n*10000), pat_tot/(n*10000), sn_hits/n

if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200_000
    for art, name in [(0,'fresh (no artifacts)'), (0b111,'steady-state (all artifacts)')]:
        rtp, sn, pat, freq = simulate(n, art)
        print(f"scale={PAY_SCALE} {name}: RTP={rtp:.4f}  supernova={sn:.4f} (freq {freq:.5f})  patterns={pat:.4f}")
