// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./ICasinoGameV2.sol";

/// @title StarforgeGame — "La Forja Estelar"
/// @notice Scatter-pay 6x5 cosmic-forge slot for Chain Jam Vol. 1.
/// @notice Implements ICasinoGameV2 exactly. Math mirrors math-spec.json.
/// @notice Artifacts (declared via gameData bitmask, forged via the crucible):
///   brasa  (0x01): constellation pattern pays x1.25.
///   yunque (0x02): +5% on tier-3 (12+) scatter pays.
///   temple (0x04): supernova pick prizes +10%.
/// @notice Session flow:
///   openSession(gameData = 1 byte artifacts bitmask)
///     -> onSessionStart: WAITING_RANDOMNESS (request VRF)
///     -> onRandomness#1: full spin (draws, cascades, patterns, supernova check)
///        - no supernova: SETTLED with grid payout
///        - supernova (4+ stars): WAITING_PLAYER_ACTION (stage=PICKS)
///     -> onPlayerAction([p0..p4, gamble]): pick 5 of 12, optional double-or-nothing
///        - collect: SETTLED
///        - gamble: WAITING_RANDOMNESS (stage=GAMBLE, request VRF)
///     -> onRandomness#2: fair coin flip -> SETTLED
/// @notice The full outcome reveal is encoded in gameState (Reveal struct) so the
///         guest UI can decode and animate it without re-simulating.
contract StarforgeGame is ICasinoGameV2 {
    // ---------------- math constants (mirror math-spec.json) ----------------
    uint8 internal constant COLS = 6;
    uint8 internal constant ROWS = 5;
    uint8 internal constant CELLS = 30;

    // symbols: 0..6 minerals, 7 = star (scatter)
    uint8 internal constant STAR = 7;

    // base weights per cell: copper30 iron26 nickel22 silver16 gold12 platinum8 neutronium5 star3
    uint16 internal constant TOTAL_WEIGHT = 122;
    // uint16 rejection sampling: floor(65536/122)*122 = 65514
    uint16 internal constant SYMBOL_REJECT = 65514;

    // scatter tiers 8-9 / 10-11 / 12+ — pays in bps of wager (10000 = 1x).
    // TUNED via Monte Carlo (see docs/RTP_MATH.md). Keep in sync with math-spec.json.
    // copper   iron    nickel  silver  gold    platinum neutronium
    uint32 internal constant PAY_8_0 = 1650;
    uint32 internal constant PAY_8_1 = 2475;
    uint32 internal constant PAY_8_2 = 4125;
    uint32 internal constant PAY_8_3 = 6600;
    uint32 internal constant PAY_8_4 = 8250;
    uint32 internal constant PAY_8_5 = 16500;
    uint32 internal constant PAY_8_6 = 41250;
    uint32 internal constant PAY_10_0 = 4125;
    uint32 internal constant PAY_10_1 = 6600;
    uint32 internal constant PAY_10_2 = 8250;
    uint32 internal constant PAY_10_3 = 12375;
    uint32 internal constant PAY_10_4 = 20625;
    uint32 internal constant PAY_10_5 = 41250;
    uint32 internal constant PAY_10_6 = 99000;
    uint32 internal constant PAY_12_0 = 16500;
    uint32 internal constant PAY_12_1 = 24750;
    uint32 internal constant PAY_12_2 = 33000;
    uint32 internal constant PAY_12_3 = 49500;
    uint32 internal constant PAY_12_4 = 82500;
    uint32 internal constant PAY_12_5 = 165000;
    uint32 internal constant PAY_12_6 = 412500;

    // constellation patterns (cells = col*5+row), pays in bps of wager
    // cruz (2x):      (2,1)(2,2)(2,3)(1,2)(3,2)
    // equis (4x):     (1,1)(3,3)(2,2)(1,3)(3,1)
    // diamante (8x):  (2,0)(2,4)(0,2)(4,2)(2,2)
    // herradura (15x):(1,1)(1,2)(1,3)(2,3)(3,3)
    uint32 internal constant PAT_PAY_CRUZ = 20000;
    uint32 internal constant PAT_PAY_EQUIS = 40000;
    uint32 internal constant PAT_PAY_DIAMANTE = 80000;
    uint32 internal constant PAT_PAY_HERRADURA = 150000;

    // supernova: fixed prize multiset (xbet bps), shuffled by VRF
    uint16 internal constant PRIZE_0 = 10000;
    uint16 internal constant PRIZE_1 = 10000;
    uint16 internal constant PRIZE_2 = 10000;
    uint16 internal constant PRIZE_3 = 20000;
    uint16 internal constant PRIZE_4 = 20000;
    uint16 internal constant PRIZE_5 = 20000;
    uint16 internal constant PRIZE_6 = 30000;
    uint16 internal constant PRIZE_7 = 30000;
    uint16 internal constant PRIZE_8 = 40000;
    uint16 internal constant PRIZE_9 = 50000;
    uint16 internal constant PRIZE_10 = 60000;
    uint16 internal constant PRIZE_11 = 60000;
    uint8 internal constant SN_TRIGGER = 4;
    uint8 internal constant SN_PICKS = 5;

    // caps & risk
    uint256 internal constant MAX_PAYOUT_X = 1000; // 1000x wager hard cap
    uint256 internal constant RTP_BPS = 9760; // declared 97.60% (steady-state 10M Monte Carlo, see docs/RTP_MATH.md)
    uint256 internal constant PROB_WAD = 1e12; // conservative top-tier probability

    // artifacts bitmask
    // brasa:  constellation pattern pays x1.25
    // yunque: +5% on tier-3 (12+) scatter pays (patterns/supernova unaffected)
    // temple: supernova pick prizes +10%
    uint8 internal constant ART_BRASA = 0x01;
    uint8 internal constant ART_YUNQUE = 0x02;
    uint8 internal constant ART_TEMPLE = 0x04;

    // stages
    uint8 internal constant STAGE_SPIN = 0;
    uint8 internal constant STAGE_PICKS = 1;
    uint8 internal constant STAGE_GAMBLE = 2;
    uint8 internal constant STAGE_DONE = 3;

    error StarforgeGame__BadGameData();
    error StarforgeGame__BadAction();
    error StarforgeGame__NoPlayerAction();

    /// @notice Canonical outcome reveal, encoded as gameState on every step.
    struct Reveal {
        uint8 stage;
        uint256 gridWinBps; // total grid win, bps of wager
        uint8 artifacts;
        uint16[12] prizes; // supernova prize layout (zeros if none; x1.10 if temple)
        bytes grids; // stepCount * 30 bytes, pre-refill grids per cascade step
        uint256[] stepWins; // wad payout per cascade step
        uint8[] stepPats; // pattern id per step (0=none,1=cruz,2=equis,3=diamante,4=herradura)
        uint8 stepCount;
        uint256 picksBps; // picked supernova prizes, bps of wager
        uint8[5] picks; // picked indices
        bool gambleWin; // gamble coin result
        uint256 totalBps; // final total, bps of wager
    }

    // ---------------- RNG helpers (rejection sampling) ----------------
    struct Cursor {
        bytes32 seed;
        uint256 idx;
    }

    function _nextByte(Cursor memory c) internal pure returns (uint8) {
        while (true) {
            if (c.idx < 32) {
                uint8 b = uint8(c.seed[c.idx]);
                c.idx++;
                return b;
            }
            c.seed = keccak256(abi.encodePacked(c.seed));
            c.idx = 0;
        }
    }

    /// @notice uniform symbol in [0, TOTAL_WEIGHT): reject v >= 65514
    function _drawSymbol(Cursor memory c) internal pure returns (uint8) {
        while (true) {
            uint16 v = (uint16(_nextByte(c)) << 8) | uint16(_nextByte(c));
            if (v < SYMBOL_REJECT) {
                uint16 w = v % TOTAL_WEIGHT;
                if (w < 30) return 0;
                if (w < 56) return 1;
                if (w < 78) return 2;
                if (w < 94) return 3;
                if (w < 106) return 4;
                if (w < 114) return 5;
                if (w < 119) return 6;
                return STAR;
            }
        }
    }

    /// @notice uniform uint8 in [0, n): limit = floor(256/n)*n, reject b >= limit
    function _drawRange(Cursor memory c, uint8 n) internal pure returns (uint8) {
        uint16 limit = (256 / n) * n;
        while (true) {
            uint8 b = _nextByte(c);
            if (uint16(b) < limit) return b % n;
        }
    }

    function _payFor(uint8 mineral, uint8 count) internal pure returns (uint32) {
        if (count >= 12) {
            if (mineral == 0) return PAY_12_0;
            if (mineral == 1) return PAY_12_1;
            if (mineral == 2) return PAY_12_2;
            if (mineral == 3) return PAY_12_3;
            if (mineral == 4) return PAY_12_4;
            if (mineral == 5) return PAY_12_5;
            return PAY_12_6;
        }
        if (count >= 10) {
            if (mineral == 0) return PAY_10_0;
            if (mineral == 1) return PAY_10_1;
            if (mineral == 2) return PAY_10_2;
            if (mineral == 3) return PAY_10_3;
            if (mineral == 4) return PAY_10_4;
            if (mineral == 5) return PAY_10_5;
            return PAY_10_6;
        }
        if (count >= 8) {
            if (mineral == 0) return PAY_8_0;
            if (mineral == 1) return PAY_8_1;
            if (mineral == 2) return PAY_8_2;
            if (mineral == 3) return PAY_8_3;
            if (mineral == 4) return PAY_8_4;
            if (mineral == 5) return PAY_8_5;
            return PAY_8_6;
        }
        return 0;
    }

    // ---------------- ICasinoGameV2 ----------------
    function _decodeArtifacts(bytes calldata gameData) internal pure returns (uint8) {
        if (gameData.length != 1) revert StarforgeGame__BadGameData();
        uint8 a = uint8(gameData[0]);
        if (a > 0x07) revert StarforgeGame__BadGameData();
        return a;
    }

    function _maxReservedProfit(uint256 wager) internal pure returns (uint256) {
        return wager * (MAX_PAYOUT_X - 1);
    }

    /// @notice THE single payout function: every settlement path routes through here,
    ///         so reserved profit and payout agree to the wei (payout-cap trap).
    function _payoutFor(uint256 wager, uint256 winBps) internal pure returns (uint256) {
        uint256 p = (wager * winBps) / 10000;
        uint256 cap = wager * MAX_PAYOUT_X;
        return p > cap ? cap : p;
    }

    function quoteCaps(
        uint256 wager,
        bytes calldata gameData
    ) external pure returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
        _decodeArtifacts(gameData);
        maxEscrowStake = wager;
        maxReservedProfit = _maxReservedProfit(wager);
    }

    function quoteRiskParams(
        uint256 wager,
        bytes calldata gameData
    )
        external
        pure
        returns (
            uint256 maxPayout,
            uint256 probabilityWad,
            uint256 expectedPayout,
            uint256 subJackpotVarianceScaled
        )
    {
        _decodeArtifacts(gameData);
        maxPayout = wager * MAX_PAYOUT_X;
        probabilityWad = PROB_WAD;
        expectedPayout = (wager * RTP_BPS) / 10000;
        subJackpotVarianceScaled = 0;
    }

    function onSessionStart(
        SessionContext calldata ctx
    ) external pure returns (StepResult memory r) {
        uint8 artifacts = _decodeArtifacts(ctx.gameData);
        Reveal memory rev;
        rev.stage = STAGE_SPIN;
        rev.artifacts = artifacts;
        rev.stepWins = new uint256[](3);
        rev.stepPats = new uint8[](3);
        r.newGameState = abi.encode(rev);
        r.escrowDelta = 0;
        r.reservedProfitDelta = int256(_maxReservedProfit(ctx.wagerBase));
        r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
        r.requestRandomnessNow = true;
        r.payout = 0;
    }

    function onPlayerAction(
        SessionContext calldata ctx,
        bytes calldata actionData
    ) external pure returns (StepResult memory r) {
        Reveal memory rev = abi.decode(ctx.gameState, (Reveal));
        if (rev.stage != STAGE_PICKS) revert StarforgeGame__NoPlayerAction();
        // actionData: 6 bytes [pick0..pick4, gamble]; picks in [0,11], distinct.
        if (actionData.length != 6) revert StarforgeGame__BadAction();
        for (uint8 i = 0; i < 5; i++) {
            rev.picks[i] = uint8(actionData[i]);
            if (rev.picks[i] >= 12) revert StarforgeGame__BadAction();
            for (uint8 j = 0; j < i; j++) {
                if (rev.picks[j] == rev.picks[i]) revert StarforgeGame__BadAction();
            }
        }
        uint8 gamble = uint8(actionData[5]);
        if (gamble > 1) revert StarforgeGame__BadAction();
        rev.picksBps = 0;
        for (uint8 i = 0; i < 5; i++) rev.picksBps += rev.prizes[rev.picks[i]];
        // temple: supernova pick prizes +10% (applied to sum; exact as prizes are multiples of 10000)
        if (rev.artifacts & ART_TEMPLE != 0) rev.picksBps = (rev.picksBps * 11) / 10;

        if (gamble == 0) {
            rev.stage = STAGE_DONE;
            rev.totalBps = rev.gridWinBps + rev.picksBps;
            r.newGameState = abi.encode(rev);
            r.nextPhase = SessionPhase.SETTLED;
            r.requestRandomnessNow = false;
            r.payout = _payoutFor(ctx.wagerBase, rev.totalBps);
        } else {
            rev.stage = STAGE_GAMBLE;
            r.newGameState = abi.encode(rev);
            r.nextPhase = SessionPhase.WAITING_RANDOMNESS;
            r.requestRandomnessNow = true;
            r.payout = 0;
        }
    }

    function onRandomness(
        SessionContext calldata ctx,
        bytes32 randomness
    ) external pure returns (StepResult memory r) {
        Reveal memory rev = abi.decode(ctx.gameState, (Reveal));

        if (rev.stage == STAGE_GAMBLE) {
            // fair coin: 256 divisible by 2, no rejection needed
            rev.gambleWin = (uint8(randomness[0]) % 2) == 0;
            rev.stage = STAGE_DONE;
            rev.totalBps = rev.gridWinBps + (rev.gambleWin ? rev.picksBps * 2 : 0);
            r.newGameState = abi.encode(rev);
            r.nextPhase = SessionPhase.SETTLED;
            r.requestRandomnessNow = false;
            r.payout = _payoutFor(ctx.wagerBase, rev.totalBps);
            return r;
        }

        // STAGE_SPIN: run the full spin
        Cursor memory cur = Cursor(randomness, 0);
        uint8[CELLS] memory grid;
        for (uint8 i = 0; i < CELLS; i++) grid[i] = _drawSymbol(cur);
        uint8 stars = 0;
        for (uint8 i = 0; i < CELLS; i++) if (grid[i] == STAR) stars++;

        // cascade cap is always 2; Temple grants +1 supernova pick instead.
        for (uint8 step = 0; step < 2; step++) {
            (uint256 stepBps, uint8 pat, bool[9] memory paySym, bool anyPay) =
                _evaluateStep(grid, rev.artifacts);
            for (uint8 i = 0; i < CELLS; i++) rev.grids = abi.encodePacked(rev.grids, grid[i]);
            rev.stepWins[rev.stepCount] = (ctx.wagerBase * stepBps) / 10000;
            rev.stepPats[rev.stepCount] = pat;
            rev.stepCount++;
            rev.gridWinBps += stepBps;
            if (!anyPay) break;
            grid = _collapseAndRefill(grid, paySym, cur);
        }

        if (stars >= SN_TRIGGER) {
            _initPrizes(rev.prizes);
            for (uint8 i = 11; i > 0; i--) {
                uint8 j = _drawRange(cur, i + 1);
                (rev.prizes[i], rev.prizes[j]) = (rev.prizes[j], rev.prizes[i]);
            }
            rev.stage = STAGE_PICKS;
            r.newGameState = abi.encode(rev);
            r.nextPhase = SessionPhase.WAITING_PLAYER_ACTION;
            r.requestRandomnessNow = false;
            r.payout = 0;
        } else {
            rev.stage = STAGE_DONE;
            rev.totalBps = rev.gridWinBps;
            r.newGameState = abi.encode(rev);
            r.nextPhase = SessionPhase.SETTLED;
            r.requestRandomnessNow = false;
            r.payout = _payoutFor(ctx.wagerBase, rev.totalBps);
        }
    }

    /// @notice Evaluate one cascade step.
    /// @return winBps total win in bps of wager (scatter + best pattern)
    /// @return pat pattern id (0=none,1=cruz,2=equis,3=diamante,4=herradura)
    /// @return paySym minerals to remove (stars never set -> persist)
    /// @return anyPay whether any scatter win occurred (drives cascades)
    function _evaluateStep(
        uint8[CELLS] memory grid,
        uint8 artifacts
    ) internal pure returns (uint256, uint8, bool[9] memory, bool) {
        uint8[8] memory counts;
        for (uint8 i = 0; i < CELLS; i++) counts[grid[i]]++;

        uint256 scatterBps = 0;
        uint256 tier3Bps = 0;
        bool[9] memory paySym;
        for (uint8 m = 0; m < 7; m++) {
            uint32 p = _payFor(m, counts[m]);
            if (p > 0) {
                scatterBps += p;
                if (counts[m] >= 12) tier3Bps += p;
                paySym[m] = true;
            }
        }
        // yunque: +5% on tier-3 (12+) scatter pays only
        if (artifacts & ART_YUNQUE != 0) scatterBps += tier3Bps / 20;

        uint8 pat = 0;
        uint256 patBps = 0;
        if (_matchPattern(grid, 11, 12, 13, 7, 17)) { pat = 1; patBps = PAT_PAY_CRUZ; }
        if (_matchPattern(grid, 6, 18, 12, 8, 16) && PAT_PAY_EQUIS > patBps) { pat = 2; patBps = PAT_PAY_EQUIS; }
        if (_matchPattern(grid, 10, 14, 2, 22, 12) && PAT_PAY_DIAMANTE > patBps) { pat = 3; patBps = PAT_PAY_DIAMANTE; }
        if (_matchPattern(grid, 6, 7, 8, 13, 18) && PAT_PAY_HERRADURA > patBps) { pat = 4; patBps = PAT_PAY_HERRADURA; }
        // brasa: constellation pays x1.25
        if (artifacts & ART_BRASA != 0) patBps = (patBps * 5) / 4;

        bool anyPay = scatterBps > 0;
        return (scatterBps + patBps, pat, paySym, anyPay);
    }

    /// @notice Column gravity: survivors sink to the bottom, new VRF draws fill
    ///         from the top. RNG consumed c=0..5, r=0..4 (mirrors the simulator).
    function _collapseAndRefill(
        uint8[CELLS] memory grid,
        bool[9] memory paySym,
        Cursor memory cur
    ) internal pure returns (uint8[CELLS] memory) {
        for (uint8 c = 0; c < 6; c++) {
            uint8[5] memory surv;
            uint8 n = 0;
            for (uint8 r = 0; r < 5; r++) {
                uint8 s = grid[c * 5 + r];
                if (!paySym[s]) surv[n++] = s;
            }
            uint8 top = 5 - n;
            for (uint8 r = 0; r < 5; r++) {
                grid[c * 5 + r] = r < top ? _drawSymbol(cur) : surv[r - top];
            }
        }
        return grid;
    }

    /// @notice All 5 cells hold the same mineral (stars can't form a pattern).
    function _matchPattern(
        uint8[CELLS] memory grid,
        uint8 a, uint8 b, uint8 c, uint8 d, uint8 e
    ) internal pure returns (bool) {
        uint8[5] memory cells = [a, b, c, d, e];
        uint8 first = grid[cells[0]];
        if (first > 6) return false;
        for (uint8 i = 1; i < 5; i++) {
            if (grid[cells[i]] != first) return false;
        }
        return true;
    }

    function _initPrizes(uint16[12] memory prizes) internal pure {
        prizes[0] = PRIZE_0; prizes[1] = PRIZE_1; prizes[2] = PRIZE_2;
        prizes[3] = PRIZE_3; prizes[4] = PRIZE_4; prizes[5] = PRIZE_5;
        prizes[6] = PRIZE_6; prizes[7] = PRIZE_7; prizes[8] = PRIZE_8;
        prizes[9] = PRIZE_9; prizes[10] = PRIZE_10; prizes[11] = PRIZE_11;
    }

    function quoteForfeitPayout(
        SessionContext calldata
    ) external pure returns (uint256) {
        // Mid-round value depends on unresolved randomness / hidden picks:
        // the supernova bonus must be completed. Return 0.
        return 0;
    }
}
