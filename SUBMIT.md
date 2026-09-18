# STARFORGE — Submission Kit (Chain Jam Vol. 1, deadline 2026-09-20 23:59 UTC)

Estado del código (2026-09-18 ~12:25 UTC): TODO LISTO. Faltan solo 3 acciones que requieren a Mannuel / navegador.

## Lo ya completado
- [x] Contrato `StarforgeGame.sol` compila (Solidity 0.8.30)
- [x] Paridad contrato/simulador 15/15; Monte Carlo 10M: RTP 93.94% / 97.59%
- [x] Frontend rebuild limpio (`tsc` + manifest válido + `vite build`)
- [x] Widget del jam incluido: `<script async src="https://jam.chain.wtf/widget.js">` (URL verificada, 200)
- [x] `game.manifest.json` válido (gameId `StarforgeGame`, modo full-iframe)
- [x] Smoke host OK (demo fallback 1508ms, ABI round-trips OK)
- [x] Smoke HTTP OK (index/manifest/JS/CSS = 200)
- [x] Repo git local commiteado y limpio: `~/workspace/chain-jam/starforge/`
- [x] README.md público redactado

## PASO 1 — GitHub (requiere a Mannuel, ~2 min)
En la VM, Mannuel ejecuta:
```
gh auth login        # flujo device: abre github.com/login/device e ingresa el código
```
Luego (ya preparado, un solo comando):
```
cd ~/workspace/chain-jam/starforge && gh repo create starforge --public --source=. --push
```
Repo sugerido: `starforge` (público). Contiene contracts/, docs/, simulator/, frontend/, math-spec.json, README.md.

## PASO 2 — Cloudflare Pages (requiere a Mannuel, ~3 min)
```
npx -y wrangler login                                  # OAuth en navegador
cd ~/workspace/chain-jam/starforge/frontend
npx -y wrangler pages deploy dist --project-name starforge
```
Resultado: `https://starforge.pages.dev` (HTTPS, sirve game.manifest.json sin config).

## PASO 3 — Submit (requiere tarea de navegador, la hace el agente principal)
1. DoraHacks: https://dorahacks.io/hackathon/chain-jam-vol-1/detail → Register (seguir el hackathon).
2. jam.chain.wtf → sección 07 · submit → enviar:
   - Game URL: `https://starforge.pages.dev`
   - Repo: URL del repo público del paso 1
   - Descripción: "STARFORGE — La Forja Estelar. Scatter-pay 6×5 cosmic-forge slot. Forge minerals, trigger the supernova, double or nothing. RTP 93.94–97.59% (Monte Carlo 10M, verificado)."
   - RTP: 93.94% (base) / 97.59% (con artefactos)
3. El chequeo automático verifica: URL 200 + widget presente + manifest en el mismo origen.

## PLAN B — dominio propio (solo si el chequeo rechaza *.pages.dev)
Mannuel crea en su DNS: `chainjam.ahryz.com` → CNAME → `starforge.pages.dev`.
Luego en Cloudflare Pages: Custom domain → `chainjam.ahryz.com`. Re-enviar el submit.
NO usar monkeyverses.com para nada (orden de Mannuel 2026-09-18).

## Reglas del submit (verificadas)
- $0 gasto, sin mints, sin transacciones reales: el juego corre en modo demo standalone + bridge al host.
- "Keep shipping until the deadline": se puede re-enviar si la URL cambia.
- Sin KYC en las reglas publicadas del jam.
