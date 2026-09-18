#!/usr/bin/env python3
"""Parity test: Python Cursor-RNG implementation vs StarforgeGame.sol.
Mirrors the contract EXACTLY. For a given bytes32 seed and artifacts,
computes the full spin outcome. Compare with contract output."""
import sys
from eth_hash.auto import keccak

# ---- exact copies from sim.py (final design) ----
PAY = {
    0:[1650,4125,16500], 1:[2475,6600,24750], 2:[4125,8250,33000], 3:[6600,12375,49500],
    4:[8250,20625,82500], 5:[16500,41250,165000], 6:[41250,99000,412500],
}
MINERALS = list(range(7))
STAR = 7
PATTERNS = [
    ([11,12,13,7,17], 20000, 1),
    ([6,18,12,8,16], 40000, 2),
    ([10,14,2,22,12], 80000, 3),
    ([6,7,8,13,18], 150000, 4),
]
PRIZES = [10000,10000,10000,20000,20000,20000,30000,30000,40000,50000,60000,60000]
W_CUM = [30,56,78,94,106,114,119,122]  # cumulative weights

BRASA_MULT = (5,4); YUNQUE_PCT = 5; TEMPLE_MODE = 'prize110'

class Cursor:
    def __init__(self, seed: bytes):
        self.seed = seed; self.idx = 0
    def next_byte(self):
        while True:
            if self.idx < 32:
                b = self.seed[self.idx]; self.idx += 1
                return b
            self.seed = keccak(self.seed); self.idx = 0
    def draw_symbol(self):
        while True:
            v = (self.next_byte() << 8) | self.next_byte()
            if v < 65514:
                w = v % 122
                for i, cum in enumerate(W_CUM):
                    if w < cum: return i
                raise AssertionError
    def draw_range(self, n):
        limit = (256 // n) * n
        while True:
            b = self.next_byte()
            if b < limit: return b % n

def tier_pay(count, m):
    if count >= 12: return PAY[m][2]
    if count >= 10: return PAY[m][1]
    if count >= 8:  return PAY[m][0]
    return 0

def evaluate_step(grid, artifacts):
    from collections import Counter
    counts = Counter(grid)
    pay_sym = [False]*9
    scatter = 0; tier3 = 0
    for m in MINERALS:
        c = counts.get(m, 0); p = tier_pay(c, m)
        if p:
            scatter += p
            if c >= 12: tier3 += p
            pay_sym[m] = True
    if artifacts & 0b010:
        scatter = scatter + tier3 * YUNQUE_PCT // 100
    pat_id, pat_win = 0, 0
    for cells, pay, pid in PATTERNS:
        vals = [grid[i] for i in cells]
        if vals and all(v == vals[0] and v in MINERALS for v in vals):
            if pay > pat_win: pat_win, pat_id = pay, pid
    if artifacts & 0b001:
        pat_win = pat_win * BRASA_MULT[0] // BRASA_MULT[1]
    return scatter + pat_win, pay_sym, counts.get(STAR, 0), pat_id, pat_win

def collapse(grid, pay_sym, cur):
    g = grid[:]
    for c in range(6):
        surv = [g[c*5+r] for r in range(5) if not pay_sym[g[c*5+r]]]
        top = 5 - len(surv)
        for r in range(5):
            g[c*5+r] = cur.draw_symbol() if r < top else surv[r-top]
    return g

def run_spin(seed_hex, artifacts):
    cur = Cursor(bytes.fromhex(seed_hex))
    grid = [cur.draw_symbol() for _ in range(30)]
    stars = sum(1 for s in grid if s == STAR)
    grid_win = 0; step_wins = []; step_pats = []; grids = []
    for step in range(2):
        w, pay_sym, _, pat_id, pat_win = evaluate_step(grid, artifacts)
        grids.append(grid[:])
        # step win in wad for wager=1e18: wager * winBps / 10000
        step_wins.append(w)
        step_pats.append(pat_id)
        grid_win += w
        if not any(pay_sym):
            break
        grid = collapse(grid, pay_sym, cur)
    prizes = [0]*12
    if stars >= 4:
        prizes = PRIZES[:]
        # temple +10% applied at pick time (onPlayerAction), not in the array
        # Fisher-Yates
        for i in range(11, 0, -1):
            j = cur.draw_range(i+1)
            prizes[i], prizes[j] = prizes[j], prizes[i]
    return {
        'grid_win_bps': grid_win,
        'step_wins_bps': step_wins,
        'step_pats': step_pats,
        'step_count': len(step_wins),
        'grids': grids,
        'prizes': prizes,
        'stars': stars,
    }

if __name__ == '__main__':
    seed = sys.argv[1]
    arts = int(sys.argv[2])
    r = run_spin(seed, arts)
    print(f"grid_win_bps={r['grid_win_bps']}")
    print(f"step_count={r['step_count']}")
    print(f"step_wins_bps={r['step_wins_bps']}")
    print(f"step_pats={r['step_pats']}")
    print(f"stars={r['stars']}")
    print(f"prizes={r['prizes']}")
    print(f"grid0={r['grids'][0] if r['grids'] else []}")
