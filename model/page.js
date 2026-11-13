// Model page: sixteen Zillow home value ladders. Distributions are precomputed per city in ../data/cities.json
// (cumulative and density on a grid of log-% offsets from the model center); an adjustment shifts the center.
fetch('../data/cities.json', { cache: 'no-cache' }).then((r) => r.json()).then((D) => {
  const C = D.cities;
  const parseMonth = d3.utcParse('%Y-%m');
  const fmtMonth = d3.utcFormat('%b %Y');
  const usd = (v) => (v >= 1e6 ? `$${+(v / 1e6).toFixed(3)}M` : `$${+(v / 1000).toFixed(2)}k`);
  const usdFull = (v) => `$${Math.round(v).toLocaleString()}`;
  const pc = (v) => `${Math.round(v * 100)}%`;
  const sgn = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const n = C[0].cdf.length;
  const uAt = (i) => D.u0 + i * D.du;

  // per-city adjustments, kept in this browser only
  let adj = {};
  try { adj = JSON.parse(localStorage.getItem('hv-adj') || '{}'); } catch (e) { adj = {}; }
  const save = () => { try { localStorage.setItem('hv-adj', JSON.stringify(adj)); } catch (e) {} };
  const A = (c) => adj[c.slug] || 0;
  // standard deviation, % of the November value: the model's own (sd0), and the one set here
  C.forEach((c) => { c.sd0 = Math.sqrt(d3.sum(c.pdf, (p, i) => p * uAt(i) ** 2) * D.du); });
  let sdv = {};
  try { sdv = JSON.parse(localStorage.getItem('hv-sd') || '{}'); } catch (e) { sdv = {}; }
  const saveSd = () => { try { localStorage.setItem('hv-sd', JSON.stringify(sdv)); } catch (e) {} };
  const SD = (c) => sdv[c.slug] || c.sd0;
  const K = (c) => SD(c) / c.sd0;
  const moved = (c) => !!adj[c.slug] || !!sdv[c.slug];

  function cdfAt(c, u, k) {
    const f = (u / k - D.u0) / D.du;
    if (f <= 0) return 0; if (f >= n - 1) return 1;
    const i = Math.floor(f), t = f - i;
    return c.cdf[i] * (1 - t) + c.cdf[i + 1] * t;
  }
  const above = (c, X, a = A(c), k = K(c)) => 1 - cdfAt(c, Math.log(X) * 100 - c.mu - a, k);
  function quantile(c, p, a = A(c), k = K(c)) {
    const i = d3.bisectLeft(c.cdf, p);
    if (i <= 0) return Math.exp((c.mu + a + k * uAt(0)) / 100);
    const t = (p - c.cdf[i - 1]) / Math.max(1e-12, c.cdf[i] - c.cdf[i - 1]);
    return Math.exp((c.mu + a + k * (uAt(i - 1) + t * D.du)) / 100);
  }
  const center = (c, a = A(c)) => Math.exp((c.mu + a) / 100);
  const chg = (c, v) => (v / c.last - 1) * 100;

  let cur = C.find((c) => c.slug === (location.hash || '').slice(1)) || C[0];
  let strike = null;
  const pickStrike = () => { strike = cur.strikes.reduce((a, b) => (Math.abs(b - center(cur)) < Math.abs(a - center(cur)) ? b : a)); };
  pickStrike();

  // ---------- picker ----------
  const picker = document.getElementById('picker');
  const btns = C.map((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = c.name;
    b.addEventListener('click', () => select(c));
    picker.appendChild(b);
    return b;
  });

  // ---------- adjustment input ----------
  const field = document.getElementById('adj-field');
  const sf = EN.sliderField({ value: A(cur), min: -3, max: 3, sliderMin: -1, sliderMax: 1, step: 0.01, unit: 'pp', label: 'Adjustment to the November center',
    onChange: (v) => { adj[cur.slug] = Math.round(v * 100) / 100; if (!adj[cur.slug]) delete adj[cur.slug]; save(); paint(); } });
  field.insertBefore(sf.range, document.getElementById('adj-note'));
  field.insertBefore(sf.box.el, document.getElementById('adj-note'));
  const sdField = document.getElementById('sd-field');
  const ss = EN.sliderField({ value: +SD(cur).toFixed(2), min: 0.2, max: 6, sliderMin: 0.5, sliderMax: 3.5, step: 0.01, unit: '%', label: 'Standard deviation',
    onChange: (v) => { if (Math.abs(v - cur.sd0) < 0.005) delete sdv[cur.slug]; else sdv[cur.slug] = v; saveSd(); paint(); } });
  sdField.insertBefore(ss.range, document.getElementById('sd-note'));
  sdField.insertBefore(ss.box.el, document.getElementById('sd-note'));
  document.getElementById('reset').addEventListener('click', () => { delete adj[cur.slug]; delete sdv[cur.slug]; save(); saveSd(); sf.set(0); ss.set(+cur.sd0.toFixed(2)); paint(); });

  // ---------- chart 1: all cities ----------
  const overview = EN.chart.frame(document.getElementById('overview'), () => C.length * 26 + 44, ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 10, r: 60, b: 30, l: 130 };
    const rows = C.map((c) => ({ c, lo: chg(c, quantile(c, 0.1)), mid: chg(c, center(c)), hi: chg(c, quantile(c, 0.9)) }));
    const lim = Math.ceil(d3.max(rows, (d) => Math.max(Math.abs(d.lo), Math.abs(d.hi))));
    const x = d3.scaleLinear([-lim, lim], [m.l, width - m.r]);
    const y = d3.scaleBand(C.map((c) => c.slug), [m.t, height - m.b]).padding(0.3);
    svg.attr('aria-label', 'Forecast change by city: ' + rows.map((d) => `${d.c.name} ${sgn(d.mid)}%`).join(', '));
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(8).tickSize(-(height - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(width < 560 ? 4 : 8).tickSize(5).tickPadding(6).tickFormat((v) => `${sgn(v, 0)}%`));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', height - m.b).attr('stroke', 'var(--ink-faint)');
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('class', 'row').on('click', (e, d) => select(d.c));
    g.append('rect').attr('x', 0).attr('width', width).attr('y', (d) => y(d.c.slug) - 4).attr('height', y.bandwidth() + 8).attr('fill', (d) => (d.c === cur ? 'var(--band)' : 'transparent'));
    g.append('text').attr('x', m.l - 10).attr('y', (d) => y(d.c.slug) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
      .style('fill', (d) => (d.c === cur ? 'var(--ink)' : 'var(--ink-soft)')).style('font-weight', (d) => (d.c === cur ? 650 : 400)).text((d) => d.c.name);
    g.append('rect').attr('x', (d) => x(d.lo)).attr('width', (d) => x(d.hi) - x(d.lo)).attr('y', (d) => y(d.c.slug)).attr('height', y.bandwidth()).attr('rx', 2).attr('fill', 'var(--s2)').attr('fill-opacity', 0.28);
    g.append('circle').attr('cx', (d) => x(d.mid)).attr('cy', (d) => y(d.c.slug) + y.bandwidth() / 2).attr('r', 4.5).attr('fill', 'var(--bg)').attr('stroke', 'var(--s2)').attr('stroke-width', 2.2);
    g.append('text').attr('class', 'note').attr('x', (d) => x(d.hi) + 8).attr('y', (d) => y(d.c.slug) + y.bandwidth() / 2).attr('dy', '0.35em').style('fill', 'var(--ink-soft)').text((d) => `${sgn(d.mid)}%`);
  });

  // ---------- chart 2: the series ----------
  const series = EN.chart.frame(document.getElementById('series'), (w) => Math.max(240, Math.min(360, w * 0.45)), ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 20, r: 96, b: 30, l: 64 };
    const h = cur.history.map(([mo, v]) => ({ t: parseMonth(mo), v }));
    const last = h[h.length - 1];
    const target = parseMonth('2026-11');
    const c = center(cur), lo = quantile(cur, 0.1), hi = quantile(cur, 0.9);
    const x = d3.scaleUtc([h[0].t, target], [m.l, width - m.r]);
    const y = d3.scaleLinear([Math.min(lo, d3.min(h, (d) => d.v)), Math.max(hi, d3.max(h, (d) => d.v))], [height - m.b, m.t]).nice(5);
    svg.attr('aria-label', `${cur.name} Zillow value by month; ${fmtMonth(last.t)} ${usdFull(last.v)}; November center ${usdFull(c)}.`);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat(usd)).call((g) => g.select('.domain').remove());
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(d3.utcMonth.every(width < 560 ? 6 : 3)).tickSize(5).tickPadding(6).tickFormat(fmtMonth));
    svg.append('path').attr('fill', 'none').attr('stroke', 'var(--s1)').attr('stroke-width', 2).attr('d', d3.line().x((d) => x(d.t)).y((d) => y(d.v))(h));
    const xo = x(target);
    svg.append('rect').attr('x', xo - 9).attr('width', 18).attr('y', y(hi)).attr('height', Math.max(1, y(lo) - y(hi))).attr('rx', 2).attr('fill', 'var(--s2)').attr('fill-opacity', 0.28);
    svg.append('line').attr('x1', x(last.t)).attr('y1', y(last.v)).attr('x2', xo).attr('y2', y(c)).attr('stroke', 'var(--s2)').attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
    svg.append('circle').attr('cx', xo).attr('cy', y(c)).attr('r', 5).attr('fill', 'var(--bg)').attr('stroke', 'var(--s2)').attr('stroke-width', 2.5);
    svg.append('text').attr('class', 'end-label').attr('x', xo + 14).attr('y', y(c)).attr('dy', '0.35em').style('fill', 'var(--s2)').text(usd(c));
    svg.append('text').attr('class', 'end-label').attr('x', x(last.t) - 8).attr('y', y(last.v) - 12).attr('text-anchor', 'end').style('fill', 'var(--s1)').text(usd(last.v));
  });

  // ---------- chart 3: the distribution ----------
  const dist = EN.chart.frame(document.getElementById('dist'), (w) => Math.max(200, Math.min(280, w * 0.34)), ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 26, r: 14, b: 30, l: 64 };
    const curve = (a, k) => cur.pdf.map((p, i) => { const v = Math.exp((cur.mu + a + k * uAt(i)) / 100); return [v, p / k * 100 / v]; });
    const pts = curve(A(cur), K(cur));
    const ghost = moved(cur) ? curve(0, 1) : null;
    const ymax = d3.max(pts, (d) => d[1]);
    const xmin = Math.min(cur.strikes[0], quantile(cur, 0.003)) * 0.997, xmax = Math.max(cur.strikes[cur.strikes.length - 1], quantile(cur, 0.997)) * 1.003;
    const x = d3.scaleLinear([xmin, xmax], [m.l, width - m.r]);
    const inside = (arr) => arr.filter((d) => d[0] >= xmin && d[0] <= xmax);
    const y = d3.scaleLinear([0, Math.max(ymax, ghost ? d3.max(ghost, (d) => d[1]) : 0) * 1.12], [height - m.b, m.t]);
    svg.attr('aria-label', `Spread of outcomes for ${cur.name}'s November first print. Chance above ${usdFull(strike)}: ${pc(above(cur, strike))}.`);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(width < 560 ? 4 : 8).tickSize(5).tickPadding(6).tickFormat(usd));
    const area = d3.area().x((d) => x(d[0])).y0(y(0)).y1((d) => y(d[1]));
    const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
    svg.append('path').attr('fill', 'var(--band)').attr('d', area(inside(pts)));
    svg.append('path').attr('fill', 'var(--s2)').attr('fill-opacity', 0.35).attr('d', area(inside(pts).filter((d) => d[0] >= strike)));
    if (ghost) svg.append('path').attr('fill', 'none').attr('stroke', 'var(--ink-faint)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4').attr('d', line(inside(ghost)));
    svg.append('path').attr('fill', 'none').attr('stroke', 'var(--ink)').attr('stroke-width', 2).attr('d', line(inside(pts)));
    svg.append('g').selectAll('line').data(cur.strikes).join('line').attr('x1', (s) => x(s)).attr('x2', (s) => x(s)).attr('y1', y(0)).attr('y2', m.t)
      .attr('stroke', (s) => (s === strike ? 'var(--s2)' : 'var(--line)')).attr('stroke-width', (s) => (s === strike ? 2 : 1));
    const xs = x(strike);
    svg.append('text').attr('class', 'note').attr('x', xs + (xs > width - 170 ? -6 : 6)).attr('y', m.t - 8).attr('text-anchor', xs > width - 170 ? 'end' : 'start')
      .style('fill', 'var(--s2)').text(`Above ${usdFull(strike)}: ${pc(above(cur, strike))}`);
  });

  // ---------- chart 4: chance above each strike ----------
  const ladder = EN.chart.frame(document.getElementById('ladder'), (w) => Math.max(170, Math.min(230, w * 0.28)), ({ svg, width, height }) => {
    svg.selectAll('*').remove();
    const m = { t: 22, r: 14, b: 30, l: 64 };
    const S = cur.strikes;
    const x = d3.scaleBand(S, [m.l, width - m.r]).padding(0.25);
    const y = d3.scaleLinear([0, 1], [height - m.b, m.t]);
    svg.attr('aria-label', 'Chance above each strike: ' + S.map((s) => `${usdFull(s)} ${pc(above(cur, s))}`).join(', '));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).tickSize(0).tickPadding(8).tickFormat((s) => `>${usd(s)}`)).call((g) => g.select('.domain').remove());
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(2).tickSize(0).tickPadding(8).tickFormat(d3.format('.0%'))).call((g) => g.select('.domain').remove());
    const g = svg.append('g').selectAll('g').data(S).join('g').style('cursor', 'pointer').on('click', (e, s) => { strike = s; paint(); });
    g.append('rect').attr('x', (s) => x(s) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', m.t).attr('height', height - m.t - m.b + 22).attr('fill', 'transparent');
    if (moved(cur)) g.append('rect').attr('x', (s) => x(s)).attr('width', x.bandwidth()).attr('y', (s) => y(above(cur, s, 0, 1))).attr('height', (s) => y(0) - y(above(cur, s, 0, 1)))
      .attr('fill', 'none').attr('stroke', 'var(--ink-faint)').attr('stroke-dasharray', '4 3');
    g.append('rect').attr('class', 'bar').attr('x', (s) => x(s)).attr('width', x.bandwidth()).attr('y', (s) => y(above(cur, s))).attr('height', (s) => y(0) - y(above(cur, s))).attr('rx', 1.5)
      .attr('fill', (s) => (s === strike ? 'var(--s2)' : 'var(--ink-faint)')).attr('fill-opacity', moved(cur) ? 0.85 : 1);
    g.append('text').attr('class', 'note').attr('text-anchor', 'middle').attr('x', (s) => x(s) + x.bandwidth() / 2).attr('y', (s) => y(Math.max(above(cur, s), moved(cur) ? above(cur, s, 0, 1) : 0)) - 6)
      .style('fill', (s) => (s === strike ? 'var(--ink)' : 'var(--ink-soft)')).text((s) => pc(above(cur, s)));
  });

  function select(c) {
    cur = c; pickStrike(); sf.set(A(cur)); ss.set(+SD(cur).toFixed(2));
    history.replaceState(null, '', '#' + c.slug);
    paint();
  }
  function paint() {
    const c = center(cur);
    btns.forEach((b, i) => { b.setAttribute('aria-pressed', C[i] === cur); b.classList.toggle('adj', moved(C[i])); });
    document.getElementById('city-name').textContent = cur.name;
    document.getElementById('city-sub').textContent = `${cur.ticker} · data through ${fmtMonth(parseMonth(cur.last_month))}`;
    document.getElementById('say').innerHTML = `November center <b>${usdFull(c)}</b>, ${sgn(chg(cur, c))}% from September's ${usdFull(cur.last)}` +
      (A(cur) ? ` (adjusted ${sgn(A(cur))} pp)` : '') + `. Standard deviation ${SD(cur).toFixed(2)}%. The middle 80% runs from ${usdFull(quantile(cur, 0.1))} to ${usdFull(quantile(cur, 0.9))}.`;
    document.getElementById('adj-note').textContent = `Percentage points of the November value. The model's own growth: ${sgn(cur.growth)}%. Director's suggestion: ${sgn(cur.director_adj)} pp.`;
    sf.box.input.classList.toggle('changed', !!A(cur));
    ss.box.input.classList.toggle('changed', !!sdv[cur.slug]);
    document.getElementById('sd-note').textContent = `Percent of the November value. The model's: ${cur.sd0.toFixed(2)}% (its own forecast error ${cur.sd_growth.toFixed(2)}%, Zillow's restatement ${cur.sd_restate.toFixed(2)}%).`;
    document.getElementById('reset').disabled = !moved(cur);
    document.getElementById('found').innerHTML = cur.found.map((s) => `<li>${s}</li>`).join('');
    document.getElementById('gaps').textContent = 'Gaps: ' + cur.gaps;
    const mine = C.filter(moved);
    document.getElementById('mine').textContent = mine.length ? 'Your changes (saved in this browser): ' + mine.map((x) => `${x.name}` + (adj[x.slug] ? ` center ${sgn(adj[x.slug])} pp` : '') + (sdv[x.slug] ? ` sd ${sdv[x.slug].toFixed(2)}%` : '')).join(' · ') : '';
    overview.redraw(); series.redraw(); dist.redraw(); ladder.redraw();
  }
  paint();
}).catch((e) => {
  document.getElementById('overview').insertAdjacentHTML('afterbegin', '<p class="muted">The model could not be loaded. Reload the page.</p>');
  console.error(e);
});
