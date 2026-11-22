// Launch Radar's page: renders the ranked board from window.RADAR (the
// data.js the program writes), sorts and filters it, and shows one
// protocol's model breakdown and farm plan at a time.
//
// The model the page re-runs in its sandbox is the same one the program
// ran, stated in the page's header:
//
//   implied = TVL x multiple x growth x maturity x launch
//
//   multiple  the category's median mcap/TVL among its live-token comps
//   growth    1 + clamp(change_7d, -60, 120) / 100 x growth_weight
//   maturity  0.6 + min(age_days, 1095) / 1095 x 0.4
//   launch    damp + (1 - damp) x age-band token rate
//
// No network: the page reads only the data.js beside it.

(function () {
  'use strict';
  const D = window.RADAR;
  if (!D) {
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:2em">No radar data loaded.</p>');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const rowsEl = $('rows');
  const detailEl = $('detail');
  let selected = null;
  let sandbox = { mult: 1, growth: 0.5, damp: 0.5 };

  // ---- formatting ----
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    const s = (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n >= 0 ? 'up' : 'down') + '">' + s + '</span>';
  }
  function ageFmt(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365).toFixed(1).replace(/\.0$/, '') + 'y';
    return days + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- the sandbox re-run: same formula, the sliders' constants ----
  function impliedWith(r, sb) {
    const growthMult = 1 + (r.growth_pct / 100) * sb.growth;
    const launch = sb.damp + (1 - sb.damp) * r.launch_rate;
    return Math.max(1, Math.round(r.tvl_usd * r.multiple * sb.mult * growthMult * r.maturity_multiplier * launch));
  }
  const sandboxActive = () => sandbox.mult !== 1 || sandbox.growth !== 0.5 || sandbox.damp !== 0.5;

  // ---- stats ----
  $('stats').innerHTML =
    stat(D.board_size, 'protocols ranked') +
    stat(D.watchlist_size, 'on the watchlist') +
    stat(D.early_size, 'early, below the floor') +
    stat(D.live_size, 'live-token comps');
  function stat(v, label) {
    return '<div><dt>' + esc(label) + '</dt><dd>' + v + '</dd></div>';
  }

  // ---- filter options ----
  const cats = [...new Set(D.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  $('f-cat').insertAdjacentHTML('beforeend', cats.map((c) => '<option>' + esc(c) + '</option>').join(''));
  $('f-chain').insertAdjacentHTML('beforeend', chains.map((c) => '<option>' + esc(c) + '</option>').join(''));

  // ---- the board ----
  function filtered() {
    const q = $('q').value.trim().toLowerCase();
    const cat = $('f-cat').value;
    const chain = $('f-chain').value;
    const minTvl = Number($('f-tvl').value);
    const watchOnly = $('f-watch').checked;
    const sort = $('f-sort').value;
    let list = D.rows.filter((r) => {
      if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q))) return false;
      if (cat && r.category !== cat) return false;
      if (chain && !r.chains.includes(chain)) return false;
      if (r.tvl_usd < minTvl) return false;
      if (watchOnly && !r.on_watchlist) return false;
      return true;
    });
    const withImplied = list.map((r) => ({ r, v: sandboxActive() ? impliedWith(r, sandbox) : r.implied_value_usd }));
    if (sort === 'tvl') withImplied.sort((a, b) => b.r.tvl_usd - a.r.tvl_usd);
    else if (sort === 'growth') withImplied.sort((a, b) => (b.r.change_7d ?? -1e9) - (a.r.change_7d ?? -1e9));
    else if (sort === 'age') withImplied.sort((a, b) => (b.r.age_days ?? -1) - (a.r.age_days ?? -1));
    else if (sort === 'name') withImplied.sort((a, b) => (a.r.name < b.r.name ? -1 : 1));
    else withImplied.sort((a, b) => b.v - a.v || (a.r.slug < b.r.slug ? -1 : 1));
    return withImplied;
  }

  function render() {
    const list = filtered();
    $('count').textContent = list.length + ' of ' + D.rows.length + ' protocols';
    rowsEl.innerHTML = list
      .map(({ r, v }) => {
        const sel = selected === r.slug ? ' class="selected"' : '';
        return (
          '<tr data-slug="' + esc(r.slug) + '"' + sel + '>' +
          '<td class="num">' + r.rank + '</td>' +
          '<td><span class="proto-name">' + esc(r.name) + '</span>' +
          (r.on_watchlist ? '<span class="badge">Watchlist</span>' : '') +
          '<span class="proto-slug">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td>' + esc(r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')) + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + ageFmt(r.age_days) + '</td>' +
          '<td class="num">' + r.launch_factor.toFixed(2) + '×</td>' +
          '<td class="num"><strong>' + money(v) + '</strong></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  rowsEl.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    selected = tr.getAttribute('data-slug');
    render();
    showDetail(D.rows.find((r) => r.slug === selected));
  });

  // ---- detail view ----
  function showDetail(r) {
    if (!r) {
      detailEl.hidden = true;
      return;
    }
    const v = sandboxActive() ? impliedWith(r, sandbox) : r.implied_value_usd;
    const steps = r.farm_steps
      .map((s) => {
        const m = s.match(/^(.*?)\s*Cost:\s*(.*?)\.\s*Time:\s*(.*?)\.?$/);
        const text = m ? m[1] : s;
        const meta = m ? 'Cost: ' + m[2] + ' · Time: ' + m[3] : '';
        return '<li>' + esc(text) + (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') + '</li>';
      })
      .join('');
    detailEl.innerHTML =
      '<h2>' + esc(r.name) + ' <span style="color:var(--muted);font-size:16px">#' + r.rank + ' · ' + money(v) + ' implied</span></h2>' +
      '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ')) +
      (r.on_watchlist ? ' · <span class="badge">Watchlist</span>' : '') + '</p>' +
      '<div class="breakdown">' +
      card('TVL', money(r.tvl_usd), 'the base of the value') +
      card('Multiple', r.multiple.toFixed(3) + '×', 'from ' + r.multiple_source + (r.multiple_source === 'global' ? ' median' : ' comps')) +
      card('Growth', r.growth_multiplier.toFixed(2) + '×', (r.change_7d === null ? 'no 7d figure' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '% in 7d')) +
      card('Maturity', r.maturity_multiplier.toFixed(2) + '×', ageFmt(r.age_days) + ' old') +
      card('Launch', r.launch_factor.toFixed(2) + '×', 'age band ' + r.age_band) +
      '</div>' +
      '<h3>How to farm it</h3><ol class="plan">' + steps + '</ol>' +
      '<p class="note">The implied value is this entry\'s own claim from the snapshot\'s figures — not a prediction that a token will be issued, or when. Check the protocol\'s own page before sending funds anywhere.</p>';
    detailEl.hidden = false;
    detailEl.scrollIntoView({ block: 'start' });
  }
  function card(label, value, small) {
    return '<div class="break"><span>' + esc(label) + '</span><b>' + esc(value) + '</b><small>' + esc(small) + '</small></div>';
  }

  // ---- calibration + live tables ----
  $('calib-rows').innerHTML =
    D.calibration.by_category
      .map((c) => '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(3) + '×</td><td class="num">' + c.comps + '</td></tr>')
      .join('') +
    '<tr><td><strong>Global (fallback)</strong></td><td class="num"><strong>' + D.calibration.global_multiple.toFixed(3) + '×</strong></td><td class="num">' + D.calibration.global_comps + '</td></tr>';
  $('curve-rows').innerHTML = D.calibration.age_curve
    .map((a) => '<tr><td>' + esc(a.band) + '</td><td class="num">' + (a.rate * 100).toFixed(0) + '%</td><td class="num">' + a.n + '</td></tr>')
    .join('');
  $('live-rows').innerHTML = D.live
    .map(
      (p) =>
        '<tr><td><span class="proto-name">' + esc(p.name) + '</span><span class="proto-slug">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
        '<td class="num">' + money(p.mcap_usd) + '</td><td class="num">' + p.ratio.toFixed(3) + '×</td></tr>',
    )
    .join('');

  // ---- filters + sandbox wiring ----
  ['q', 'f-cat', 'f-chain', 'f-tvl', 'f-watch', 'f-sort'].forEach((id) => {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  function bindSlider(id, vid, fmt, apply) {
    $(id).addEventListener('input', () => {
      const n = Number($(id).value);
      $(vid).textContent = fmt(n);
      apply(n);
      render();
      if (selected) showDetail(D.rows.find((r) => r.slug === selected));
    });
  }
  bindSlider('sb-mult', 'sb-mult-v', (n) => (n / 100).toFixed(2) + '×', (n) => (sandbox.mult = n / 100));
  bindSlider('sb-growth', 'sb-growth-v', (n) => (n / 100).toFixed(2), (n) => (sandbox.growth = n / 100));
  bindSlider('sb-launch', 'sb-launch-v', (n) => (n / 100).toFixed(2), (n) => (sandbox.damp = n / 100));

  // ---- deep links: #detail=<slug> opens a protocol, #watchlist filters to it ----
  function applyHash() {
    const h = window.location.hash.slice(1);
    if (h === 'watchlist') {
      $('f-watch').checked = true;
      render();
    } else if (h.startsWith('detail=')) {
      const slug = decodeURIComponent(h.slice(7));
      const r = D.rows.find((x) => x.slug === slug);
      if (r) {
        selected = r.slug;
        render();
        showDetail(r);
      }
    }
  }

  render();
  applyHash();
})();
