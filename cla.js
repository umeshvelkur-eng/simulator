/**
 * Experiment 4 — Carry Look-Ahead Adder (4 or 8 bit)
 *   Gi = Ai · Bi           Pi = Ai ⊕ Bi
 *   Cj = G(j-1) + P(j-1)G(j-2) + ... + P(j-1)…P0·C0   (two-level AND–OR, all in parallel)
 *   Si = Pi ⊕ Ci
 */
(function () {
  'use strict';
  const { h, Svg } = Sim;
  const WIDTHS = [4, 8];
  const nets = {};
  const netFor = (w) => (nets[w] = nets[w] || Logic.claNetlist(w));
  const refs = {};
  const clampWord = (v, w) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n & Logic.mask(w) : 0;
  };

  /** Compact chip label for a product term, e.g. "P2P1G0" or "P7–1·G0". */
  function shortTerm(term) {
    const tail = term.kind === 'G' ? `G${term.k}` : 'C0';
    if (term.ps.length === 0) return tail;
    if (term.ps.length <= 2) return term.ps.map((m) => `P${m}`).join('') + tail;
    return `P${term.ps[0]}–${term.ps[term.ps.length - 1]}·${tail}`;
  }

  Sim.registerExperiment({
    id: 'cla',
    number: 4,
    short: 'CLA',
    title: 'Carry Look-Ahead Adder',
    subtitle: 'Computes every carry in parallel from Generate and Propagate signals.',
    summary: 'Generate / propagate logic, parallel carries.',

    defaultState: () => ({ width: 4, a: 0b1011, b: 0b0101, cin: 0 }),
    sanitize(s) {
      const width = WIDTHS.includes(Number(s.width)) ? Number(s.width) : 4;
      return { width, a: clampWord(s.a, width), b: clampWord(s.b, width), cin: s.cin ? 1 : 0 };
    },
    structureKey: (s) => `w${s.width}`,
    compute(s) {
      const m = Logic.evaluateNetlist(netFor(s.width), Logic.wordInputs(s.a, s.b, s.width, { C0: s.cin }));
      m.ref = Logic.claAdd(s.a, s.b, s.width, s.cin);
      return m;
    },

    testStates: () => [
      { width: 4, a: 0b1011, b: 0b0101, cin: 0 },
      { width: 4, a: 15, b: 0, cin: 1 },
      { width: 4, a: 9, b: 6, cin: 1 },
      { width: 8, a: 0xff, b: 0x01, cin: 0 },
      { width: 8, a: 0xa5, b: 0x5a, cin: 1 },
    ],
    verify(model, s) {
      const w = s.width;
      const out = [];
      const got = Logic.readWord(model.values, 'S', w) + model.values[`C${w}`] * 2 ** w;
      if (got !== s.a + s.b + s.cin) out.push(`CLA ${s.a}+${s.b}+${s.cin} gave ${got}`);
      const ref = Logic.claAdd(s.a, s.b, w, s.cin);
      for (let j = 1; j <= w; j++) if (model.values[`C${j}`] !== ref.recursive[j]) out.push(`CLA carry C${j} mismatch`);
      return out;
    },

    /* ---------------- Circuit ---------------- */
    renderCircuit(host, ctx) {
      const w = ctx.state.width;
      const cw = 130;
      const left = 40;
      const colCenter = (c) => left + c * cw + cw / 2;
      const cxBit = (i) => colCenter(w - i); // column 0 is the Cout column
      const W = left + (w + 1) * cw + 110;
      const boxTop = 190;
      const gy = 228; // top of the OR groups
      const chipH = 15;
      const chipGap = 3;
      const boxBottom = gy + 26 + (w + 1) * (chipH + chipGap) + 12;
      const sumY = boxBottom + 34;
      const pinY = sumY + 80;
      const H = pinY + 40;
      const c = Svg.create(host, W, H, `${w}-bit carry look-ahead adder: generate/propagate cells, look-ahead network and sum XOR gates`, { minWidth: w === 8 ? 1150 : 0 });
      const toggleBit = (word, i) => () => ctx.setState({ [word]: ctx.state[word] ^ (1 << i) });

      // Look-ahead network background box
      Svg.el('rect', { x: left + 6, y: boxTop, width: (w + 1) * cw - 12, height: boxBottom - boxTop, rx: 14, class: 'net-box' }, c.back);
      Svg.label(c.labels, left + 22, boxTop + 18, 'CARRY LOOK-AHEAD NETWORK · each chip = one AND term (t = 2) · each column ORs its terms (t = 3)', 'box-title', 'start');

      const termsByCarry = netFor(w).termsByCarry;
      const groupBottom = {};

      // OR groups C1..Cn (C_j sits under the bit that consumes it; Cn under the Cout column)
      for (let j = 1; j <= w; j++) {
        const cx = j === w ? colCenter(0) : cxBit(j);
        const terms = Logic.lookaheadTermStructure(j);
        const gh = 24 + terms.length * (chipH + chipGap);
        const g = Svg.el('g', { class: 'or-group', 'data-sig': `C${j}` }, c.gates);
        Svg.el('title', { text: `C${j} = ${terms.map(Logic.describeTerm).join(' + ')}` }, g);
        Svg.el('rect', { x: cx - 36, y: gy, width: 72, height: gh, rx: 8, class: 'or-rect' }, g);
        Svg.el('text', { x: cx, y: gy + 12, class: 'or-title', 'text-anchor': 'middle', 'dominant-baseline': 'central', text: `C${j} = OR` }, g);
        terms.forEach((term, k) => {
          const sig = Logic.claTermSignal(j, term);
          const y = gy + 22 + k * (chipH + chipGap);
          const chip = Svg.el('g', { class: 'term-chip', 'data-sig': sig }, c.gates);
          Svg.el('title', { text: `${Logic.describeTerm(term)}  (${term.ps.length ? 'AND term' : 'direct generate'})` }, chip);
          Svg.el('rect', { x: cx - 31, y, width: 62, height: chipH, rx: 4 }, chip);
          Svg.el('text', { x: cx, y: y + chipH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', text: shortTerm(term) }, chip);
        });
        groupBottom[j] = gy + gh;
        void termsByCarry;
      }
      // C0 pass-through cell under bit 0
      const cx0 = cxBit(0);
      const c0g = Svg.el('g', { class: 'or-group c0', 'data-sig': 'C0' }, c.gates);
      Svg.el('rect', { x: cx0 - 36, y: gy, width: 72, height: 30, rx: 8, class: 'or-rect' }, c0g);
      Svg.el('text', { x: cx0, y: gy + 15, class: 'or-title', 'text-anchor': 'middle', 'dominant-baseline': 'central', text: 'C0 = Cin' }, c0g);
      groupBottom[0] = gy + 30;

      // Carry-in pin on the right
      const xCin = left + (w + 1) * cw + 50;
      Svg.pin(c.pins, { sig: 'C0', x: xCin, y: gy + 15, label: 'Cin (C0)', labelPos: 'top', onToggle: () => ctx.setState({ cin: ctx.state.cin ? 0 : 1 }) });
      Svg.wire(c.wires, 'C0', [[xCin - 14, gy + 15], [cx0 + 36, gy + 15]], 'C0 enters the network (used by every carry term)');

      for (let i = 0; i < w; i++) {
        const cx = cxBit(i);
        // operand pins
        Svg.pin(c.pins, { sig: `A${i}`, x: cx - 30, y: 44, r: 11, label: `A${i}`, labelPos: 'top', onToggle: toggleBit('a', i) });
        Svg.pin(c.pins, { sig: `B${i}`, x: cx + 30, y: 44, r: 11, label: `B${i}`, labelPos: 'top', onToggle: toggleBit('b', i) });
        // generate / propagate cell
        const px = Svg.gate(c.gates, { type: 'XOR', x: cx - 14, y: 104, rot: 90, scale: 0.75, sig: `P${i}`, tip: `P${i} = A${i} ⊕ B${i} (propagate)` });
        const ga = Svg.gate(c.gates, { type: 'AND', x: cx + 47, y: 104, rot: 90, scale: 0.75, sig: `G${i}`, tip: `G${i} = A${i} · B${i} (generate)` });
        Svg.wire(c.wires, `A${i}`, [[cx - 30, 55], [cx - 30, 72], [px.in[1][0], 72], px.in[1]]);
        Svg.wire(c.wires, `A${i}`, [[cx - 30, 72], [ga.in[1][0], 72], ga.in[1]]);
        Svg.dot(c.dots, `A${i}`, cx - 30, 72);
        Svg.wire(c.wires, `B${i}`, [[cx + 30, 55], [cx + 30, 86], [ga.in[0][0], 86], ga.in[0]]);
        Svg.wire(c.wires, `B${i}`, [[cx + 30, 86], [px.in[0][0], 86], px.in[0]]);
        Svg.dot(c.dots, `B${i}`, cx + 30, 86);
        Svg.label(c.labels, px.out[0] - 12, px.out[1] + 10, `P${i}`, 'sig-label sm', 'end');
        Svg.label(c.labels, ga.out[0] + 12, ga.out[1] + 10, `G${i}`, 'sig-label sm', 'start');
        // G into the network
        Svg.wire(c.wires, `G${i}`, [ga.out, [ga.out[0], boxTop + 4]], `G${i} → look-ahead network`);
        // P into the network and down to the sum gate
        const sx = Svg.gate(c.gates, { type: 'XOR', x: cx + 16, y: sumY, rot: 90, scale: 0.75, sig: `S${i}`, tip: `S${i} = P${i} ⊕ C${i}` });
        const tapY = 172;
        Svg.wire(c.wires, `P${i}`, [px.out, [px.out[0], boxTop + 4]], `P${i} → look-ahead network`);
        Svg.wire(c.wires, `P${i}`, [[px.out[0], tapY], [cx - 56, tapY], [cx - 56, sumY - 20], [sx.in[1][0], sumY - 20], sx.in[1]], `P${i} → sum gate S${i}`);
        Svg.dot(c.dots, `P${i}`, px.out[0], tapY);
        // carry into the sum gate
        Svg.wire(c.wires, `C${i}`, [[cx, groupBottom[i]], [cx, sumY - 10], [sx.in[0][0], sumY - 10], sx.in[0]], `C${i} → sum gate S${i}`);
        // sum output
        Svg.wire(c.wires, `S${i}`, [sx.out, [sx.out[0], pinY - 11]]);
        Svg.pin(c.pins, { sig: `S${i}`, x: sx.out[0], y: pinY, r: 11, label: `S${i}`, labelPos: 'bottom', kind: 'out' });
      }
      // final carry
      const cxo = colCenter(0);
      Svg.wire(c.wires, `C${w}`, [[cxo, groupBottom[w]], [cxo, pinY - 14]]);
      Svg.pin(c.pins, { sig: `C${w}`, x: cxo, y: pinY, label: `Cout (C${w})`, labelPos: 'bottom', kind: 'out' });
    },

    mount(ctx) {
      refs.width = Sim.createSegmented({
        label: 'Bit width',
        options: WIDTHS.map((w) => ({ value: w, label: `${w}-bit` })),
        value: ctx.state.width,
        onChange: (w) => ctx.setState({ width: w }),
      });
      refs.inA = Sim.createBinaryInput({ name: 'A', label: 'Input A', width: ctx.state.width, value: ctx.state.a, onChange: (v) => ctx.setState({ a: v }) });
      refs.inB = Sim.createBinaryInput({ name: 'B', label: 'Input B', width: ctx.state.width, value: ctx.state.b, onChange: (v) => ctx.setState({ b: v }) });
      refs.tCin = Sim.createToggle({ label: 'Cin', sub: 'Initial carry C0', onChange: (v) => ctx.setState({ cin: v }) });
      const preset = (label, tip, fn) => h('button', { type: 'button', class: 'chip-btn', 'data-tip': tip, onclick: fn }, label);
      ctx.inputsHost.append(
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Bit width'), refs.width.el),
        refs.inA.el, refs.inB.el, refs.tCin.el,
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Examples'),
          h('div', { class: 'chip-row' },
            preset('Long propagate chain', 'All Pi = 1 and Cin = 1: ripple worst case, CLA still 3 delays', () => ctx.setState({ a: Logic.mask(ctx.state.width), b: 0, cin: 1 })),
            preset('All generate', 'A = B = all ones', () => ctx.setState({ a: Logic.mask(ctx.state.width), b: Logic.mask(ctx.state.width), cin: 0 })),
            preset('Random', 'Random operands', () => {
              const m = Logic.mask(ctx.state.width) + 1;
              ctx.setState({ a: Math.floor(Math.random() * m), b: Math.floor(Math.random() * m) });
            })))
      );
      refs.outHost = h('div', { class: 'out-stack' });
      ctx.outputsHost.append(refs.outHost);

      refs.gp = ctx.addTab('gp', 'Generate / Propagate');
      refs.eq = ctx.addTab('equations', 'Carry Equations');
      refs.cmp = ctx.addTab('compare', 'RCA vs CLA');
      const th = ctx.addTab('theory', 'Theory');
      refs.result = h('div', {});
      th.append(theory(), h('h3', {}, 'Result'), refs.result);
    },

    refresh(ctx) {
      const { width: w, a, b, cin } = ctx.state;
      const ref = ctx.model.ref;
      refs.width.set(w);
      refs.inA.set(a, w);
      refs.inB.set(b, w);
      refs.tCin.set(cin);

      const s = ctx.shown;
      const total = Logic.readWord(s, 'S', w) + s[`C${w}`] * 2 ** w;
      let carryBits = '<span class="bits live">';
      for (let j = w; j >= 1; j--) carryBits += `<i class="sbit" data-sig="C${j}" data-sig-text="C${j}" title="C${j}">0</i>${j % 4 === 0 && j !== w ? '<i class="nib"></i>' : ''}`;
      carryBits += '</span>';
      refs.outHost.innerHTML = `
        <div class="word-table">
          <div class="wt-row"><span class="wt-k">A</span><span class="wt-bits">${Sim.bitsHtml(a, w)}</span><span class="wt-n">${a}<small>${Logic.toHex(a, w)}</small></span></div>
          <div class="wt-row"><span class="wt-k">B</span><span class="wt-bits">${Sim.bitsHtml(b, w)}</span><span class="wt-n">${b}<small>${Logic.toHex(b, w)}</small></span></div>
          <div class="wt-row"><span class="wt-k">G</span><span class="wt-bits">${Sim.sigBitsHtml('G', w)}</span><span class="wt-n muted">A·B</span></div>
          <div class="wt-row"><span class="wt-k">P</span><span class="wt-bits">${Sim.sigBitsHtml('P', w)}</span><span class="wt-n muted">A⊕B</span></div>
          <div class="wt-row"><span class="wt-k">C${w}…C1</span><span class="wt-bits">${carryBits}</span><span class="wt-n muted">t = 3</span></div>
          <div class="wt-row total ${ctx.resolved ? '' : 'pending'}"><span class="wt-k">Sum</span><span class="wt-bits">${Sim.sigBitsHtml('S', w, `C${w}`)}</span><span class="wt-n">${total}<small>${Logic.toHex(total, w + 4)}</small></span></div>
        </div>
        <div class="led-grid">${Sim.ledHtml(`C${w}`, 'Carry out', `C${w}`)}
          <div class="stat-tile"><div class="tile-label">Delay to Cout</div><div class="stat-big mono">3<small> vs ${2 * w + 1} RCA</small></div></div></div>
        <div class="big-eq mono ${ctx.resolved ? '' : 'pending'}">${a} + ${b}${cin ? ' + 1' : ''} = <b>${total}</b></div>`;

      // Generate / propagate table
      let rows = '';
      for (let i = 0; i < w; i++) {
        const ai = (a >> i) & 1;
        const bi = (b >> i) & 1;
        rows += `<tr><td class="mono">${i}</td><td class="v${ai}">${ai}</td><td class="v${bi}">${bi}</td>
          <td class="live" data-sig="G${i}" data-sig-text="G${i}">0</td><td class="live" data-sig="P${i}" data-sig-text="P${i}">0</td>
          <td class="live" data-sig="C${i}" data-sig-text="C${i}">0</td><td class="live" data-sig="S${i}" data-sig-text="S${i}">0</td>
          <td class="muted small">${ref.g[i] ? 'generates a carry' : ref.p[i] ? 'propagates a carry' : 'kills the carry'}</td></tr>`;
      }
      refs.gp.innerHTML = `<p class="muted small">Gᵢ = Aᵢ·Bᵢ (this bit creates a carry by itself) · Pᵢ = Aᵢ⊕Bᵢ (this bit passes an incoming carry on) · Sᵢ = Pᵢ ⊕ Cᵢ</p>
        <div class="table-wrap"><table class="truth-table stage-table"><thead><tr><th>i</th><th>Aᵢ</th><th>Bᵢ</th><th class="col-mid">Gᵢ</th><th class="col-mid">Pᵢ</th><th>Cᵢ</th><th class="col-out">Sᵢ</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table></div>`;

      // Carry equations: recursive and expanded (parallel) forms with values
      let eqs = '';
      for (let j = 1; j <= w; j++) {
        const i = j - 1;
        const terms = ref.terms[j];
        const rec = `C${j} = G${i} + P${i}·C${i} = ${ref.g[i]} + ${ref.p[i]}·${ref.recursive[i]} = <b>${ref.recursive[j]}</b>`;
        const exp = terms.map((t) => `<span class="term ${t.value ? 'on' : ''}" title="${t.label} = ${t.value}">${t.label}<sub>=${t.value}</sub></span>`).join('<span class="plus">+</span>');
        eqs += `<div class="carry-eq" data-level="3">
          <div class="ceq-head"><b class="mono">C${j}</b><span class="ceq-val v${ref.carries[j]}">${ref.carries[j]}</span></div>
          <div class="ceq-line mono"><span class="muted">recursive:</span> ${rec}</div>
          <div class="ceq-line mono"><span class="muted">look-ahead:</span> C${j} = ${exp}</div></div>`;
      }
      refs.eq.innerHTML = `<p class="muted small">The simulator implements the <b>look-ahead (expanded)</b> form — each carry depends only on G, P and C0.
        The recursive form is shown alongside to prove both give identical carries${ref.carries.every((c, k) => c === ref.recursive[k]) ? ' ✓' : ' ✗'}.</p>${eqs}
        <div class="eq-block mono">Sᵢ = Pᵢ ⊕ Cᵢ → S = ${Logic.toBin(ref.sum, w)}, Cout = ${ref.cout}</div>`;

      // RCA vs CLA comparison (rebuilt only when width changes, to keep the race animation alive)
      if (refs.cmpWidth !== w) {
        refs.cmpWidth = w;
        buildComparison(refs.cmp, w);
      }
      refs.cmpUpdate(ref);

      refs.result.innerHTML = `<p>The ${w}-bit carry look-ahead adder was simulated. For A = ${Logic.toBin(a, w)} and B = ${Logic.toBin(b, w)}${cin ? ', Cin = 1' : ''}
        it produced S = <b>${Logic.toBin(ref.sum, w)}</b> with Cout = <b>${ref.cout}</b> (= ${ref.sum + ref.cout * 2 ** w}), matching normal addition.
        All carries were available after 3 gate delays, compared with ${2 * w + 1} for a ripple-carry adder.</p>`;
    },
  });

  /** Timing race between a ripple-carry and a look-ahead adder of the same width. */
  function buildComparison(host, w) {
    const T = 2 * w + 2;
    const rows = [];
    let lanes = '';
    for (let j = 1; j <= w; j++) {
      const r = 2 * j + 1;
      lanes += `<div class="race-row"><span class="race-k mono">C${j}</span>
        <div class="race-track"><div class="race-bar rca" style="width:${(r / T) * 100}%"><span>${r}</span></div></div>
        <div class="race-track"><div class="race-bar cla" style="width:${(3 / T) * 100}%"><span>3</span></div></div>
        <span class="race-val mono" data-j="${j}"></span></div>`;
      rows.push({ j, rca: r });
    }
    host.innerHTML = `
      <div class="race">
        <div class="race-head"><span></span><b>Ripple carry (Cⱼ ready at 2j + 1)</b><b>Look-ahead (all at 3)</b><span>Value</span></div>
        ${lanes}
        <div class="race-row axis"><span></span><div class="race-axis" data-t="0"><i class="race-cursor"></i></div><div class="race-axis"><i class="race-cursor"></i></div><span></span></div>
        <div class="row-actions"><button type="button" class="btn race-btn">▶ Run timing race</button><span class="race-clock mono">t = 0</span></div>
      </div>
      <div class="prose">
        <table class="cmp-table"><thead><tr><th>Width</th><th>RCA carry-out</th><th>CLA carry-out (one level)</th><th>Largest CLA gate fan-in</th></tr></thead><tbody>
        ${[4, 8, 16, 32].map((n) => `<tr class="${n === w ? 'hl' : ''}"><td>${n}-bit</td><td>${2 * n + 1}</td><td>3</td><td>${n + 1} inputs</td></tr>`).join('')}
        </tbody></table>
        <p><b>Why it is faster:</b> in the ripple adder, C4 needs C3, which needs C2, which needs C1 — a serial chain. The look-ahead network
        substitutes each equation into the next, so C4 is written directly in terms of G, P and C0 and evaluated by one AND level and one OR level.</p>
        <p><b>The price:</b> gate count and fan-in grow quickly (Cₙ needs an (n+1)-input AND and OR). Practical designs therefore build 4-bit CLA
        blocks and combine them with a second look-ahead level (block generate / propagate) — giving roughly logarithmic delay.</p>
      </div>`;
    const btn = host.querySelector('.race-btn');
    const clock = host.querySelector('.race-clock');
    const cursors = host.querySelectorAll('.race-cursor');
    const bars = host.querySelectorAll('.race-bar');
    let raf = null;
    let current = null;
    function paint(t) {
      clock.textContent = `t = ${t.toFixed(1)} gate delays`;
      cursors.forEach((c) => (c.style.left = `${(t / T) * 100}%`));
      host.querySelectorAll('.race-row:not(.axis)').forEach((row, k) => {
        const j = k + 1;
        row.querySelector('.rca').classList.toggle('ready', t >= 2 * j + 1);
        row.querySelector('.cla').classList.toggle('ready', t >= 3);
        const val = row.querySelector('.race-val');
        if (current) val.textContent = t >= 3 ? current.carries[j] : '?';
      });
    }
    btn.addEventListener('click', () => {
      cancelAnimationFrame(raf);
      const start = performance.now();
      const duration = 450 * T;
      const tick = (now) => {
        const t = Math.min(T, ((now - start) / duration) * T);
        paint(t);
        if (t < T) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    refs.cmpUpdate = (ref) => {
      current = ref;
      host.querySelectorAll('.race-val').forEach((el) => (el.textContent = ref.carries[Number(el.getAttribute('data-j'))]));
    };
    void bars;
    paint(T);
  }

  function theory() {
    return h('div', { class: 'prose', html: `
      <h3>Aim</h3>
      <p>To design a carry look-ahead adder using generate and propagate signals, implement its carry equations directly, and compare its
      delay with a ripple-carry adder.</p>
      <h3>Theory</h3>
      <p>The speed of a ripple-carry adder is limited by the carry travelling through every stage. A <b>carry look-ahead adder (CLA)</b>
      predicts all carries at once. For every bit two signals are formed in a single gate delay:</p>
      <ul>
        <li><b>Generate</b> Gᵢ = AᵢBᵢ — the bit produces a carry regardless of the incoming carry.</li>
        <li><b>Propagate</b> Pᵢ = Aᵢ ⊕ Bᵢ — the bit passes an incoming carry to the next position.</li>
      </ul>
      <p>So Cᵢ₊₁ = Gᵢ + PᵢCᵢ. Substituting repeatedly removes every carry from the right-hand side:</p>
      <div class="eq-block mono">C1 = G0 + P0·C0
C2 = G1 + P1·G0 + P1·P0·C0
C3 = G2 + P2·G1 + P2·P1·G0 + P2·P1·P0·C0
C4 = G3 + P3·G2 + P3·P2·G1 + P3·P2·P1·G0 + P3·P2·P1·P0·C0
Sᵢ = Pᵢ ⊕ Cᵢ</div>
      <p>Each carry is now a two-level AND–OR (sum-of-products) expression of signals that are all ready at t = 1, so every carry is ready at
      t = 3 and every sum at t = 4, independent of the word length (ignoring fan-in limits).</p>
      <h3>Procedure</h3>
      <ol>
        <li>Choose 4-bit or 8-bit width and enter A, B and the initial carry.</li>
        <li>Press <b>Step</b>: at t = 1 all G/P cells switch, at t = 2 all AND terms (chips), at t = 3 all carries together, at t = 4 the sums.</li>
        <li>Open <b>Carry Equations</b> to read each carry in recursive and look-ahead form.</li>
        <li>Open <b>RCA vs CLA</b> and run the timing race.</li>
      </ol>` });
  }
})();
