/**
 * Experiment 5 — Parallel Adder / Subtractor (4 or 8 bit, two's complement)
 *   Mode M = 0 : Result = A + B
 *   Mode M = 1 : Result = A + (~B) + 1 = A − B
 *   B'i = Bi ⊕ M,  C0 = M,  V (overflow) = Cn ⊕ C(n−1)
 */
(function () {
  'use strict';
  const { h, Svg } = Sim;
  const WIDTHS = [4, 8];
  const nets = {};
  const netFor = (w) => (nets[w] = nets[w] || Logic.addSubNetlist(w));
  const refs = {};
  const clampWord = (v, w) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n & Logic.mask(w) : 0;
  };
  const sgn = (n) => (n < 0 ? `−${-n}` : String(n));

  Sim.registerExperiment({
    id: 'add-sub',
    number: 5,
    short: '±',
    title: 'Parallel Adder / Subtractor',
    subtitle: 'One circuit that adds or subtracts, using XOR-controlled inversion and two’s complement.',
    summary: 'Mode-controlled XOR gates + full adders.',

    defaultState: () => ({ width: 4, a: 5, b: 3, mode: 1 }),
    sanitize(s) {
      const width = WIDTHS.includes(Number(s.width)) ? Number(s.width) : 4;
      return { width, a: clampWord(s.a, width), b: clampWord(s.b, width), mode: s.mode ? 1 : 0 };
    },
    structureKey: (s) => `w${s.width}`,
    compute(s) {
      const m = Logic.evaluateNetlist(netFor(s.width), Logic.wordInputs(s.a, s.b, s.width, { M: s.mode }));
      m.ref = Logic.addSubtract(s.a, s.b, s.width, s.mode);
      return m;
    },
    keys: {
      m: (ctx) => ctx.setState({ mode: ctx.state.mode ? 0 : 1 }),
    },

    testStates: () => [
      { width: 4, a: 5, b: 3, mode: 1 },
      { width: 4, a: 3, b: 5, mode: 1 },
      { width: 4, a: 7, b: 1, mode: 0 },
      { width: 4, a: 8, b: 1, mode: 1 },
      { width: 8, a: 100, b: 27, mode: 0 },
      { width: 8, a: 27, b: 100, mode: 1 },
      { width: 8, a: 127, b: 1, mode: 0 },
      { width: 8, a: 128, b: 1, mode: 1 },
    ],
    verify(model, s) {
      const w = s.width;
      const mod = 2 ** w;
      const expected = s.mode ? (s.a - s.b + mod) % mod : (s.a + s.b) % mod;
      const out = [];
      if (Logic.readWord(model.values, 'S', w) !== expected) out.push(`add/sub result wrong for ${s.a} ${s.mode ? '-' : '+'} ${s.b}`);
      const sa = Logic.toSigned(s.a, w);
      const sb = Logic.toSigned(s.b, w);
      const exact = s.mode ? sa - sb : sa + sb;
      const ovf = exact < -(mod / 2) || exact > mod / 2 - 1 ? 1 : 0;
      if (model.values.V !== ovf) out.push(`overflow flag wrong for ${sa} ${s.mode ? '-' : '+'} ${sb}`);
      return out;
    },

    /* ---------------- Circuit ---------------- */
    renderCircuit(host, ctx) {
      const w = ctx.state.width;
      const cw = 120;
      const left = 150;
      const cx = (i) => left + (w - 1 - i) * cw + cw / 2;
      const W = left + w * cw + 170;
      const busY = 92;
      const yC = 240;
      const c = Svg.create(host, W, 450, `${w}-bit parallel adder/subtractor with mode-controlled XOR gates and overflow detection`, { minWidth: w === 8 ? 1100 : 0 });
      const toggleBit = (word, i) => () => ctx.setState({ [word]: ctx.state[word] ^ (1 << i) });

      const xM = left + w * cw + 110;
      const xJ = left + w * cw + 40;
      Svg.pin(c.pins, { sig: 'M', x: xM, y: busY, label: 'M (mode)', labelPos: 'top', onToggle: () => ctx.setState({ mode: ctx.state.mode ? 0 : 1 }), tip: 'Mode: 0 = ADD, 1 = SUBTRACT — click to toggle' });
      Svg.label(c.labels, xM, busY + 30, '0 = ADD', 'hint-label');
      Svg.label(c.labels, xM, busY + 44, '1 = SUB', 'hint-label');
      // mode bus across all XOR gates
      Svg.wire(c.wires, 'M', [[xM - 14, busY], [cx(w - 1) + 31, busY]], 'Mode line M');
      // C0 = M
      Svg.dot(c.dots, 'M', xJ, busY);
      Svg.wire(c.wires, 'C0', [[xJ, busY], [xJ, yC], [cx(0) + 45, yC]], 'C0 = M (adds the +1 of two’s complement when subtracting)');
      Svg.label(c.labels, xJ + 8, yC - 40, 'C0 = M', 'sig-label sm', 'start');

      for (let i = 0; i < w; i++) {
        const x = cx(i);
        Svg.pin(c.pins, { sig: `A${i}`, x: x - 30, y: 40, r: 11, label: `A${i}`, labelPos: 'top', onToggle: toggleBit('a', i) });
        Svg.pin(c.pins, { sig: `B${i}`, x: x + 22, y: 40, r: 11, label: `B${i}`, labelPos: 'top', onToggle: toggleBit('b', i) });
        const xg = Svg.gate(c.gates, { type: 'XOR', x: x + 40, y: 112, rot: 90, scale: 0.75, sig: `X${i}`, tip: `B'${i} = B${i} ⊕ M (inverts B${i} when subtracting)` });
        Svg.wire(c.wires, `B${i}`, [[x + 22, 51], [x + 22, 76], [xg.in[1][0], 76], xg.in[1]]);
        Svg.wire(c.wires, 'M', [[xg.in[0][0], busY], xg.in[0]]);
        Svg.dot(c.dots, 'M', xg.in[0][0], busY);
        Svg.wire(c.wires, `X${i}`, [xg.out, [xg.out[0], 200]], `B'${i} = B${i} ⊕ M`);
        Svg.label(c.labels, xg.out[0] + 8, 184, `B'${i}`, 'sig-label sm', 'start');
        Svg.wire(c.wires, `A${i}`, [[x - 30, 51], [x - 30, 200]]);
        // full adder block
        const g = Svg.el('g', { class: 'fa-block', 'data-sig': `C${i + 1}` }, c.gates);
        Svg.el('title', { text: `Full adder ${i}: S${i} = A${i} ⊕ B'${i} ⊕ C${i}` }, g);
        Svg.el('rect', { x: x - 45, y: 200, width: 90, height: 80, rx: 10, class: 'fa-rect' }, g);
        Svg.el('text', { x, y: 236, class: 'fa-name', 'text-anchor': 'middle', text: `FA${i}` }, g);
        Svg.el('text', { x, y: 256, class: 'fa-sub', 'text-anchor': 'middle', text: "A + B' + C" }, g);
        // sum
        Svg.wire(c.wires, `S${i}`, [[x, 280], [x, 319]]);
        Svg.pin(c.pins, { sig: `S${i}`, x, y: 330, r: 11, label: `S${i}`, labelPos: 'bottom', kind: 'out' });
        if (i < w - 1) {
          Svg.wire(c.wires, `C${i + 1}`, [[x - 45, yC], [x - 75, yC]], `Carry C${i + 1}`);
          Svg.label(c.labels, x - 60, yC - 12, `C${i + 1}`, 'sig-label sm');
        }
      }
      // carry out and overflow detector V = Cn ⊕ Cn-1
      const msbLeft = cx(w - 1) - 45;
      Svg.wire(c.wires, `C${w}`, [[msbLeft, yC], [54, yC]], `Final carry C${w}`);
      Svg.pin(c.pins, { sig: `C${w}`, x: 40, y: yC, label: `Cout (C${w})`, labelPos: 'top', kind: 'out' });
      const ov = Svg.gate(c.gates, { type: 'XOR', x: 128, y: 330, rot: 90, scale: 0.75, sig: 'V', tip: `Overflow V = C${w} ⊕ C${w - 1}` });
      Svg.dot(c.dots, `C${w}`, ov.in[1][0], yC);
      Svg.wire(c.wires, `C${w}`, [[ov.in[1][0], yC], ov.in[1]]);
      const tapX = cx(w - 1) + 60;
      Svg.dot(c.dots, `C${w - 1}`, tapX, yC);
      Svg.wire(c.wires, `C${w - 1}`, [[tapX, yC], [tapX, 300], [ov.in[0][0], 300], ov.in[0]], `C${w - 1} → overflow detector`);
      Svg.wire(c.wires, 'V', [ov.out, [ov.out[0], 393]]);
      Svg.pin(c.pins, { sig: 'V', x: ov.out[0], y: 406, r: 13, label: 'V (overflow)', labelPos: 'right', kind: 'out' });
      Svg.label(c.labels, W / 2 + 40, 432, 'Click M to switch ADD ⇄ SUBTRACT · click A/B terminals to flip bits', 'hint-label');
    },

    mount(ctx) {
      refs.mode = Sim.createSegmented({
        label: 'Operation mode',
        options: [
          { value: 0, label: 'ADD  (M = 0)', tip: 'Result = A + B' },
          { value: 1, label: 'SUBTRACT  (M = 1)', tip: 'Result = A + ~B + 1 (key M toggles)' },
        ],
        value: ctx.state.mode,
        onChange: (m) => ctx.setState({ mode: m }),
      });
      refs.width = Sim.createSegmented({
        label: 'Bit width',
        options: WIDTHS.map((w) => ({ value: w, label: `${w}-bit` })),
        value: ctx.state.width,
        onChange: (w) => ctx.setState({ width: w }),
      });
      refs.inA = Sim.createBinaryInput({ name: 'A', label: 'Input A', width: ctx.state.width, value: ctx.state.a, showSigned: true, onChange: (v) => ctx.setState({ a: v }) });
      refs.inB = Sim.createBinaryInput({ name: 'B', label: 'Input B', width: ctx.state.width, value: ctx.state.b, showSigned: true, onChange: (v) => ctx.setState({ b: v }) });
      const preset = (label, tip, fn) => h('button', { type: 'button', class: 'chip-btn', 'data-tip': tip, onclick: fn }, label);
      const half = () => 2 ** (ctx.state.width - 1);
      ctx.inputsHost.append(
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Mode'), refs.mode.el),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Bit width'), refs.width.el),
        refs.inA.el, refs.inB.el,
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Test cases'),
          h('div', { class: 'chip-row' },
            preset('5 − 3', 'Positive result', () => ctx.setState({ a: 5, b: 3, mode: 1 })),
            preset('3 − 5', 'Negative result (two’s complement)', () => ctx.setState({ a: 3, b: 5, mode: 1 })),
            preset('max + 1', 'Signed overflow when adding', () => ctx.setState({ a: half() - 1, b: 1, mode: 0 })),
            preset('min − 1', 'Signed overflow when subtracting', () => ctx.setState({ a: half(), b: 1, mode: 1 })),
            preset('−2 + −3', 'Carry out but no overflow', () => ctx.setState({ a: Logic.mask(ctx.state.width) - 1, b: Logic.mask(ctx.state.width) - 2, mode: 0 }))))
      );
      refs.outHost = h('div', { class: 'out-stack' });
      ctx.outputsHost.append(refs.outHost);

      refs.bitwise = ctx.addTab('bitwise', 'Bit-wise Table');
      refs.steps = ctx.addTab('steps', 'Step-by-step');
      refs.twos = ctx.addTab('twos', '2’s Complement');
      const th = ctx.addTab('theory', 'Theory');
      refs.result = h('div', {});
      th.append(theory(), h('h3', {}, 'Result'), refs.result);
    },

    refresh(ctx) {
      const { width: w, a, b, mode } = ctx.state;
      const r = ctx.model.ref;
      const lv = ctx.model.levels;
      refs.mode.set(mode);
      refs.width.set(w);
      refs.inA.set(a, w);
      refs.inB.set(b, w);

      const s = ctx.shown;
      const res = Logic.readWord(s, 'S', w);
      const op = mode ? '−' : '+';
      const expectedSigned = mode ? r.signedA - r.signedB : r.signedA + r.signedB;
      refs.outHost.innerHTML = `
        <div class="op-banner ${mode ? 'sub' : 'add'}"><b>${mode ? 'SUBTRACT' : 'ADD'}</b><span class="mono">${mode ? 'A − B = A + B′ + 1' : 'A + B'}</span></div>
        <div class="word-table">
          <div class="wt-row"><span class="wt-k">A</span><span class="wt-bits">${Sim.bitsHtml(a, w)}</span><span class="wt-n">${sgn(r.signedA)}<small>u ${a}</small></span></div>
          <div class="wt-row"><span class="wt-k">B</span><span class="wt-bits">${Sim.bitsHtml(b, w)}</span><span class="wt-n">${sgn(r.signedB)}<small>u ${b}</small></span></div>
          <div class="wt-row"><span class="wt-k">B′ = B⊕M</span><span class="wt-bits">${Sim.sigBitsHtml('X', w)}</span><span class="wt-n muted">${mode ? 'inverted' : 'unchanged'}</span></div>
          <div class="wt-row"><span class="wt-k">Cin = M</span><span class="wt-bits"><span class="bits live"><i class="sbit" data-sig="C0" data-sig-text="C0">0</i></span></span><span class="wt-n muted">${mode ? '+1' : '+0'}</span></div>
          <div class="wt-row total ${ctx.resolved ? '' : 'pending'}"><span class="wt-k">Result</span><span class="wt-bits">${Sim.sigBitsHtml('S', w)}</span><span class="wt-n">${sgn(Logic.toSigned(res, w))}<small>u ${res} · ${Logic.toHex(res, w)}</small></span></div>
        </div>
        <div class="led-grid">
          ${Sim.ledHtml(`C${w}`, 'Carry out', mode ? `C${w} (1 = no borrow)` : `C${w}`)}
          <div class="led-tile warn" data-sig="V"><span class="led"></span><div><div class="tile-label">Overflow</div><div class="tile-expr mono">V = C${w} ⊕ C${w - 1}</div></div><span class="tile-val mono" data-sig-text="V">0</span></div>
        </div>
        <div class="big-eq mono ${ctx.resolved ? '' : 'pending'}">${sgn(r.signedA)} ${op} ${r.signedB < 0 ? `(${sgn(r.signedB)})` : sgn(r.signedB)} = <b>${sgn(Logic.toSigned(res, w))}</b></div>
        <p class="muted small">${r.overflow
          ? `⚠ Signed overflow: the true answer ${sgn(expectedSigned)} is outside the ${w}-bit range ${-(2 ** (w - 1))} … ${2 ** (w - 1) - 1}, so the result wraps around.`
          : `Signed result is valid (range ${-(2 ** (w - 1))} … ${2 ** (w - 1) - 1}). Unsigned view: ${a} ${op} ${b} → ${r.result}${mode && r.cout === 0 ? ' with a borrow (Cout = 0)' : ''}${!mode && r.cout ? ' with carry out' : ''}.`}</p>`;

      // bit-wise table
      let rows = '';
      for (let i = 0; i < w; i++) {
        const st = r.stages[i];
        const bi = (b >> i) & 1;
        rows += `<tr data-level="${lv[`C${i + 1}`]}"><td class="mono">${i}</td><td class="v${st.a}">${st.a}</td><td class="v${bi}">${bi}</td><td class="v${mode}">${mode}</td>
          <td class="live" data-sig="X${i}" data-sig-text="X${i}">0</td><td class="live" data-sig="C${i}" data-sig-text="C${i}">0</td>
          <td class="live" data-sig="S${i}" data-sig-text="S${i}">0</td><td class="live" data-sig="C${i + 1}" data-sig-text="C${i + 1}">0</td></tr>`;
      }
      refs.bitwise.innerHTML = `<p class="muted small">Each Bᵢ passes through an XOR gate with M before reaching its full adder. With M = 1 every bit is inverted (one’s complement) and C0 = 1 adds the final +1.</p>
        <div class="table-wrap"><table class="truth-table stage-table"><thead><tr><th>i</th><th>Aᵢ</th><th>Bᵢ</th><th>M</th><th class="col-mid">B′ᵢ</th><th>Cᵢ</th><th class="col-out">Sᵢ</th><th class="col-out">Cᵢ₊₁</th></tr></thead><tbody>${rows}</tbody></table></div>
        <h3 class="mini-title">Controlled inverter (XOR) truth table</h3>
        <div class="table-wrap"><table class="truth-table small-table"><thead><tr><th>Bᵢ</th><th>M</th><th class="col-out">B′ᵢ = Bᵢ ⊕ M</th><th>Meaning</th></tr></thead><tbody>
          ${[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, m]) => `<tr class="${m === mode ? 'current-soft' : ''}"><td>${x}</td><td>${m}</td><td class="v${x ^ m}">${x ^ m}</td><td class="muted">${m ? 'inverted' : 'passed through'}</td></tr>`).join('')}
        </tbody></table></div>`;

      // steps
      const steps = [
        { level: 0, label: 'Select operation', expr: `M = ${mode} → ${mode ? 'SUBTRACT' : 'ADD'}; carry-in C0 = M = ${mode}` },
        { level: 1, label: 'XOR every bit of B with M', expr: `B′ = B ⊕ ${String(mode).repeat(w)} = ${Logic.toBin(b, w)} ⊕ ${String(mode).repeat(w)}`, result: `B′ = ${Logic.toBin(r.bx, w)} ${mode ? '(one’s complement of B)' : '(B unchanged)'}` },
      ];
      for (let i = 0; i < w; i++) {
        const st = r.stages[i];
        steps.push({ level: lv[`C${i + 1}`], num: `FA${i}`, label: `Stage ${i}: A${i} + B′${i} + C${i}`, expr: `${st.a} + ${st.b} + ${st.cin} = (${st.cout}${st.sum})₂`, result: `S${i} = ${st.sum}, C${i + 1} = ${st.cout}` });
      }
      steps.push({ level: lv.V, label: 'Overflow detection', expr: `V = C${w} ⊕ C${w - 1} = ${r.carries[w]} ⊕ ${r.carries[w - 1]}`, result: `V = ${r.overflow} ${r.overflow ? '(signed overflow!)' : '(no overflow)'}` });
      steps.push({ level: ctx.model.maxLevel, num: 'Final', label: 'Result', expr: `${Logic.toBin(a, w)} + ${Logic.toBin(r.bx, w)} + ${mode} = ${r.cout} ${Logic.toBin(r.result, w)}`, result: `Result = ${Logic.toBin(r.result, w)} = ${sgn(r.signedResult)} (signed), ${r.result} (unsigned); carry ${r.cout}, overflow ${r.overflow}` });
      Sim.renderSteps(refs.steps, steps);

      // two's complement worked example
      const notB = b ^ Logic.mask(w);
      const negB = (notB + 1) & Logic.mask(w);
      refs.twos.innerHTML = `<div class="prose">
        <p>In two’s complement, <b>−B = ~B + 1</b> (invert every bit, then add one). Subtraction therefore becomes addition:
        <span class="mono">A − B = A + ~B + 1</span>. The hardware gets ~B from the XOR gates and the +1 from C0 = M.</p>
        <div class="calc mono">
          <div><span>B</span><span>${Logic.toBin(b, w)}</span><span>${sgn(r.signedB)}</span></div>
          <div><span>~B (invert)</span><span>${Logic.toBin(notB, w)}</span><span>${sgn(Logic.toSigned(notB, w))}</span></div>
          <div><span>~B + 1 = −B</span><span>${Logic.toBin(negB, w)}</span><span>${sgn(Logic.toSigned(negB, w))}</span></div>
          <div class="sep"><span>A</span><span>${Logic.toBin(a, w)}</span><span>${sgn(r.signedA)}</span></div>
          <div><span>A + (−B)</span><span>${Logic.toBin((a + negB) & Logic.mask(w), w)}</span><span>${sgn(Logic.toSigned((a + negB) & Logic.mask(w), w))}</span></div>
        </div>
        ${mode ? '' : '<p class="muted small">The circuit is currently in ADD mode; switch M to 1 to use this path.</p>'}
        <h3>Signed range of ${w}-bit numbers</h3>
        <table class="cmp-table"><thead><tr><th>Binary</th><th>Unsigned</th><th>Signed (2’s complement)</th></tr></thead><tbody>
          <tr><td class="mono">${'0' + '1'.repeat(w - 1)}</td><td>${2 ** (w - 1) - 1}</td><td>+${2 ** (w - 1) - 1} (largest)</td></tr>
          <tr><td class="mono">${'0'.repeat(w)}</td><td>0</td><td>0</td></tr>
          <tr><td class="mono">${'1'.repeat(w)}</td><td>${2 ** w - 1}</td><td>−1</td></tr>
          <tr><td class="mono">${'1' + '0'.repeat(w - 1)}</td><td>${2 ** (w - 1)}</td><td>−${2 ** (w - 1)} (smallest)</td></tr>
        </tbody></table>
        <h3>Carry vs overflow</h3>
        <ul><li><b>Carry (Cₙ)</b> is about <i>unsigned</i> numbers. When subtracting, Cₙ = 1 means no borrow (A ≥ B) and Cₙ = 0 means a borrow.</li>
        <li><b>Overflow (V)</b> is about <i>signed</i> numbers: the carry into the sign bit differs from the carry out of it, so V = Cₙ ⊕ Cₙ₋₁.</li></ul></div>`;

      refs.result.innerHTML = `<p>The ${w}-bit parallel adder/subtractor was simulated in ${mode ? 'SUBTRACT' : 'ADD'} mode. ${sgn(r.signedA)} ${op} ${sgn(r.signedB)}
        gave ${Logic.toBin(r.result, w)} = <b>${sgn(r.signedResult)}</b> (signed) with carry ${r.cout} and overflow ${r.overflow}${r.overflow ? ' — the true result is out of range' : ''}.
        The same hardware performed both operations; only the mode input changed.</p>`;
    },
  });

  function theory() {
    return h('div', { class: 'prose', html: `
      <h3>Aim</h3>
      <p>To realise a 4-bit / 8-bit parallel adder/subtractor with full adders and XOR gates, and to verify addition, subtraction, carry and
      overflow using two’s complement arithmetic.</p>
      <h3>Theory</h3>
      <p>A separate subtractor circuit is unnecessary. Because −B = ~B + 1 in two’s complement, A − B = A + ~B + 1. A single control input
      <b>M</b> selects the operation:</p>
      <ul>
        <li>Each Bᵢ goes through an XOR gate with M. Since x ⊕ 0 = x and x ⊕ 1 = x′, the XORs pass B unchanged when M = 0 and invert it when M = 1.</li>
        <li>M is also connected to the carry-in C0 of the first full adder, supplying the “+1” during subtraction.</li>
      </ul>
      <div class="eq-block mono">B′ᵢ = Bᵢ ⊕ M        C0 = M
M = 0 : S = A + B
M = 1 : S = A + ~B + 1 = A − B
V = Cₙ ⊕ Cₙ₋₁   (signed overflow)</div>
      <p>Overflow occurs when two numbers of the same sign are added (or numbers of opposite sign are subtracted) and the result has the
      wrong sign — i.e. the true result does not fit in n bits.</p>
      <h3>Procedure</h3>
      <ol>
        <li>Select ADD or SUBTRACT (or click the M terminal / press M).</li>
        <li>Enter A and B. Observe B′ in the XOR row: inverted only in SUBTRACT mode.</li>
        <li>Step through the propagation and note the carry chain, the result, Cout and V.</li>
        <li>Try the test cases for positive, negative and overflow results.</li>
      </ol>` });
  }
})();
