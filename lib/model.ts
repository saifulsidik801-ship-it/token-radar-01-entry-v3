// Token Radar v3 — model C3: one fitted-value formula plus the honesty apparatus.
//
//   value = 10 ^ (a + b * log10(TVL / $100M) + family offset)
//
// a and b come from an L1 (median) regression of log10(market cap) on log10(TVL),
// fitted once on the traded tokens, trimmed once at |residual| > 1.5 dex and refit.
// Family offsets are MEDIAN residuals per family, shrunk n/(n+8) and clipped at +-1 dex.
// No per-family slopes, no residual features, no growth/seasoning tilts: every one of
// those was tested locally and made the out-of-sample miss worse, and this file says so.
//
// The board ranks pre-token protocols only. Traded tokens are anchors: they fit the
// curve, they never enter the ranked board. Every number the board asserts is computed
// here from the sealed snapshot and re-derived in the browser by dashboard/model.js.

/** One protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted curve: a and b, the family offsets, and how many traded tokens fit it. */
export interface CurveFit {
  a: number;
  b: number;
  offsets: Record<string, number>;
  n: number;
  trimmed: number;
}

/** One row of the variants table: what the variant adds and what it costs out of sample. */
export interface VariantRow {
  name: string;
  adds: string;
  looX: number;
  meanLog: number;
  rho: number;
}

/** The honesty apparatus, computed here and shown on the board. */
export interface Method {
  a: number;
  b: number;
  offsets: Record<string, number>;
  variants: VariantRow[];
  spearmanFolds: number[];
  spearmanMean: number;
  walkForwardX: number;
  walkForwardRho: number;
  walkForwardSplit: string;
  bootstrapN: number;
  launchOddsAuc: number;
  launchOddsFolds: number[];
  rankMoves5: number;
  rankMoves10: number;
  rankedN: number;
  tradedN: number;
  noTokenN: number;
  tokenNoMcapN: number;
  setAsideN: number;
  topChains: { chain: string; tvl: number }[];
}

/** One ranked board row (the gate's shape). */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** One ranked row with everything the dashboard shows. */
export interface RadarRow {
  slug: string;
  name: string;
  category: string | null;
  family: string;
  chains: string[];
  tvl: number;
  chg7d: number | null;
  ageDays: number;
  rank: number;
  value: number;
  lo: number;
  hi: number;
  rankLo: number;
  rankHi: number;
  launchOdds: number;
  deposit: number;
  costs: number;
  slice: number;
  breakEven: number;
  net: number;
  verdict: string;
  chain: string;
  gasUsd: number;
  holdWeeks: number;
  steps: string[];
  onWatchlist: boolean;
}

/** One traded anchor row. */
export interface LiveRow {
  slug: string;
  name: string;
  family: string;
  tvl: number;
  mcap: number;
  xTvl: number;
  curve: number;
  marketOverCurve: number;
}

/** Everything the dashboard needs, shipped as /output/data.js. */
export interface RadarData {
  asOf: string;
  floorUsd: number;
  method: Method;
  rows: RadarRow[];
  live: LiveRow[];
  setAside: { slug: string; name: string; reason: string }[];
  verdictCounts: Record<string, number>;
  familyCounts: Record<string, number>;
  snapshot: [string, string, string | null, string[], number, number | null, number | null, string | null][];
}

export const MODEL_VERSION = 'radar-c3';
export const SEED = 20261119;
export const TRIM_DEX = 1.5;
export const SHRINK_K = 8;
export const OFFSET_CLIP = 1.0;

/** The eight families, from the snapshot's own categories. */
export const FAMMAP: Record<string, string> = {
  Lending: 'lend', CDP: 'lend', 'CDP Manager': 'lend', 'Uncollateralized Lending': 'lend',
  'Collateral Management': 'lend', 'Collateral Markets': 'lend', 'Basis Trading': 'lend',
  'Leveraged Farming': 'lend', Dexs: 'trade', Derivatives: 'trade', 'Prediction Market': 'trade',
  Options: 'trade', 'Options Vault': 'trade', Synthetics: 'trade',
  'Interest Rate Derivatives': 'trade', 'OTC Marketplace': 'trade', 'NFT Marketplace': 'trade',
  'Liquidity Manager': 'trade', Yield: 'vault', 'Yield Aggregator': 'vault', Farm: 'vault',
  Indexes: 'vault', 'Risk Curators': 'vault', 'Onchain Capital Allocator': 'vault',
  'Token Locker': 'vault', RWA: 'rwa', 'Reserve Currency': 'rwa', 'Algo-Stables': 'rwa',
  'Dual-Token Stablecoin': 'rwa', 'Stablecoin Issuer': 'rwa', 'Stablecoin Wrapper': 'rwa',
  'Anchor BTC': 'rwa', 'Decentralized BTC': 'rwa', 'Restaked BTC': 'rwa', CeDeFi: 'rwa',
  'Crypto Card Issuer': 'rwa', Payments: 'rwa', 'Liquid Staking': 'stake', 'Staking Pool': 'stake',
  'Liquid Restaking': 'stake', Restaking: 'stake', Bridge: 'infra', 'Cross Chain Bridge': 'infra',
  'Canonical Bridge': 'infra', Chain: 'infra', CEX: 'cex', Launchpad: 'cex',
};

export const FAMILIES = ['lend', 'trade', 'vault', 'rwa', 'stake', 'infra', 'cex', 'other'];

/** Deposit yield assumed per family (income forgone is priced against a 4% T-bill). */
export const FAMILY_YIELD: Record<string, number> = {
  lend: 0.03, trade: 0.02, vault: 0.05, rwa: 0.04, stake: 0.04, infra: 0, cex: 0, other: 0.01,
};

/** Gas per transaction in USD, by chain (what the plan actually pays). */
export const GAS_USD: Record<string, number> = {
  Solana: 0.01, Hyperliquid: 0.01, Near: 0.01, Sui: 0.02, Aptos: 0.02, Sei: 0.02,
  Zora: 0.02, Monad: 0.02, MegaETH: 0.02, Base: 0.03, Unichain: 0.03, 'World Chain': 0.03,
  Ink: 0.03, Mode: 0.03, Fraxtal: 0.03, Optimism: 0.05, Polygon: 0.05, Blast: 0.05,
  Linea: 0.05, Gnosis: 0.05, Mantle: 0.05, Cosmos: 0.05, Osmosis: 0.05, Sonic: 0.05,
  Berachain: 0.05, Arbitrum: 0.08, Scroll: 0.08, zkSync: 0.08, Starknet: 0.1, BSC: 0.15,
  Avalanche: 0.2, Tron: 0.3, Cronos: 0.1, Fantom: 0.1, Ethereum: 3.5,
};

export const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
export const SET_ASIDE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
export const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
export const WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;

export function median(v: number[]): number {
  const s = [...v].sort((x, y) => x - y);
  const n = s.length;
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

export function mean(v: number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function logTvl(p: SnapshotProtocol): number {
  return Math.log10(Math.max(1, p.tvl_usd) / 1e8);
}

export function logMcap(p: SnapshotProtocol): number {
  return Math.log10(Math.max(1, p.mcap_usd ?? 0));
}

export function famOf(p: SnapshotProtocol): string {
  return FAMMAP[p.category ?? ''] ?? 'other';
}

export function ageDays(asOf: string, listedAt: string | null): number {
  if (!listedAt) return 365;
  const a = Date.parse(asOf.slice(0, 10));
  const b = Date.parse(listedAt.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return 365;
  return Math.max(0, Math.round((a - b) / 86400000));
}

/** Spearman's rho with average ranks for ties. */
export function spearman(xs: number[], ys: number[]): number {
  const ranks = (v: number[]): number[] => {
    const order = v.map((_, i) => i).sort((i, j) => v[i]! - v[j]!);
    const r = new Array<number>(v.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]!] === v[order[i]!]) j++;
      const avg = (i + j) / 2;
      for (let k = i; k <= j; k++) r[order[k]!] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Ordinary least squares y = a + b*x. */
export function ols(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return [my - b * mx, b];
}

/** Median (L1) regression y = a + b*x by iteratively reweighted least squares. */
export function l1Line(xs: number[], ys: number[], iters = 300): [number, number] {
  let [a, b] = ols(xs, ys);
  for (let k = 0; k < iters; k++) {
    const w = xs.map((x, i) => 1 / Math.max(Math.abs(ys[i]! - (a + b * x)), 0.05));
    const sw = w.reduce((s, v) => s + v, 0);
    const mx = w.reduce((s, wi, i) => s + wi * xs[i]!, 0) / sw;
    const my = w.reduce((s, wi, i) => s + wi * ys[i]!, 0) / sw;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxx += w[i]! * (xs[i]! - mx) ** 2;
      sxy += w[i]! * (xs[i]! - mx) * (ys[i]! - my);
    }
    const b2 = sxx === 0 ? b : sxy / sxx;
    const a2 = my - b2 * mx;
    if (Math.abs(a2 - a) < 1e-9 && Math.abs(b2 - b) < 1e-9) {
      a = a2;
      b = b2;
      break;
    }
    a = a2;
    b = b2;
  }
  return [a, b];
}

/** Seeded PRNG (mulberry32): every refit is reproducible, both runs write the same bytes. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r = (r + Math.imul(r ^ (r >>> 7), r | 61)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

// ---------------------------------------------------------------- fitting

/** Family offsets from residuals: median per family, shrunk n/(n+8), clipped at +-1 dex. */
export function familyOffsets(
  train: SnapshotProtocol[],
  a: number,
  b: number,
  useMedian: boolean,
): Record<string, number> {
  const res: Record<string, number[]> = {};
  for (const p of train) {
    const f = famOf(p);
    (res[f] ??= []).push(logMcap(p) - (a + b * logTvl(p)));
  }
  const off: Record<string, number> = {};
  for (const f of Object.keys(res)) {
    const rs = res[f]!;
    const m = useMedian ? median(rs) : mean(rs);
    off[f] = clamp(m * (rs.length / (rs.length + SHRINK_K)), -OFFSET_CLIP, OFFSET_CLIP);
  }
  return off;
}

/** Fit the C3 curve on a traded set: L1 line, trim |resid| > 1.5 dex once, refit L1. */
export function fitC3(train: SnapshotProtocol[]): CurveFit {
  const xs = train.map(logTvl);
  const ys = train.map(logMcap);
  let [a, b] = l1Line(xs, ys);
  const keep = train.filter((p) => Math.abs(logMcap(p) - (a + b * logTvl(p))) <= TRIM_DEX);
  const trimmed = train.length - keep.length;
  [a, b] = l1Line(keep.map(logTvl), keep.map(logMcap));
  const off = familyOffsets(keep, a, b, true);
  return { a, b, offsets: off, n: keep.length, trimmed };
}

/** Fit the V2 curve (OLS + mean offsets) — the reference the variants table beats. */
export function fitV2(train: SnapshotProtocol[]): CurveFit {
  const [a, b] = ols(train.map(logTvl), train.map(logMcap));
  const off = familyOffsets(train, a, b, false);
  return { a, b, offsets: off, n: train.length, trimmed: 0 };
}

/** Fit the plain V1 curve (OLS, no family) — the first step of the variants table. */
export function fitV1(train: SnapshotProtocol[]): CurveFit {
  const [a, b] = ols(train.map(logTvl), train.map(logMcap));
  return { a, b, offsets: {}, n: train.length, trimmed: 0 };
}

export function predict(fit: CurveFit, p: SnapshotProtocol): number {
  return fit.a + fit.b * logTvl(p) + (fit.offsets[famOf(p)] ?? 0);
}

/** Leave-one-out median miss (as a multiple), mean |log miss| and Spearman, for one fitter. */
export function looEval(
  traded: SnapshotProtocol[],
  fitter: (train: SnapshotProtocol[]) => CurveFit,
): { looX: number; meanLog: number; rho: number } {
  const misses: number[] = [];
  const preds: number[] = [];
  const acts: number[] = [];
  for (let i = 0; i < traded.length; i++) {
    const train = traded.slice(0, i).concat(traded.slice(i + 1));
    const fit = fitter(train);
    const p = traded[i]!;
    const lp = predict(fit, p);
    misses.push(Math.abs(lp - logMcap(p)));
    preds.push(lp);
    acts.push(logMcap(p));
  }
  return { looX: 10 ** median(misses), meanLog: mean(misses), rho: spearman(preds, acts) };
}

/** The multiple-only baseline: predict every mcap as the median traded mcap. */
export function looMultiple(traded: SnapshotProtocol[]): { looX: number; meanLog: number; rho: number } {
  const misses: number[] = [];
  const preds: number[] = [];
  const acts: number[] = [];
  for (let i = 0; i < traded.length; i++) {
    const train = traded.slice(0, i).concat(traded.slice(i + 1));
    const med = median(train.map(logMcap));
    const p = traded[i]!;
    misses.push(Math.abs(med - logMcap(p)));
    preds.push(med);
    acts.push(logMcap(p));
  }
  // A constant prediction has no rank order: its Spearman is 0 by construction, not the
  // noise the near-identical leave-one-out medians would correlate by chance.
  return { looX: 10 ** median(misses), meanLog: mean(misses), rho: 0 };
}

/** Spearman's rho inside each of 8 fixed folds (j % 8), one fit per fold, averaged. */
export function spearmanFolds(
  traded: SnapshotProtocol[],
  fitter: (train: SnapshotProtocol[]) => CurveFit,
): { folds: number[]; mean: number } {
  const folds: number[] = [];
  for (let j = 0; j < 8; j++) {
    const te = traded.filter((_, i) => i % 8 === j);
    const tr = traded.filter((_, i) => i % 8 !== j);
    const fit = fitter(tr);
    folds.push(spearman(te.map((p) => predict(fit, p)), te.map(logMcap)));
  }
  return { folds, mean: mean(folds) };
}

/** Walk-forward: fit on tokens listed before the median listed date, test on the rest. */
export function walkForward(
  traded: SnapshotProtocol[],
  fitter: (train: SnapshotProtocol[]) => CurveFit,
): { wfX: number; rho: number; split: string } {
  const dated = traded
    .filter((p) => p.listed_at)
    .map((p) => ({ p, day: Date.parse(p.listed_at!.slice(0, 10)) }))
    .sort((x, y) => x.day - y.day);
  const mid = dated[Math.floor(dated.length / 2)]!.day;
  const tr = dated.filter((d) => d.day < mid).map((d) => d.p);
  const te = dated.filter((d) => d.day >= mid).map((d) => d.p);
  const fit = fitter(tr);
  const misses = te.map((p) => Math.abs(predict(fit, p) - logMcap(p)));
  return {
    wfX: 10 ** median(misses),
    rho: spearman(te.map((p) => predict(fit, p)), te.map(logMcap)),
    split: new Date(mid).toISOString().slice(0, 10),
  };
}

/**
 * Bootstrap: 200 seeded refits of C3 on resampled traded tokens. For each ranked row,
 * the band is P25–P75 of the refit values and the rank range is P10–P90 of its rank.
 * Returns, per ranked slug, [lo, hi, rankLo, rankHi].
 */
export function bootstrapBands(
  traded: SnapshotProtocol[],
  ranked: SnapshotProtocol[],
  n = 200,
): Map<string, [number, number, number, number]> {
  const rnd = mulberry32(SEED);
  const values: Map<string, number[]> = new Map();
  const ranks: Map<string, number[]> = new Map();
  for (const p of ranked) {
    values.set(p.slug, []);
    ranks.set(p.slug, []);
  }
  for (let k = 0; k < n; k++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < traded.length; i++) sample.push(traded[Math.floor(rnd() * traded.length)]!);
    const fit = fitC3(sample);
    const scored = ranked
      .map((p) => ({ slug: p.slug, v: 10 ** predict(fit, p) }))
      .sort((x, y) => y.v - x.v || (x.slug < y.slug ? -1 : 1));
    scored.forEach((s, i) => {
      values.get(s.slug)!.push(s.v);
      ranks.get(s.slug)!.push(i + 1);
    });
  }
  const pct = (v: number[], q: number): number => {
    const s = [...v].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]!;
  };
  const out = new Map<string, [number, number, number, number]>();
  for (const p of ranked) {
    const vs = values.get(p.slug)!;
    const rs = ranks.get(p.slug)!;
    out.set(p.slug, [pct(vs, 0.25), pct(vs, 0.75), pct(rs, 0.1), pct(rs, 0.9)]);
  }
  return out;
}

// ---------------------------------------------------------------- launch odds + universe

/** Standardised logistic launch odds, judged by 5-fold AUC only. Weak, and stated as weak. */
export function launchOddsModel(
  protos: SnapshotProtocol[],
): { predict: (p: SnapshotProtocol) => number; auc: number; folds: number[] } {
  const feat = (p: SnapshotProtocol): [number, number, number] => [
    Math.log10(Math.max(1, p.tvl_usd)),
    Math.log10(Math.max(1, p.chains.length)),
    clamp((p.change_7d ?? 0) / 100, -0.5, 0.5),
  ];
  const X = protos.map(feat);
  const y = protos.map((p) => ((p.mcap_usd ?? 0) > 0 ? 1 : 0));
  const mu = [0, 1, 2].map((j) => mean(X.map((r) => r[j]!)));
  const sd = [0, 1, 2].map((j) => {
    const v = Math.sqrt(mean(X.map((r) => (r[j]! - mu[j]!) ** 2)));
    return v === 0 ? 1 : v;
  });
  const Xs = X.map((r) => r.map((v, j) => (v - mu[j]!) / sd[j]!) as [number, number, number]);
  const rnd = mulberry32(SEED + 7);
  const idx = protos.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const aucOf = (scores: number[], labels: number[]): number => {
    const pairs = scores.map((s, i) => [s, labels[i]!] as const).sort((a, b) => b[0] - a[0]);
    const pos = labels.reduce((s, v) => s + v, 0);
    const neg = labels.length - pos;
    let tp = 0;
    let fp = 0;
    let area = 0;
    let px = 0;
    let py = 0;
    for (const [, l] of pairs) {
      if (l === 1) tp++;
      else fp++;
      const x = fp / neg;
      const yy = tp / pos;
      area += (x - px) * (yy + py) / 2;
      px = x;
      py = yy;
    }
    return area;
  };
  const folds: number[] = [];
  let wFull = [0, 0, 0, 0];
  for (let fold = 0; fold < 5; fold++) {
    const te = idx.filter((_, k) => k % 5 === fold);
    const teSet = new Set(te);
    const tr = idx.filter((i) => !teSet.has(i));
    let w = [0, 0, 0, 0];
    const Xtr = tr.map((i) => [1, ...Xs[i]!] as [number, number, number, number]);
    const ytr = tr.map((i) => y[i]!);
    for (let step = 0; step < 800; step++) {
      const grad = [0, 0, 0, 0];
      for (let k = 0; k < Xtr.length; k++) {
        const xi = Xtr[k]!;
        const pr = sigmoid(xi.reduce((s, v, j) => s + w[j]! * v, 0));
        for (let j = 0; j < 4; j++) grad[j] += (pr - ytr[k]!) * xi[j]!;
      }
      for (let j = 0; j < 4; j++) w[j] -= (0.5 * grad[j]!) / Xtr.length;
    }
    const sc = te.map((i) => sigmoid([1, ...Xs[i]!].reduce((s, v, j) => s + w[j]! * v, 0)));
    folds.push(aucOf(sc, te.map((i) => y[i]!)));
    if (fold === 0) wFull = w;
  }
  // Refit on all protocols for the shipped predictor.
  {
    let w = [0, 0, 0, 0];
    const Xa = protos.map((_, i) => [1, ...Xs[i]!] as [number, number, number, number]);
    for (let step = 0; step < 800; step++) {
      const grad = [0, 0, 0, 0];
      for (let k = 0; k < Xa.length; k++) {
        const xi = Xa[k]!;
        const pr = sigmoid(xi.reduce((s, v, j) => s + w[j]! * v, 0));
        for (let j = 0; j < 4; j++) grad[j] += (pr - y[k]!) * xi[j]!;
      }
      for (let j = 0; j < 4; j++) w[j] -= (0.5 * grad[j]!) / Xa.length;
    }
    wFull = w;
  }
  const predict = (p: SnapshotProtocol): number => {
    const f = feat(p).map((v, j) => (v - mu[j]!) / sd[j]!);
    return sigmoid([1, ...f].reduce((s, v, j) => s + wFull[j]! * v, 0));
  };
  return { predict, auc: mean(folds), folds };
}

/** A protocol records a token when any of the three token fields is set. */
export function hasToken(p: SnapshotProtocol): boolean {
  return (p.mcap_usd ?? 0) > 0 || p.gecko_id !== null || p.symbol !== null;
}

/** Why a no-token protocol is set aside (not ranked), or null when it is rankable. */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (VERSION_RE.test(p.name)) return 'versioned name (V2 / 2.0 product of a protocol that already trades)';
  if (WRAPPED_RE.test(p.name)) return 'wrapped / staked / staking product of a token that already trades';
  if (p.category && SET_ASIDE_CATEGORIES.includes(p.category)) return `category ${p.category} is a wrapped, staked or bridged product`;
  for (const ex of EXCHANGE_NAMES) {
    if (p.name.startsWith(ex)) return `named after the ${ex} exchange`;
  }
  return null;
}

/** Rankable = records no token and carries no set-aside reason. */
export function isRankable(p: SnapshotProtocol): boolean {
  return !hasToken(p) && setAsideReason(p) === null;
}

/** How many ranked rows move >=5 / >=10 ranks when the family offsets are removed. */
export function rankMoves(
  traded: SnapshotProtocol[],
  ranked: SnapshotProtocol[],
  fit: CurveFit,
): { moves5: number; moves10: number } {
  const withOff = ranked
    .map((p) => ({ slug: p.slug, v: 10 ** predict(fit, p) }))
    .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
  const plain: CurveFit = { a: fit.a, b: fit.b, offsets: {}, n: fit.n, trimmed: fit.trimmed };
  const noOff = ranked
    .map((p) => ({ slug: p.slug, v: 10 ** predict(plain, p) }))
    .sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
  const rankOf = (rows: { slug: string }[]): Map<string, number> => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.slug, i + 1));
    return m;
  };
  const r1 = rankOf(withOff);
  const r2 = rankOf(noOff);
  let m5 = 0;
  let m10 = 0;
  for (const p of ranked) {
    const d = Math.abs(r1.get(p.slug)! - r2.get(p.slug)!);
    if (d >= 5) m5++;
    if (d >= 10) m10++;
  }
  return { moves5: m5, moves10: m10 };
}

// ---------------------------------------------------------------- farm plans

/** Cheapest gas chain among a protocol's own chains (USD per tx). */
export function cheapestChain(p: SnapshotProtocol): { chain: string; gas: number } {
  let best = { chain: p.chains[0] ?? 'Ethereum', gas: GAS_USD[p.chains[0] ?? ''] ?? 0.5 };
  for (const c of p.chains) {
    const g = GAS_USD[c] ?? 0.5;
    if (g < best.gas) best = { chain: c, gas: g };
  }
  return best;
}

/** What the deposit is held in: native coin when you already hold it, else USDC. */
export function fundingAsset(p: SnapshotProtocol, chain: string): string {
  const fam = famOf(p);
  if (fam === 'stake') return `${chain} native coin (you already hold it — no bridge, no swap)`;
  if (chain === 'Solana') return 'SOL (you already hold it — no bridge, no swap)';
  if (chain === 'Sui') return 'SUI (you already hold it — no bridge, no swap)';
  if (chain === 'Aptos') return 'APT (you already hold it — no bridge, no swap)';
  if (chain === 'Near') return 'NEAR (you already hold it — no bridge, no swap)';
  if (chain === 'Bittensor') return 'TAO (you already hold it — no bridge, no swap)';
  return 'USDC on ' + chain;
}

/** The mechanism-specific core action, per family. */
export function coreAction(p: SnapshotProtocol, chain: string): string {
  const fam = famOf(p);
  const n = p.name;
  switch (fam) {
    case 'lend':
      return `Supply ${fundingAsset(p, chain)} to ${n}'s lending market and borrow a small amount against it so the position stays active`;
    case 'trade':
      return `Provide liquidity in ${n}'s main pool on ${chain} (or open a small position if it is a perps market) and keep weekly volume`;
    case 'vault':
      return `Deposit into ${n}'s vault on ${chain} and leave the receipt token in place for the whole hold`;
    case 'rwa':
      return `Mint or deposit into ${n}'s RWA vault on ${chain} and hold the receipt token for the whole hold`;
    case 'stake':
      return `Stake ${chain} native coin with ${n} and keep it staked for the whole hold`;
    case 'infra':
      return `Use ${n} on ${chain} every week — bridge a small amount or run one real transaction, never a wash trade`;
    case 'cex':
      return `Complete KYC on ${n} on day 3, deposit, and trade a small amount every week`;
    default:
      return `Use ${n}'s core action on ${chain} every week and keep the position open for the whole hold`;
  }
}

export interface Plan {
  deposit: number;
  costs: number;
  slice: number;
  breakEven: number;
  net: number;
  verdict: string;
  chain: string;
  gasUsd: number;
  holdWeeks: number;
  steps: string[];
}

const fmtUsd = (x: number): string =>
  x >= 1000 ? `$${Math.round(x).toLocaleString('en-US')}` : `$${x.toFixed(x < 10 ? 2 : 0)}`;
const fmtPct = (x: number): string => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/**
 * Cost a farm plan to the dollar. Deposit = clamp(max(TVL/10k, 3x fixed), $500, $5,000).
 * Slice = 10% x implied value x deposit/TVL. Costs = gas + income forgone.
 * Break-even = costs / slice: the launch chance that pays the plan. Verdict on expected
 * value with a margin of safety: FARM when the launch odds beat the break-even chance
 * by 10 points or more (net > 10% of the slice) and break-even <= 25%, MARGINAL when the
 * plan is near break-even, else SKIP; a 7-day TVL fall past -30% caps farm at marginal.
 */
export function farmPlan(
  p: SnapshotProtocol,
  value: number,
  launchOdds: number,
  asOf: string,
): Plan {
  const { chain, gas } = cheapestChain(p);
  const age = ageDays(asOf, p.listed_at);
  const holdWeeks = age < 180 ? 12 : age < 540 ? 9 : 6;
  const holdDays = holdWeeks * 7;
  const gasTotal = gas * 4;
  const fixed = gasTotal + 12;
  const deposit = clamp(Math.max(p.tvl_usd / 10000, 3 * fixed), 500, 5000);
  const yieldGap = Math.max(0, 0.04 - (FAMILY_YIELD[famOf(p)] ?? 0));
  const forgone = deposit * yieldGap * (holdDays / 365);
  const costs = gasTotal + forgone;
  const slice = 0.1 * value * (deposit / Math.max(1, p.tvl_usd));
  const breakEven = slice > 0 ? costs / slice : 1;
  const net = slice * launchOdds - costs;
  // Verdict on expected value with a margin of safety: FARM when the estimated launch
  // chance beats the break-even chance by 10 points or more (net > 10% of the slice)
  // without needing an implausible launch chance (break-even <= 25%). Near break-even
  // is marginal; the rest is a skip.
  let verdict =
    net > 0.1 * slice && breakEven <= 0.25 ? 'FARM' : net > -0.5 * costs ? 'MARGINAL' : 'SKIP';
  if (verdict === 'FARM' && (p.change_7d ?? 0) < -30) verdict = 'MARGINAL'; // change_7d is in per cent
  const asset = fundingAsset(p, chain);
  const stopPct = clamp(2 * Math.abs((p.change_7d ?? 5) / 100), 0.1, 0.35); // change_7d is in per cent
  const steps = [
    `Day 1: open ${p.name} on ${chain} (gas ${fmtUsd(gas)}/tx, ${fmtUsd(gasTotal)} for 4 tx) and confirm the contract address from the project's own docs, never a search result.`,
    `Day 1: deposit ${fmtUsd(deposit)} of ${asset}; this is the plan's whole exposure — no top-ups, no second wallet.`,
    `Day 2: ${coreAction(p, chain)}; log the position (deposit, chain, date) so the exit is mechanical, not a guess.`,
    `Day 3: complete KYC if ${p.name} asks for it; a plan that skips KYC cannot claim, so do it now, not at the deadline.`,
    `Weeks 1-${holdWeeks}: keep the position untouched; check TVL once a week. If TVL closes ${(stopPct * 100).toFixed(0)}% below your entry level, or withdrawals pause, withdraw at once.`,
    `Hold ${holdWeeks} weeks (${holdDays} days): income forgone ${fmtUsd(forgone)} at a 4% T-bill rate — the plan's real cost beside gas.`,
    `Day ${holdDays - 14}: start unbonding or queue the withdrawal 14 days before exit so lock-ups cannot trap the deposit.`,
    `Exit: claim only through ${p.name}'s bookmarked domain. Expected slice ${fmtUsd(slice)} at a 10% allocation share; break-even launch chance ${fmtPct(breakEven)}; expected net ${net >= 0 ? '+' : '-'}${fmtUsd(Math.abs(net))} at ${fmtPct(launchOdds)} launch odds.`,
  ];
  return { deposit, costs, slice, breakEven, net, verdict, chain, gasUsd: gas, holdWeeks, steps };
}

// ---------------------------------------------------------------- build + output

export function parseSnapshot(text: string): Snapshot {
  const d = JSON.parse(text) as Snapshot;
  if (!Array.isArray(d.protocols) || !Array.isArray(d.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return d;
}

/** The ranked board plus everything the dashboard shows. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const protos = snapshot.protocols;
  const traded = protos.filter((p) => (p.mcap_usd ?? 0) > 0 && (p.tvl_usd ?? 0) > 0);
  const ranked = protos.filter(isRankable);
  const setAside = protos
    .filter((p) => !hasToken(p) && !isRankable(p))
    .map((p) => ({ slug: p.slug, name: p.name, reason: setAsideReason(p) ?? 'not ranked' }));
  const tokenNoMcap = protos.filter((p) => (p.mcap_usd ?? 0) <= 0 && (p.gecko_id !== null || p.symbol !== null)).length;
  const noTokenN = protos.filter((p) => !hasToken(p)).length;

  // Variants table: each step must earn its keep out of sample.
  const vMult = looMultiple(traded);
  const v1 = looEval(traded, fitV1);
  const v2 = looEval(traded, fitV2);
  const v3 = looEval(traded, fitC3);
  const variants: VariantRow[] = [
    { name: 'M0 multiple only', adds: 'median traded mcap, no TVL', looX: vMult.looX, meanLog: vMult.meanLog, rho: vMult.rho },
    { name: 'M1 + size curve', adds: 'log10 mcap on log10 TVL', looX: v1.looX, meanLog: v1.meanLog, rho: v1.rho },
    { name: 'M2 + family offsets', adds: 'mean residual per family, shrunk K=8, clipped +-1', looX: v2.looX, meanLog: v2.meanLog, rho: v2.rho },
    { name: 'M3 C3 (shipped)', adds: 'median offsets + trimmed 1.5 dex + L1 curve', looX: v3.looX, meanLog: v3.meanLog, rho: v3.rho },
  ];
  const sp = spearmanFolds(traded, fitC3);
  const wf = walkForward(traded, fitC3);
  const fit = fitC3(traded);
  const odds = launchOddsModel(protos);
  const moves = rankMoves(traded, ranked, fit);
  const bands = bootstrapBands(traded, ranked);

  // Top chains by TVL (for the method section).
  const chainTvl = new Map<string, number>();
  for (const p of protos) {
    for (const c of p.chains) chainTvl.set(c, (chainTvl.get(c) ?? 0) + p.tvl_usd);
  }
  const topChains = [...chainTvl.entries()]
    .map(([chain, tvl]) => ({ chain, tvl }))
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 3);

  const method: Method = {
    a: fit.a,
    b: fit.b,
    offsets: fit.offsets,
    variants,
    spearmanFolds: sp.folds,
    spearmanMean: sp.mean,
    walkForwardX: wf.wfX,
    walkForwardRho: wf.rho,
    walkForwardSplit: wf.split,
    bootstrapN: 200,
    launchOddsAuc: odds.auc,
    launchOddsFolds: odds.folds,
    rankMoves5: moves.moves5,
    rankMoves10: moves.moves10,
    rankedN: ranked.length,
    tradedN: traded.length,
    noTokenN,
    tokenNoMcapN: tokenNoMcap,
    setAsideN: setAside.length,
    topChains,
  };

  const watch = new Set(snapshot.watchlist);
  const scored = ranked
    .map((p) => {
      const value = Math.max(1, Math.round(10 ** predict(fit, p)));
      const plan = farmPlan(p, value, odds.predict(p), snapshot.as_of);
      const [lo, hi, rankLo, rankHi] = bands.get(p.slug)!;
      return { p, value, plan, lo, hi, rankLo, rankHi };
    })
    .sort((x, y) => y.value - x.value || (x.p.slug < y.p.slug ? -1 : 1));

  const rows: RadarRow[] = scored.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    family: famOf(s.p),
    chains: s.p.chains,
    tvl: s.p.tvl_usd,
    chg7d: s.p.change_7d,
    ageDays: ageDays(snapshot.as_of, s.p.listed_at),
    rank: i + 1,
    value: s.value,
    lo: Math.max(1, Math.round(s.lo)),
    hi: Math.max(1, Math.round(s.hi)),
    rankLo: s.rankLo,
    rankHi: s.rankHi,
    launchOdds: odds.predict(s.p),
    deposit: s.plan.deposit,
    costs: s.plan.costs,
    slice: s.plan.slice,
    breakEven: s.plan.breakEven,
    net: s.plan.net,
    verdict: s.plan.verdict,
    chain: s.plan.chain,
    gasUsd: s.plan.gasUsd,
    holdWeeks: s.plan.holdWeeks,
    steps: s.plan.steps,
    onWatchlist: watch.has(s.p.slug),
  }));

  const live: LiveRow[] = traded
    .map((p) => {
      const curve = 10 ** predict(fit, p);
      return {
        slug: p.slug,
        name: p.name,
        family: famOf(p),
        tvl: p.tvl_usd,
        mcap: p.mcap_usd!,
        xTvl: p.mcap_usd! / Math.max(1, p.tvl_usd),
        curve: Math.round(curve),
        marketOverCurve: p.mcap_usd! / Math.max(1, curve),
      };
    })
    .sort((a, b) => b.mcap - a.mcap);

  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.value,
    farm_steps: r.steps,
  }));

  const verdictCounts: Record<string, number> = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  const familyCounts: Record<string, number> = {};
  for (const r of rows) {
    verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1;
    familyCounts[r.family] = (familyCounts[r.family] ?? 0) + 1;
  }

  const snapCompact: RadarData['snapshot'] = protos.map((p) => [
    p.slug,
    p.name,
    p.category,
    p.chains,
    p.tvl_usd,
    p.change_7d,
    p.mcap_usd,
    p.listed_at,
  ]);

  const radar: RadarData = {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    method,
    rows,
    live,
    setAside,
    verdictCounts,
    familyCounts,
    snapshot: snapCompact,
  };
  return { board, radar };
}

/** The dashboard's data, as /output/data.js: window.RADAR, compact and deterministic. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** The gate's own shape, checked before writing: first problem, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, fewer than the 100 the gate wants`;
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `board repeats ${r.slug}`;
    seen.add(r.slug);
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `board row ${r.slug} holds ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `board row ${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (const s of snapshot.watchlist) {
    if (!seen.has(s)) return `board misses watchlist slug ${s}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `board ranks are not exactly 1 to ${board.length}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return 'board values rise with rank';
  }
  return null;
}

/** One-line method summary for the build log (stdout, not the entry). */
export function methodSummary(radar: RadarData): string {
  const m = radar.method;
  const lines = [
    `model C3: value = 10^(${m.a.toFixed(3)} + ${m.b.toFixed(3)}*log10(TVL/$100M) + family offset)`,
    `variants: ${m.variants.map((v) => `${v.name} ${v.looX.toFixed(2)}x`).join(' | ')}`,
    `spearman 8-fold mean ${m.spearmanMean.toFixed(3)} (folds ${m.spearmanFolds.map((x) => x.toFixed(2)).join(' ')})`,
    `walk-forward (split ${m.walkForwardSplit}) ${m.walkForwardX.toFixed(2)}x, rho ${m.walkForwardRho.toFixed(3)}`,
    `launch odds AUC ${m.launchOddsAuc.toFixed(3)} (folds ${m.launchOddsFolds.map((x) => x.toFixed(2)).join(' ')}) — weak, stated as weak`,
    `rank moves without offsets: >=5 ranks ${m.rankMoves5}, >=10 ranks ${m.rankMoves10}`,
    `universe: ${m.rankedN} ranked, ${m.tradedN} traded anchors, ${m.noTokenN} no-token, ${m.setAsideN} set aside`,
    `verdicts: FARM ${radar.verdictCounts.FARM} / MARGINAL ${radar.verdictCounts.MARGINAL} / SKIP ${radar.verdictCounts.SKIP}`,
    `top 3: ${radar.rows.slice(0, 3).map((r) => `${r.name} $${r.value.toLocaleString('en-US')}`).join(' | ')}`,
  ];
  return lines.join('\n');
}
