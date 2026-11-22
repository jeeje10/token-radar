# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jeeje10/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jeeje10/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Which pre-token protocol is worth farming next — and what to do about it.
A token launch radar for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

## What it does

`main.ts` reads the sealed DefiLlama snapshot (758 protocols, 14 Nov 2026),
scores every rankable pre-token protocol, and writes:

- `board.json` — 198 ranked rows: all 40 watchlist protocols plus 158 early
  ones below the floor, each with an implied value and a 6-step farm plan.
- `data.js` — the same board for the dashboard.
- `dashboard/` — a static, no-network page: sortable/filterable board,
  a detail view per protocol (model breakdown + farm plan), the calibration
  tables, and a model sandbox that re-ranks the board in the browser.
- `screenshots/` — the board, a detail view, and a filtered view.
- `dossier.json` — built with the kit's vendored `makefun-board.ts`.

## The value model

No hand-kept list of names. Every factor is derived from the snapshot itself:

```
implied = TVL × category multiple × growth × maturity × launch odds
```

- **Category multiple** — the median mcap/TVL of the live-token protocols in
  the same category (≥3 comps, else the global median 0.214×), clamped to
  [0.05, 1.5]. The market's own pricing, read from the snapshot.
- **Growth** — the 7-day TVL change, clamped to −60%…+120%, at half weight.
- **Maturity** — 0.6 + age up to 3 years × 0.4.
- **Launch odds** — the age band's own token rate: among protocols of the
  same age, the share that already record a token (26% for 0–6mo, 79% for
  3y+), damped to 0.5 + 0.5 × rate.

Live-token protocols are never ranked; the dashboard shows them apart at the
market's own values, as the comparables the multiples are calibrated from.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. Two runs write byte-identical outputs.

---

<sub>Entered on [make.fun](https://make.fun/?ref=a46mdp44&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
