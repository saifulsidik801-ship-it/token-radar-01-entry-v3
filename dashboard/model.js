// Token Radar C3 — the model, as the page re-runs it in your browser.
//
// ONE formula, fitted on the 128 traded tokens of the sealed snapshot:
//   value = 10 ^ (7.238 + 0.515 * log10(TVL / $100M) + family offset)
//   a = 7.237782515146704, b = 0.5154392141209768 (L1 line, trimmed once at |resid| > 1.5 dex)
//   family offsets (median residual per family, shrunk n/(n+8), clipped at +-1 dex):
//   trade +0.271, infra +0.308, other +0.078, cex +0.030, rwa -0.022,
//   lend -0.089, stake -0.243, vault -0.318.
// No per-family slopes, no residual features, no growth/seasoning tilts: each was tested
// locally and made the out-of-sample miss worse, and the variants table below says so.
// The page refits this curve from the raw snapshot below (refitCurve) and checks the
// refit against the shipped constants, then re-derives every board row's value and
// checks it against the shipped board. Nothing on this page is asserted: it is computed.

(function () {
  'use strict';
  var FAMMAP = {
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
    'Canonical Bridge': 'infra', Chain: 'infra', CEX: 'cex', Launchpad: 'cex'
  };
  function fam(p) { return FAMMAP[p[2] || ''] || 'other'; }
  function lt(p) { return Math.log10(Math.max(1, p[4]) / 1e8); }
  function lm(p) { return Math.log10(Math.max(1, p[6] || 0)); }
  function median(v) {
    var s = v.slice().sort(function (x, y) { return x - y; });
    var n = s.length;
    return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  function mean(v) { return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : 0; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function ols(xs, ys) {
    var mx = mean(xs), my = mean(ys), sxx = 0, sxy = 0, i;
    for (i = 0; i < xs.length; i++) { sxx += Math.pow(xs[i] - mx, 2); sxy += (xs[i] - mx) * (ys[i] - my); }
    var b = sxx === 0 ? 0 : sxy / sxx;
    return [my - b * mx, b];
  }
  function l1Line(xs, ys) {
    var ab = ols(xs, ys), a = ab[0], b = ab[1], k, i, w, sw, mx, my, sxx, sxy, b2, a2;
    for (k = 0; k < 300; k++) {
      w = xs.map(function (x, i) { return 1 / Math.max(Math.abs(ys[i] - (a + b * x)), 0.05); });
      sw = w.reduce(function (s, v) { return s + v; }, 0);
      mx = w.reduce(function (s, wi, i) { return s + wi * xs[i]; }, 0) / sw;
      my = w.reduce(function (s, wi, i) { return s + wi * ys[i]; }, 0) / sw;
      sxx = 0; sxy = 0;
      for (i = 0; i < xs.length; i++) { sxx += w[i] * Math.pow(xs[i] - mx, 2); sxy += w[i] * (xs[i] - mx) * (ys[i] - my); }
      b2 = sxx === 0 ? b : sxy / sxx;
      a2 = my - b2 * mx;
      if (Math.abs(a2 - a) < 1e-9 && Math.abs(b2 - b) < 1e-9) { a = a2; b = b2; break; }
      a = a2; b = b2;
    }
    return [a, b];
  }
  function offsets(train, a, b) {
    var res = {}, f, i, m, off = {};
    for (i = 0; i < train.length; i++) {
      f = fam(train[i]);
      (res[f] = res[f] || []).push(lm(train[i]) - (a + b * lt(train[i])));
    }
    for (f in res) {
      m = median(res[f]);
      off[f] = clamp(m * (res[f].length / (res[f].length + 8)), -1, 1);
    }
    return off;
  }
  // Refit C3 from the raw snapshot, exactly as the build did: L1 line, trim once at
  // |resid| > 1.5 dex, refit L1, median family offsets.
  function refitCurve(snap) {
    var traded = snap.filter(function (p) { return (p[6] || 0) > 0 && (p[4] || 0) > 0; });
    var ab = l1Line(traded.map(lt), traded.map(lm));
    var keep = traded.filter(function (p) { return Math.abs(lm(p) - (ab[0] + ab[1] * lt(p))) <= 1.5; });
    ab = l1Line(keep.map(lt), keep.map(lm));
    return { a: ab[0], b: ab[1], off: offsets(keep, ab[0], ab[1]), n: keep.length };
  }
  function predict(fit, p) { return fit.a + fit.b * lt(p) + (fit.off[fam(p)] || 0); }
  // The shipped constants, from RADAR.method: the refit must reproduce them.
  function verify() {
    var R = window.RADAR;
    if (!R) return { ok: false, reason: 'no data.js loaded' };
    var fit = refitCurve(R.snapshot);
    var m = R.method;
    var aOk = Math.abs(fit.a - m.a) < 1e-6;
    var bOk = Math.abs(fit.b - m.b) < 1e-6;
    var offOk = true, f;
    for (f in m.offsets) { if (Math.abs((fit.off[f] || 0) - m.offsets[f]) > 1e-6) offOk = false; }
    var bySlug = {};
    R.snapshot.forEach(function (p) { bySlug[p[0]] = p; });
    var checked = 0, bad = [];
    R.rows.forEach(function (r) {
      var p = bySlug[r.slug];
      if (!p) { bad.push(r.slug); return; }
      var v = Math.max(1, Math.round(Math.pow(10, m.a + m.b * lt(p) + (m.offsets[fam(p)] || 0))));
      if (v !== r.value) bad.push(r.slug + ' (' + v + ' vs ' + r.value + ')');
      checked++;
    });
    return {
      ok: aOk && bOk && offOk && bad.length === 0,
      refitA: fit.a, refitB: fit.b, shippedA: m.a, shippedB: m.b,
      refitOk: aOk && bOk && offOk, rowsChecked: checked, rowsBad: bad
    };
  }
  window.MODEL = { refitCurve: refitCurve, verify: verify, fam: fam };
})();
