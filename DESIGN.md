# STARFORGE — Frontend Design & Build Spec

**What:** casino game entry for Chain Jam Vol. 1. Scatter-pay 6×5 slot, cosmic-forge theme.
**Stack:** Vite + vanilla TypeScript + Canvas 2D (no frameworks, no Phaser — full control, tiny bundle, near-instant load = eligibility criterion).
**Math:** single source of truth = `~/workspace/chain-jam/starforge/math-spec.json`. READ IT FIRST. Implement its exact parameters (weights, paytable, patterns, nova furnace, cascades, artifacts). The demo RNG must use the same parameters as the contract.
**SDK bridge:** vendor `src/types.ts`, `src/guest.ts`, `src/manifest.ts` from `/tmp/chain-sdk/casino-sdk/src/` into `frontend/src/sdk/` (same exports). `npm i penpal`. Do NOT add viem — gameData/actionData are raw bytes (see encoding below), hand-encode them.
**Workdir:** `~/workspace/chain-jam/starforge/frontend/`

---

## 1. Art direction — "La Forja Estelar" (NON-NEGOTIABLE: no AI slop)

**Palette (closed, use only these + tints):**
- Void: `#050510` → `#0d0b26` vertical gradient background, vignette.
- Molten: `#ff6b1a` (primary glow), ember gold `#ffb347`, hot white `#fff7e6` (win flashes).
- Plasma cyan `#22d3ee` (sparks, UI accents).
- Neutronium violet `#8b5cf6` (rare symbol, supernova).
- Steel text: `#e8e6f0` primary, `#8a87a3` muted.

**Minerals (rounded-square "ore" tokens with beveled gradient + inner glow + rune notch):**
- copper `#b87333`, iron `#9aa5b1`, nickel `#7dd3a8`, silver `#c9d4e3`, gold `#f5c542`, platinum `#e8fbff` (brightest bevel), neutronium `#8b5cf6` (pulsing violet aura).
- Each mineral has a distinct engraved glyph (draw with canvas paths: Cu=△, Fe=▭, Ni=⬡, Ag=☾, Au=☉, Pt=✦, Nt=❖). Never rely on color alone.
- Star (scatter): 5-point star, white-gold with radiating glow + slow rotation. No wild symbol in the final design.

**Background:** layered — (1) static starfield (200 stars, parallax drift), (2) slow nebula blobs (radial gradients, violet/orange, 0.15 alpha), (3) forge glow at bottom (flickering orange radial), (4) faint grid of constellation lines connecting random stars. All procedural.

**Crucible (left panel):** vertical vessel with liquid metal (animated sine-wave surface, orange gradient, glow). Fill = essence progress to next artifact. On forge: hammer-strike flash + screen shake + artifact icon ignites.

**NOVA FURNACE overlay:** dimensional rift entry (radial zoom + collapse, no fade), a 5×4 iron forge chamber; star cores slam in with bounce + shockwave, molten aura, plasma arcs; Collector fires individual beams to every core, Sniper takes aim with crosshair + laser, Payer detonates an expanding shockwave; finale = total count-up + big-win shockwaves. Rare (x25+) cores burn hot-magenta.
**FURNACE OVERDRIVE overlay:** persistent charge bar in the HUD (losses heat it fastest; pulses at 80%+, ember bursts at 25/50/75). At 100% the forge wheel ignites: 6-segment casino wheel (iron rim, rivets, heat shimmer, skull-tipped pointer with bounce) with real physics — 5 full turns, ease-out deceleration, per-segment tick sounds that slow with the wheel, suspense riser + zoom before the reveal. Hell mode opens an inner prize wheel (x6–x80) with eruption on land. Rescue/Second-Chance play real free spins and boosted furnaces on the base grid. Tribal/mechanical drum loop + anvil clanks while the wheel lives.

## 2. Layout (1280×800 logical, responsive scale)

- Top bar: STARFORGE wordmark (letterspaced, gradient text), balance (demo: "1,000 DEMO" or host balance), RTP "i" button, DEMO badge (standalone mode only), sound toggle.
- Center: 6×5 grid on a dark anvil slab (subtle metallic border, rivets in corners).
- Left: crucible + 3 artifact slots (Brasa/Yunque/Temple — dim until forged).
- Right: last-win panel + win history ticker (last 8).
- Bottom: bet selector (− / + and quick amounts), big FORJAR (spin) button (molten, glows on hover, disabled states), max-bet clamp note.
- Win presentation: center-screen count-up with ember particles, tiered by size (win <10×: gold text; 10-50×: larger + rays; 50×+: "FORJA LEGENDARIA" banner + screen flash).

## 3. Game feel (this is what wins "visual & sound")

- Symbol drop: staggered fall with slight bounce (easeOutBack), 40ms stagger per cell, column by column.
- Win: paying symbols pulse 2× then dissolve into upward ember particles; payline count badge pops.
- Cascade: remaining symbols slide down with gravity ease; new ones drop from top.
- Artifact events: Yunque → anvil slam on tier-3 (12+) scatter wins (screen shake 6px, 150ms, deep thunk); Brasa → boosted constellation burns brighter (extra ember burst + ignite whoosh); Temple → nova core values ×1.04.
- Nova Furnace trigger: 3+ stars → dimensional rift → the furnace chamber.
- Anticipation: when 3 stars land, 4th+ reel positions shimmer.
- All animations must be skippable (click) and respect `prefers-reduced-motion`.

## 4. SFX — 100% synthesized WebAudio (no files)

Create `src/audio.ts` with a tiny synth: master gain + mute. Sounds (all oscillator/noise-based):
- `drop`: short filtered noise tick (pitch varies by column).
- `win`: pentatonic chime arpeggio (sine + triangle, notes from win tier).
- `cascade`: rising whoosh (noise sweep up).
- `forge`: deep metallic thunk (low sine 55Hz + noise burst) + shimmer.
- `nova furnace`: synthesized WebAudio score — dimensional entry tear, molten drone + quickening heartbeat as respins run out, distinct Collector/Payer/Sniper hits, finale fanfare.
- `pick`: crystalline ping (pitch by prize size).
- `gambleWin` / `gambleLose`: triumphant major arp / muted descending tone.
- `button`: soft click. `lose`: very subtle low thud (don't punish).
- Ambient: low cosmic pad loop (2 detuned sines + slow LFO, −24dB) — starts on first interaction.

## 5. Game flow / state machine (mirror of the contract)

**Standalone demo mode:** on load, try `connectGameToHost`. Race it with a 1500ms timeout — if no host, enter DEMO mode: 1,000 demo credits, local RNG (crypto.getRandomValues), full game logic in `src/engine.ts` implementing math-spec EXACTLY (this is what the judges play). DEMO badge visible. Bet sizes: 1/2/5/10/25/50/100.

**Host mode:** `connectGameToHost({setState})` → render from snapshot only (derive, don't accumulate).
- Bet: `gameData` = 1 byte artifacts bitmask (from localStorage crucible). `wager` = parseUnits-like manual: token decimals from snapshot; amount string = BigInt(amount * 10^decimals).
- `openSession({wager, gameData})` → track `sessionKey` → find session in `snapshot.sessions.items` → when `phaseName` becomes terminal SETTLED, decode `raw.gameState` (abi-encoded: stage, gridWinWad, prizes[12], picksSumWad, artifacts) — you need a minimal ABI decoder for uint8/uint256/uint16[12] (write it, ~40 lines) → animate → `revealOutcome({sessionId})`.
- Supernova in host mode: when session hits `WAITING_PLAYER_ACTION` with stage=1, show the pick UI; on 5 picks + gamble choice → `submitAction({sessionId, actionData})` where actionData = 6 raw bytes [p0..p4, gamble]. Then WAITING_RANDOMNESS (gamble) → SETTLED.
- Only enable FORJAR when `snapshot.wallet.status === 'ready'` and bridge resolved. Clamp bet with `computeMaxWager(snapshot, {maxMultiplierX: 1000})`.
- Handle refresh-mid-round: recover session from snapshot by sessionId.
- `observeGameContentSize` / `reportGameContentSize` for iframe sizing.

**Engine (`src/engine.ts`):** pure functions, no DOM:
`drawGrid(rng, artifacts) -> Uint8Array(30)`, `evaluateStep(grid, artifacts) -> {wins, patterns, stars}`, `runSpin(rng, artifacts, wager) -> SpinResult {totalWinX, steps:[...], nova: boolean}`, `playNova(rng, temple) -> {totalX, events}` (frontend/src/nova.ts). The demo UI calls these. Include the rejection-sampling RNG helpers.

**Crucible (play-session progression):** `src/crucible.ts` — localStorage `starforge-crucible-v1`: {essence, forged:[bool,bool,bool]}. Essence += totalWinX each spin. On threshold cross → forge animation + set bit. Bitmask → gameData byte AND demo engine artifacts. Reset button in the "i" panel ("Reiniciar progresión").

## 6. Info panel ("i")

Overlay explaining in ES/EN (locale from snapshot or browser): how scatter pays work, paytable table (all 7 minerals × 3 tiers), constellation patterns with mini diagrams, nova furnace rules (3+ stars, respins, collector/payer/sniper), artifacts, **RTP 97.3% steady / 94.2% fresh (3M Monte Carlo)**, "demo uses the same math as the on-chain contract", provably-fair note.

## 7. Required integrations

- **Jam widget:** `<script async src="https://jam.chain.wtf/widget.js"></script>` in `index.html` `<head>`.
- **Manifest:** `public/game.manifest.json` (gameId `StarforgeGame`, full-iframe, hostPanels all false, capabilities: openSession true, submitAction true, forfeitExpiredSession false, cancelStuckRandomness true, resize true, locales en+es). Validate with the SDK's `validateCasinoGameManifest` in a build step.
- **No wallet code.** No external assets except the widget script. No Google Fonts (system stack). Everything else bundled.

## 8. Build & output

- `npm run build` → static `dist/`. Must load near-instantly: keep total JS < 250KB, no images (all canvas/SVG), code-split nothing (single bundle fine).
- Also write `dist/game.manifest.json` (via public/).
- Deliverable when done: report `dist/` size, manifest validation result, and a 1-line `npx vite preview` smoke-test result.

## 9. Quality bar

Elite, professional, cohesive. Every button has hover/active/disabled states. No placeholder text. No console errors. Mobile: grid scales, panels collapse. This is the product the judges play — it must feel like a real game, not a demo.

Start by reading math-spec.json and the SDK sources, then scaffold. Work in ~/workspace/chain-jam/starforge/frontend/. Report milestones and any blocker with the exact resource and its state.
