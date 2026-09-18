# SDK Version Pin — STARFORGE

- **SDK:** `@chain/casino-sdk` (Casino SDK from `https://sdk.chain.wtf/casino`)
- **Changelog version:** `2026.09.17-1` (latest at build start, 2026-09-18)
- **Package version:** `0.2.0`
- **Zip SHA-256:** `1c9d625f04f3acdaa4fb088ad3fa4c64b8b5f3abb7bd7a3e14eec10c0f176848`
- **Downloaded:** 2026-09-18 from `https://sdk.chain.wtf/sdk/casino-sdk.zip`
- **Local copy:** `/tmp/chain-sdk/casino-sdk` (build reference; not shipped)

## Compatibility notes (from 2026.09.17-1 / 2026.09.15-1)
- `getRandomnessVerification` follows the current Verify Network router (EIP-712 domain version `2`).
- `SessionPhase` exported from package root and `./guest` — compare `phase === SessionPhase.SETTLED`, never hardcode `3`.
- `computeMaxWager` returns `MaxWagerResult` (`{kind:'limit'|'no-limit'|'unknown'}`).
- Game interface lives at `simulator/contracts/ICasinoGameV2.sol`; import as `./ICasinoGameV2.sol`.
- Payout-cap traps that revert large wins with `InvalidPayout`: (1) payout computed separately from the reserve ending a few base units above it; (2) releasing reserved profit on the settling step.
- `openSession` calls `onSessionStart` exactly once.
