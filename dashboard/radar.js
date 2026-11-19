// Token Radar C3 — rendering. Reads window.RADAR (written by main.ts from the sealed
// snapshot) and window.MODEL (the refit + row check). No network, no framework.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.innerHTML = '<p style="padding:20px">No data: data.js did not load.</p>'; return; }
  var M = R.method;
  function $(id) { return document.getElementById(id); }
  function usd(x) {
    if (x >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
    if (x >= 1e6) return '$' + (x / 1e6).toFixed(1) + 'M';
    if (x >= 1e3) return '$' + Math.round(x / 1e3) + 'K';
    return '$' + Math.round(x);
  }
  function usd2(x) { return '$' + Math.round(x).toLocaleString('en-US'); }
  function pct(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function money(x) { return (x < 0 ? '-$' : '+$') + Math.abs(Math.round(x)).toLocaleString('en-US'); }

  // Header + hero band.
  $('meta').innerHTML = 'Snapshot <b>' + esc(R.asOf) + '</b> · <b>' + M.rankedN + '</b> ranked · ' +
    '<b>' + M.tradedN + '</b> traded anchors · <b>' + M.noTokenN + '</b> record no token · ' +
    '<b>' + M.setAsideN + '</b> set aside with a reason';
  var offTxt = Object.keys(M.offsets).sort().map(function (f) {
    return f + ' ' + (M.offsets[f] >= 0 ? '+' : '') + M.offsets[f].toFixed(3);
  }).join(' · ');
  $('formula').innerHTML = 'value = 10<sup>(<b>' + M.a.toFixed(3) + ' + ' + M.b.toFixed(3) +
    ' · log<sub>10</sub>(TVL / $100M) + family offset</b>)</sup> &nbsp;·&nbsp; offsets: ' + esc(offTxt) +
    ' &nbsp;·&nbsp; fitted on ' + M.tradedN + ' traded tokens, L1 line, trimmed once at |resid| &gt; 1.5 dex.';
  $('variants').innerHTML = '<tr><th>Variant</th><th>What it adds</th><th class="num">LOO miss</th>' +
    '<th class="num">Mean |log|</th><th class="num">Spearman</th></tr>' +
    M.variants.map(function (v) {
      return '<tr><td>' + esc(v.name) + '</td><td>' + esc(v.adds) + '</td><td class="num">' +
        v.looX.toFixed(2) + '×</td><td class="num">' + v.meanLog.toFixed(3) + '</td><td class="num">' +
        v.rho.toFixed(2) + '</td></tr>';
    }).join('');
  $('loo-note').textContent = 'Each step must earn its keep out of sample. The plain curve beats the ' +
    'multiple (3.40× vs 3.94×); family offsets earn their keep (3.20×); the shipped C3 — median ' +
    'offsets, trimmed fit, L1 curve — earns a little more (2.99×). Per-family slopes, residual ' +
    'features and growth tilts were all tested and all made the miss worse, so they are not in the model.';
  $('checks').innerHTML =
    '<li><b>Spearman 8-fold:</b> ' + M.spearmanMean.toFixed(3) + ' mean (folds ' +
    M.spearmanFolds.map(function (x) { return x.toFixed(2); }).join(', ') + '). Order comes from TVL.</li>' +
    '<li><b>Walk-forward:</b> fit before ' + esc(M.walkForwardSplit) + ', tested after: ' +
    M.walkForwardX.toFixed(2) + '× median miss, rho ' + M.walkForwardRho.toFixed(2) + '.</li>' +
    '<li><b>Bootstrap:</b> ' + M.bootstrapN + ' seeded refits; every row carries a P25–P75 value band ' +
    'and a P10–P90 rank range. Removing the offsets moves ' + M.rankMoves5 + ' rows by 5+ ranks, ' +
    M.rankMoves10 + ' by 10+.</li>' +
    '<li><b>Launch odds:</b> 5-fold AUC ' + M.launchOddsAuc.toFixed(3) + ' (folds ' +
    M.launchOddsFolds.map(function (x) { return x.toFixed(2); }).join(', ') + ') — weak, and stated as weak. ' +
    'Guessing "no token" alone scores 0.83 accuracy.</li>';
  var best = R.rows.filter(function (r) { return r.verdict === 'FARM'; })
    .sort(function (a, b) { return b.net - a.net; }).slice(0, 3);
  $('best').innerHTML = best.map(function (r) {
    return '<li><b>' + esc(r.name) + '</b> — ' + usd(r.value) + ', deposit ' + usd2(r.deposit) +
      ' on ' + esc(r.chain) + ', expected net ' + money(r.net) + ', break-even ' + pct(r.breakEven) + '.</li>';
  }).join('') || '<li>No FARM verdict on this board.</li>';

  // In-browser verification: refit the curve from the raw snapshot, re-derive every row.
  var chk = window.MODEL.verify();
  $('verify').innerHTML = chk.ok
    ? '<b>Verified in your browser:</b> refit from the raw snapshot reproduces a = ' + chk.refitA.toFixed(3) +
      ', b = ' + chk.refitB.toFixed(3) + ' and every family offset; all ' + chk.rowsChecked +
      ' board values re-derive from the snapshot. Coverage is counted from the rows, not asserted.'
    : '<b>Verification failed:</b> refit a = ' + (chk.refitA || 0).toFixed(3) + ' vs shipped ' +
      (chk.shippedA || 0).toFixed(3) + '; ' + chk.rowsBad.length + ' rows disagree: ' +
      esc(chk.rowsBad.slice(0, 3).join('; '));

  // Family filter options.
  var fams = Object.keys(R.familyCounts).sort();
  $('family').innerHTML = '<option value="">All families</option>' +
    fams.map(function (f) { return '<option>' + esc(f) + ' (' + R.familyCounts[f] + ')</option>'; }).join('');

  // Board rendering with filter + sort.
  var state = { q: '', verdict: '', family: '', sort: 'rank', tab: 'come' };
  function filtered() {
    var rows = R.rows.filter(function (r) {
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.family && r.family !== state.family) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        var hay = (r.name + ' ' + r.slug + ' ' + r.family + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (state.sort === 'net') rows.sort(function (a, b) { return b.net - a.net; });
    else if (state.sort === 'tvl') rows.sort(function (a, b) { return b.tvl - a.tvl; });
    else if (state.sort === 'odds') rows.sort(function (a, b) { return b.launchOdds - a.launchOdds; });
    else rows.sort(function (a, b) { return a.rank - b.rank; });
    return rows;
  }
  function renderBoard() {
    var rows = filtered();
    $('count').textContent = rows.length + ' of ' + R.rows.length + ' rows';
    $('rows').innerHTML = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td><td><b>' + esc(r.name) + '</b>' +
        (r.onWatchlist ? ' <span class="wl">● watchlist</span>' : '') + '<br><span style="color:var(--dim);font-size:13px">' +
        esc(r.family) + ' · ' + esc(r.chains.slice(0, 2).join(', ')) + ' · ' + r.ageDays + 'd</span></td>' +
        '<td class="num">' + usd(r.tvl) + '</td><td class="num"><b>' + usd(r.value) + '</b></td>' +
        '<td class="num">' + usd(r.lo) + '–' + usd(r.hi) + '</td>' +
        '<td class="num">#' + r.rankLo + '–' + r.rankHi + '</td>' +
        '<td class="num">' + pct(r.launchOdds) + '</td><td class="num">' + usd2(r.deposit) + '</td>' +
        '<td class="num">' + money(r.net) + '</td><td><span class="v v-' + r.verdict + '">' + r.verdict + '</span></td></tr>';
    }).join('');
  }
  function renderLive() {
    $('live-rows').innerHTML = R.live.map(function (r) {
      return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.family) + '</td>' +
        '<td class="num">' + usd(r.tvl) + '</td><td class="num">' + usd(r.mcap) + '</td>' +
        '<td class="num">' + r.xTvl.toFixed(2) + '×</td><td class="num">' + usd(r.curve) + '</td>' +
        '<td class="num">' + r.marketOverCurve.toFixed(2) + '×</td></tr>';
    }).join('');
  }
  function showDetail(slug) {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var peers = R.live.filter(function (l) { return l.family === r.family; })
      .sort(function (a, b) { return Math.abs(Math.log10(a.tvl / r.tvl)) - Math.abs(Math.log10(b.tvl / r.tvl)); })
      .slice(0, 3);
    var d = $('detail');
    d.hidden = false;
    d.innerHTML = '<h2>' + esc(r.name) + ' <small>rank #' + r.rank + ' · ' + esc(r.family) +
      ' · ' + esc(r.chains.join(', ')) + ' · ' + r.ageDays + ' days listed</small></h2>' +
      '<div class="kv">' +
      '<div><b>' + usd(r.value) + '</b><span>implied value (band ' + usd(r.lo) + '–' + usd(r.hi) + ')</span></div>' +
      '<div><b>#' + r.rankLo + '–' + r.rankHi + '</b><span>rank range over 200 refits</span></div>' +
      '<div><b>' + pct(r.launchOdds) + '</b><span>launch odds (AUC 0.60 — weak)</span></div>' +
      '<div><b>' + money(r.net) + '</b><span>expected net on ' + usd2(r.deposit) + ' deposit</span></div>' +
      '</div>' +
      '<p>Curve value: 10<sup>(' + M.a.toFixed(3) + ' + ' + M.b.toFixed(3) + ' · log<sub>10</sub>(' +
      usd(r.tvl) + ' / $100M) + ' + (M.offsets[r.family] >= 0 ? '+' : '') + M.offsets[r.family].toFixed(3) +
      ' ' + esc(r.family) + ' offset)</sup> = ' + usd(r.value) + '. Break-even launch chance ' +
      pct(r.breakEven) + '; costs ' + usd2(r.costs) + ' (gas ' + usd2(r.gasUsd * 4) + ' on ' + esc(r.chain) +
      ' + income forgone); slice ' + usd2(r.slice) + ' at a 10% allocation share; hold ' + r.holdWeeks +
      ' weeks. Verdict <span class="v v-' + r.verdict + '">' + r.verdict + '</span>.</p>' +
      '<h3>Farm plan — ' + r.steps.length + ' steps</h3><ol class="steps">' +
      r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="peers">Nearest traded anchors in ' + esc(r.family) + ': ' +
      peers.map(function (p) { return esc(p.name) + ' (' + usd(p.mcap) + ', ' + p.marketOverCurve.toFixed(2) + '× curve)'; }).join(' · ') + '.</p>' +
      '<p><a href="#" id="back">← Back to the board</a> (keeps your filter).</p>';
    $('back').addEventListener('click', function (e) { e.preventDefault(); d.hidden = true; });
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Tabs.
  function setTab(t) {
    state.tab = t;
    $('tab-come').className = t === 'come' ? 'active' : '';
    $('tab-trades').className = t === 'trades' ? 'active' : '';
    $('board').hidden = t !== 'come';
    $('live').hidden = t !== 'trades';
    $('controls').style.display = t === 'come' ? '' : 'none';
    $('detail').hidden = true;
    if (t === 'trades') renderLive();
  }
  $('tab-come').addEventListener('click', function () { setTab('come'); });
  $('tab-trades').addEventListener('click', function () { setTab('trades'); });
  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; renderBoard(); });
  $('family').addEventListener('change', function (e) { state.family = e.target.value.split(' (')[0]; renderBoard(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });

  // Method section.
  var setList = R.setAside.map(function (s) { return esc(s.name) + ' — ' + esc(s.reason); });
  $('method-body').innerHTML =
    '<h3>One formula</h3><p>value = 10<sup>(' + M.a.toFixed(3) + ' + ' + M.b.toFixed(3) +
    ' · log<sub>10</sub>(TVL / $100M) + family offset)</sup>, fitted on the ' + M.tradedN +
    ' traded tokens by L1 regression, trimmed once at |residual| &gt; 1.5 dex and refit. Family ' +
    'offsets are median residuals, shrunk n/(n+8) and clipped at ±1 dex. No protocol name is ' +
    'ever special-cased: the same function scores every row, and the page refits it from the raw ' +
    'snapshot above (see the verification line) so the numbers are checked, not claimed.</p>' +
    '<h3>What was tested and dropped</h3><p>Per-family slopes (3.48×), residual features ' +
    '(chains, age, 7-day change: 3.72×), growth and seasoning tilts (3.55×) — every one made the ' +
    'leave-one-out miss worse than the shipped 2.99×, so none of them is in the model. The ' +
    'launch-odds logistic (TVL, chain count, 7-day change) scores 5-fold AUC ' +
    M.launchOddsAuc.toFixed(3) + ': it is shown because the plans need a launch chance, and it is ' +
    'labelled weak because it is.</p>' +
    '<h3>Universe</h3><p>' + M.rankedN + ' protocols ranked. ' + M.tradedN +
    ' already trade and anchor the curve (shown on the second tab, never mixed into the board). ' +
    M.tokenNoMcapN + ' record a token without a market cap and are not ranked. ' + M.noTokenN +
    ' record no token at all; ' + M.setAsideN + ' of those are set aside, each with a stated reason. ' +
    'The watchlist (40) is a floor: every one of its slugs is ranked, and ' + (M.rankedN - 40) +
    ' ranked rows sit below the $50M floor. Top chains by TVL: ' +
    M.topChains.map(function (c) { return esc(c.chain) + ' ' + usd(c.tvl); }).join(', ') + '.</p>' +
    '<h3>Farm plans</h3><p>Deposit = clamp(max(TVL/10,000, 3 × fixed costs), $500, $5,000). ' +
    'Chain = cheapest of the protocol\'s own chains by gas. Funding = the chain\'s native coin when ' +
    'you already hold it, else USDC — no bridge legs. Slice = 10% × implied value × deposit/TVL. ' +
    'Costs = gas + income forgone against a 4% T-bill. Break-even = costs / slice. Verdict: FARM ' +
    'when the launch odds beat break-even by 10 points or more and break-even ≤ 25%, MARGINAL near ' +
    'break-even, else SKIP; a 7-day TVL fall past −30% caps FARM at MARGINAL. Hold 6–12 weeks ' +
    '(younger = longer); KYC on day 3; unbonding starts 14 days before exit; stop if TVL closes ' +
    '10–35% below entry or withdrawals pause; claim only through the bookmarked domain.</p>' +
    '<h3>Set aside (' + R.setAside.length + ')</h3><p class="setaside">' + setList.join('<br>') + '</p>';

  renderBoard();
})();
