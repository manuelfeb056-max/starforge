# STARFORGE — Submission Kit (Chain Jam Vol. 1, deadline 2026-09-20 23:59 UTC)

Estado (2026-09-20 14:06 UTC): ✅ ENVIADO en ambas rutas. DoraHacks registrado; jam.chain.wtf ACEPTADO — entry ID `j5770z8m01rqft44vvsxprat9d8er8js` (guardarlo; funciona desde cualquier dispositivo). Deadline extendido al 2026/09/27 10:25 según DoraHacks.

## Lo ya completado
- [x] Contrato `StarforgeGame.sol` compila (Solidity 0.8.30)
- [x] Paridad contrato/simulador 15/15; Monte Carlo 10M: RTP 93.94% / 97.59%
- [x] Frontend rebuild limpio (`tsc` + manifest válido + `vite build`)
- [x] Widget del jam incluido: `<script async src="https://jam.chain.wtf/widget.js">` (URL verificada, 200)
- [x] `game.manifest.json` válido (gameId `StarforgeGame`, modo full-iframe)
- [x] Repo público en GitHub: https://github.com/manuelfeb056-max/starforge (master sincronizado)
- [x] Juego EN VIVO en GitHub Pages: https://manuelfeb056-max.github.io/starforge/
- [x] Smoke HTTP OK (index 200, game.manifest.json 200, gameId StarforgeGame)
- [x] README.md público redactado

## Único paso pendiente — SUBMIT (requiere el Discord de Mannuel)
1. Mannuel envía su **usuario de Discord** (solo él puede darlo).
2. Con el navegador (sesión GitHub activa como manuelfeb056-max):
   - DoraHacks: https://dorahacks.io/hackathon/chain-jam-vol-1/detail → Register (seguir el hackathon).
   - jam.chain.wtf → sección 07 · submit → enviar:
     - Game URL: `https://manuelfeb056-max.github.io/starforge/`
     - Repo: `https://github.com/manuelfeb056-max/starforge`
     - Descripción: "STARFORGE — La Forja Estelar. Scatter-pay 6×5 cosmic-forge slot. Forge minerals, trigger the supernova, double or nothing. RTP 93.94–97.59% (Monte Carlo 10M, verificado)."
     - RTP: 93.94% (base) / 97.59% (con artefactos)
     - Discord: el usuario que dé Mannuel
3. El chequeo automático verifica: URL 200 + widget presente + manifest en el mismo origen.

## Reglas del submit (verificadas)
- $0 gasto, sin mints, sin transacciones reales: el juego corre en modo demo standalone + bridge al host.
- "Keep shipping until the deadline": se puede re-enviar si la URL cambia.
- Sin KYC en las reglas publicadas del jam.
- Deploy: GitHub Pages (Cloudflare Pages descartado el 2026-09-18 por falta de credencial OAuth).
