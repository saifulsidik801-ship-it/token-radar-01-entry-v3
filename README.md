# token-radar-01-entry-v3

[![Competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/saifulsidik801-ship-it/token-radar-01-entry-v3/rank.svg)](https://make.fun/leaderboard/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/saifulsidik801-ship-it/token-radar-01-entry-v3/reward.svg)](https://make.fun/bounty/token-radar-01)

Token Radar C3 — a fitted-value radar for pre-token protocols, built for make.fun's
"Build the best token launch radar" bounty ($1,325 in USDC). It ranks 198 pre-token
protocols by one fitted value and gives every one a costed, mechanism-aware farm plan.

## The model

One formula, fitted on the 128 traded tokens of the sealed snapshot:

```
value = 10 ^ (7.238 + 0.515 * log10(TVL / $100M) + family offset)
```

L1 (median) regression, trimmed once at |residual| > 1.5 dex and refit; family offsets
are median residuals, shrunk n/(n+8) and clipped at ±1 dex. No per-family slopes, no
residual features, no growth/seasoning tilts: each was tested locally and made the
out-of-sample miss worse. The variants table on the board proves it:

| Variant | LOO median miss |
| --- | --- |
| M0 multiple only | 3.94× |
| M1 + size curve | 3.40× |
| M2 + family offsets | 3.20× |
| M3 C3 (shipped) | 2.99× |

Honesty apparatus, all computed: Spearman 0.394 (8-fold mean), walk-forward 3.24×
(split 2024-02-18), 200 seeded bootstrap refits with a P25–P75 value band and a
P10–P90 rank range per row, launch odds at 5-fold AUC 0.600 (stated as weak). The
dashboard refits the curve from the raw snapshot in your browser and re-derives
every board value — 198/198 verified, counted from the rows, not asserted.

## Farm plans

Deposit = clamp(max(TVL/10,000, 3 × fixed costs), $500, $5,000). Chain = cheapest of
the protocol's own chains by gas. Funding = the chain's native coin when you already
hold it, else USDC — no bridge legs. Slice = 10% × implied value × deposit/TVL.
Costs = gas + income forgone against a 4% T-bill. Break-even = costs / slice. Verdict:
FARM when the launch odds beat break-even by 10 points or more (and break-even ≤ 25%),
MARGINAL near break-even, else SKIP. Verdicts on this board: 91 FARM / 80 MARGINAL /
27 SKIP. Top three by implied value: Bittensor dTAO $63.8M, Polymarket International
$58.8M, Hive Protocol $50.1M.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only, no network. Writes `board.json` (198 rows), `data.js`,
`dashboard/` and `screenshots/` (4 images) to the output directory, then `dossier.json`
via the vendored make.fun library. Both runs write the same bytes.

---

Built for [make.fun](https://make.fun/?ref=mxhczr02) — referral code `mxhczr02`.
