# ElementSynergies
Legacy of spirit stones

A vertical-slice prototype of a free-form, same-color chain-connect puzzle (inspired by the mobile game *Spirit Stones*) wired to minimal RPG combat: drag chains of hex-adjacent same-color stones to damage a monster. Built with Phaser 3, TypeScript, and Vite.

See `docs/superpowers/specs/2026-07-05-spirit-stones-puzzle-design.md` for the full design spec.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed localhost URL. Add `?seed=N` to the URL for a reproducible board.

## Scripts

```bash
npm run dev          # start the Vite dev server
npm run build        # production build
npm test             # run unit tests (Vitest)
npm run test:watch   # unit tests in watch mode
npm run test:e2e     # run e2e tests (Playwright)
```
