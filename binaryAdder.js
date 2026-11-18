/**
 * Experiment 3 — n-bit Binary Adder (ripple carry: cascaded full adders)
 *   Si   = Ai ⊕ Bi ⊕ Ci
 *   Ci+1 = Ai·Bi + Ci·(Ai ⊕ Bi)
 */
(function () {
  'use strict';
  const { h, Svg } = Sim;
  const WIDTHS = [4, 8, 16];
  const nets = {};
  const netFor = (w) => (nets[w] = nets[w] || Logic.rippleAdderNetlist(w));
  const refs = {};

  const clampWord = (v, w) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n & Logic.mask(w) : 0;
  };

  Sim.registerExperiment({
    id: 'binary-adder',
    number: 3,
    short: 'RCA',
    title: 'Binary Adder',
    subtitle: 'Multi-bit addition with full adders connected in series (ripple-carry adder).',
    summary: '4 / 8 / 16-bit ripple-carry adder.',

    defaultState: () => ({ width: 4, a: 0b1011, b: 0b0110, cin: 0, sel: 0 }),
    sanitize(s) {
      const width = WIDTHS.includes(Number(s.width)) ? Number(s.width) : 4;
      const sel = Math.min(Math.max(0, Math.floor(Number(s.sel)) || 0), width - 1);
      return { width, a: clampWord(s.a, width), b: clampWord(s.b, width), cin: s.cin ? 1 : 0, sel };
    },
    structureKey: (s) => `w${s.width}`,
    compute(s) {
      const m = Logic.evaluateNetlist(netFor(s.width), Logic.wordInputs(s.a, s.b, s.width, { C0: s.cin }));
      m.ref = Logic.rippleCarryAdd(s.a, s.b, s.width, s.cin);
      return m;
    },
    onReset: () => {
      refs.inspSel = null;
    },

    testStates: () => [
      { width: 4, a: 0b1011, b: 0b0110, cin: 0 },
      { width: 4, a: 15, b: 1, cin: 0 },
      { width: 8, a: 200, b: 100, cin: 1 },
      { width: 8, a: 255, b: 0, cin: 1 },
      { width: 16, a: 0xffff, b: 1, cin: 0 },
      { width: 16, a: 0x1234, b: 0x4321, cin: 1 },
    ],
    verify(model, s) {
      const w = s.width;
      const got = Logic.readWord(model.values, 'S', w) + model.values[`C${w}`] * 2 ** w;
      return got === s.a + s.b + s.cin ? [] : [`ripple adder ${s.a}+${s.b}+${s.cin} gave ${got}`];
    },

    /* ---------------- Circuit: chain of full-adder blocks ---------------- */
    renderCircuit(host, ctx) {
      const w = ctx.state.width;
      const cw = 96;
      const left = 110;
      const W = left + w * cw + 130;
      const yC = 175;
      const c = Svg.create(host, W, 335, `${w}-bit ripple carry adder built from ${w} full adders`, { minWidth: w === 16 ? 1300 : w === 8 ? 860 : 0 });
      const toggleBit = (word, i) => () => ctx.setState({ [word]: ctx.state[word] ^ (1 << i) });

      for (let i = 0; i < w; i++) {
        const bx = left + (w - 1 - i) * cw + 16;
        // operand pins + wires into the block
        Svg.pin(c.pins, { sig: `A${i}`, x: bx + 16, y: 55, r: 11, label: `A${i}`, labelPos: 'top', onToggle: toggleBit('a', i) });
        Svg.pin(c.pins, { sig: `B${i}`, x: bx + 48, y: 55, r: 11, label: `B${i}`, labelPos: 'top', onToggle: toggleBit('b', i) });
        Svg.wire(c.wires, `A${i}`, [[bx + 16, 66], [bx + 16, 125]]);
        Svg.wire(c.wires, `B${i}`, [[bx + 48, 66], [bx + 48, 125]]);
        // block
        const g = Svg.el('g', { class: 'fa-block', 'data-sig': `C${i + 1}`, 'data-stage': i, tabindex: 0, role: 'button', 'aria-label': `Inspect full adder stage ${i}` }, c.gates);
        Svg.el('title', { text: `Full adder stage ${i} — click to inspect its gates` }, g);
        Svg.el('rect', { x: bx, y: 125, width: 64, height: 100, rx: 10, class: 'fa-rect' }, g);
        Svg.el('text', { x: bx + 32, y: 160, class: 'fa-name', 'text-anchor': 'middle', text: `FA${i}` }, g);
        Svg.el('text', { x: bx + 32, y: 182, class: 'fa-sub', 'text-anchor': 'middle', text: 'A+B+C' }, g);
        Svg.el('text', { x: bx + 6, y: yC + 32, class: 'fa-port', text: 'Cout' }, g);
        Svg.el('text', { x: bx + 58, y: yC + 32, class: 'fa-port', 'text-anchor': 'end', text: 'Cin' }, g);
        const pick = () => ctx.setState({ sel: i });
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        });
        // sum output
        Svg.wire(c.wires, `S${i}`, [[bx + 32, 225], [bx + 32, 263]]);
        Svg.pin(c.pins, { sig: `S${i}`, x: bx + 32, y: 274, r: 11, label: `S${i}`, labelPos: 'bottom', kind: 'out' });
        // carry to the next (more significant) stage
        if (i < w - 1) {
          Svg.wire(c.wires, `C${i + 1}`, [[bx, yC], [bx - 32, yC]], `Carry C${i + 1}: FA${i} → FA${i + 1}`);
          Svg.label(c.labels, bx - 16, yC - 12, `C${i + 1}`, 'sig-label sm');
        }
      }
      // carry in (C0) from the right, carry out from the left
      const lsbRight = left + (w - 1) * cw + 80;
      const xCin = left + w * cw + 60;
      Svg.pin(c.pins, { sig: 'C0', x: xCin, y: yC, label: 'Cin (C0)', labelPos: 'top', onToggle: () => ctx.setState({ cin: ctx.state.cin ? 0 : 1 }) });
      Svg.wire(c.wires, 'C0', [[xCin - 14, yC], [lsbRight, yC]]);
      Svg.wire(c.wires, `C${w}`, [[left + 16, yC], [left - 46, yC]], `Final carry C${w}`);
      Svg.pin(c.pins, { sig: `C${w}`, x: left - 60, y: yC, label: `Cout (C${w})`, labelPos: 'top', kind: 'out' });
      Svg.label(c.labels, W / 2, 325, 'Carry ripples right → left · click an FA block to see its gates · click A/B terminals to flip bits', 'hint-label');

      // Gate-level inspector for the selected stage
      refs.inspHost = h('div', { class: 'inspector' });
      refs.inspSel = null;
      host.append(refs.inspHost);
    },

    mount(ctx) {
      refs.width = Sim.createSegmented({
        label: 'Bit width',
        options: WIDTHS.map((w) => ({ value: w, label: `${w}-bit`, tip: `${w}-bit operands` })),
        value: ctx.state.width,
        onChange: (w) => ctx.setState({ width: w }),
      });
      refs.inA = Sim.createBinaryInput({ name: 'A', label: 'Input A', width: ctx.state.width, value: ctx.state.a, onChange: (v) => ctx.setState({ a: v }) });
      refs.inB = Sim.createBinaryInput({ name: 'B', label: 'Input B', width: ctx.state.width, value: ctx.state.b, onChange: (v) => ctx.setState({ b: v }) });
      refs.tCin = Sim.createToggle({ label: 'Cin', sub: 'Carry into bit 0', onChange: (v) => ctx.setState({ cin: v }) });
      const preset = (label, tip, fn) => h('button', { type: 'button', class: 'chip-btn', 'data-tip': tip, onclick: fn }, label);
      ctx.inputsHost.append(
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Bit width'), refs.width.el),
        refs.inA.el,
        refs.inB.el,
        refs.tCin.el,
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Examples'),
          h('div', { class: 'chip-row' },
            preset('1011 + 0110', 'The worked example from the lab sheet', () => ctx.setState({ width: 4, a: 0b1011, b: 0b0110, cin: 0 })),
            preset('Worst-case ripple', 'All ones + 1: the carry travels through every stage', () => ctx.setState({ a: Logic.mask(ctx.state.width), b: 1, cin: 0 })),
            preset('Random', 'Random operands', () => {
              const m = Logic.mask(ctx.state.width) + 1;
              ctx.setState({ a: Math.floor(Math.random() * m), b: Math.floor(Math.random() * m) });
            })))
      );

      refs.outHost = h('div', { class: 'out-stack' });
      ctx.outputsHost.append(refs.outHost);

      refs.bitwise = ctx.addTab('bitwise', 'Bit-wise Addition');
      refs.carry = ctx.addTab('carry', 'Carry Propagation');
      refs.delay = ctx.addTab('delay', 'Ripple Delay');
      const th = ctx.addTab('theory', 'Theory');
      refs.result = h('div', {});
      th.append(theory(), h('h3', {}, 'Result'), refs.result);
    },

    refresh(ctx) {
      const { width: w, a, b, cin, sel } = ctx.state;
      const v = ctx.model.values;
      const lv = ctx.model.levels;
      const ref = ctx.model.ref;
      refs.width.set(w);
      refs.inA.set(a, w);
      refs.inB.set(b, w);
      refs.tCin.set(cin);

      // --- inspector (rebuilt only when the selected stage changes) ---
      if (refs.inspSel !== sel) {
        refs.inspSel = sel;
        refs.inspHost.replaceChildren(h('div', { class: 'insp-head' },
          h('b', {}, `Stage inspector — FA${sel} at gate level`),
          h('span', { class: 'muted small' }, `Inputs A${sel}, B${sel}, C${sel} · outputs S${sel}, C${sel + 1}`)));
        Sim.drawFullAdder(refs.inspHost, {
          cls: 'inspector-svg',
          title: `Gate-level view of full adder stage ${sel}`,
          names: { A: `A${sel}`, B: `B${sel}`, Cin: `C${sel}`, P: `P${sel}`, G: `G${sel}`, T: `T${sel}`, S: `S${sel}`, Cout: `C${sel + 1}` },
          labels: { A: `A${sel}`, B: `B${sel}`, Cin: `C${sel}`, P: `P${sel}`, G: `G${sel}`, T: `T${sel}`, S: `S${sel}`, Cout: `C${sel + 1}` },
        });
      }
      ctx.circuitHost.querySelectorAll('.fa-block').forEach((g) => g.classList.toggle('selected', Number(g.getAttribute('data-stage')) === sel));

      // --- outputs (live from displayed signal values) ---
      const s = ctx.shown;
      const shownSum = Logic.readWord(s, 'S', w);
      const shownCout = s[`C${w}`];
      const shownTotal = shownSum + shownCout * 2 ** w;
      let settledStages = 0;
      for (let i = 0; i < w; i++) if (lv[`C${i + 1}`] <= ctx.displayLevel) settledStages++;
      refs.outHost.innerHTML = `
        <div class="word-table">
          <div class="wt-row"><span class="wt-k">A</span><span class="wt-bits">${Sim.bitsHtml(a, w)}</span><span class="wt-n">${a}<small>${Logic.toHex(a, w)}</small></span></div>
          <div class="wt-row"><span class="wt-k">B</span><span class="wt-bits">${Sim.bitsHtml(b, w)}</span><span class="wt-n">${b}<small>${Logic.toHex(b, w)}</small></span></div>
          <div class="wt-row"><span class="wt-k">Cin</span><span class="wt-bits"><span class="bits"><i class="b${cin}">${cin}</i></span></span><span class="wt-n">${cin}</span></div>
          <div class="wt-row total ${ctx.resolved ? '' : 'pending'}"><span class="wt-k">Sum</span><span class="wt-bits">${Sim.sigBitsHtml('S', w, `C${w}`)}</span><span class="wt-n">${shownTotal}<small>${Logic.toHex(shownTotal, w + 4)}</small></span></div>
        </div>
        <div class="led-grid">
          ${ledHtml(`C${w}`, 'Final carry', `C${w} (Cout)`)}
          <div class="stat-tile"><div class="tile-label">Stages settled</div><div class="stat-big mono">${settledStages}<small>/${w}</small></div></div>
        </div>
        <div class="big-eq mono ${ctx.resolved ? '' : 'pending'}">${a} + ${b}${cin ? ' + 1' : ''} = <b>${shownTotal}</b></div>
        <p class="muted small">${ref.cout ? `The result needs ${w + 1} bits: Cout = 1 is the carry out of the most significant stage (an unsigned overflow of the ${w}-bit sum).` : `The result fits in ${w} bits (Cout = 0).`}</p>`;

      // --- bit-wise table ---
      let rows = '';
      for (let i = 0; i < w; i++) {
        const st = ref.stages[i];
        rows += `<tr data-level="${lv[`C${i + 1}`]}" class="${i === sel ? 'sel' : ''}" data-stage="${i}">
          <td class="mono">FA${i}</td><td class="v${st.a}">${st.a}</td><td class="v${st.b}">${st.b}</td>
          <td class="live" data-sig="C${i}" data-sig-text="C${i}">0</td>
          <td class="live" data-sig="S${i}" data-sig-text="S${i}">0</td>
          <td class="live" data-sig="C${i + 1}" data-sig-text="C${i + 1}">0</td>
          <td class="mono muted">${st.a}+${st.b}+${st.cin} = ${st.a + st.b + st.cin}</td></tr>`;
      }
      refs.bitwise.innerHTML = `<p class="muted small">One row per full-adder stage, LSB first. Carry and sum cells update as the carry ripples; click a row to inspect that stage.</p>
        <div class="table-wrap"><table class="truth-table stage-table"><thead><tr><th>Stage</th><th>Aᵢ</th><th>Bᵢ</th><th>Cᵢ (in)</th><th class="col-out">Sᵢ</th><th class="col-out">Cᵢ₊₁ (out)</th><th>Arithmetic</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      refs.bitwise.querySelectorAll('tr[data-stage]').forEach((tr) => tr.addEventListener('click', () => ctx.setState({ sel: Number(tr.getAttribute('data-stage')) })));

      // --- carry propagation: long-hand addition + per-stage steps ---
      const col = (content, cls) => `<span class="lh-cell ${cls || ''}">${content}</span>`;
      let carryRow = col('', 'lh-blank');
      let aRow = col('', 'lh-blank');
      let bRow = col('+', 'lh-op');
      let sRow = col('', 'live', `C${w}`).replace('class="lh-cell live"', `class="lh-cell live" data-sig="C${w}" data-sig-text="C${w}"`);
      for (let i = w - 1; i >= 0; i--) {
        carryRow += `<span class="lh-cell live carry" data-sig="C${i}" data-sig-text="C${i}"></span>`;
        aRow += col((a >> i) & 1);
        bRow += col((b >> i) & 1);
        sRow += `<span class="lh-cell live" data-sig="S${i}" data-sig-text="S${i}"></span>`;
      }
      const chain = longestChain(ref.stages);
      refs.carry.innerHTML = `
        <div class="longhand mono" style="--cols:${w + 1}">
          <span class="lh-label">Carry in</span><div class="lh-line">${carryRow}</div>
          <span class="lh-label">A</span><div class="lh-line">${aRow}</div>
          <span class="lh-label">B</span><div class="lh-line">${bRow}</div>
          <span class="lh-label">Sum</span><div class="lh-line sum">${sRow}</div>
        </div>
        <p class="muted small">Longest carry ripple for these operands: <b>${chain}</b> stage${chain === 1 ? '' : 's'}. The hardware must still wait for the worst case (${w} stages).</p>
        <div class="steps-host"></div>`;
      const steps = [{ level: 0, num: 'In', label: 'Operands applied', expr: `A = ${Logic.toBin(a, w)}, B = ${Logic.toBin(b, w)}, C0 = ${cin}` }];
      for (let i = 0; i < w; i++) {
        const st = ref.stages[i];
        steps.push({
          level: lv[`C${i + 1}`], num: `FA${i}`,
          label: `Stage ${i}: A${i} + B${i} + C${i}`,
          expr: `${st.a} + ${st.b} + ${st.cin} = ${st.a + st.b + st.cin} = (${st.cout}${st.sum})₂`,
          result: `S${i} = ${st.sum}, carry C${i + 1} = ${st.cout} → FA${i + 1 < w ? i + 1 : ' out'}`,
        });
      }
      steps.push({ level: lv[`C${w}`], num: 'Final', label: 'Result', expr: `${Logic.toBin(a, w)} + ${Logic.toBin(b, w)}${cin ? ' + 1' : ''} = ${Logic.toBin(ref.total, w + 1)}`, result: `= ${ref.total} (decimal), ${Logic.toHex(ref.total, w + 4)}` });
      Sim.renderSteps(refs.carry.querySelector('.steps-host'), steps);

      // --- delay tab ---
      const dm = Logic.delayModel(w);
      let arrivals = '';
      for (let j = 1; j <= w; j++) arrivals += `<span class="arr" data-level="${lv[`C${j}`]}">C${j}<b>t=${lv[`C${j}`]}</b></span>`;
      refs.delay.innerHTML = `
        <div class="prose">
          <p>In a ripple-carry adder each full adder must wait for the carry from the stage to its right. With one unit delay per gate,
          a stage needs <b>2 gate delays</b> (AND then OR) to turn an incoming carry into its own carry-out, after the first XOR/AND level.</p>
          <div class="eq-block mono">t(Cⱼ) = 2j + 1 &nbsp;&nbsp;&nbsp; t(S of MSB) = 2n &nbsp;&nbsp;&nbsp; t(Cout) = 2n + 1</div>
          <p>For this ${w}-bit adder the final carry is valid after <b>${dm.rca.carryOut}</b> gate delays. Carry arrival times (they light up as the propagation meter passes them):</p>
          <div class="arrivals">${arrivals}</div>
          <table class="cmp-table"><thead><tr><th>Width n</th><th>Full adders</th><th>Gates</th><th>Cout ready (2n+1)</th></tr></thead><tbody>
          ${[4, 8, 16, 32].map((n) => `<tr class="${n === w ? 'hl' : ''}"><td>${n}-bit</td><td>${n}</td><td>${5 * n}</td><td>${2 * n + 1} gate delays</td></tr>`).join('')}
          </tbody></table>
          <p>The delay grows <b>linearly</b> with the number of bits. That is why fast processors use carry look-ahead (Experiment 4) or similar techniques instead of a plain ripple chain.</p>
          <p class="muted small">Timing in this simulator is structural (worst case): every signal is shown after its longest gate path, regardless of the data.</p>
        </div>`;

      refs.result.innerHTML = `<p>The ${w}-bit ripple-carry adder was simulated with ${w} cascaded full adders. For A = ${Logic.toBin(a, w)} (${a}) and
        B = ${Logic.toBin(b, w)} (${b})${cin ? ' with Cin = 1' : ''}, the circuit gives <b>${Logic.toBin(ref.total, w + 1)}</b> = ${ref.total},
        which equals the arithmetic sum. The final carry settles after ${dm.rca.carryOut} gate delays.</p>`;
    },
  });

  function ledHtml(sig, label, expr) {
    return `<div class="led-tile" data-sig="${sig}"><span class="led"></span><div><div class="tile-label">${label}</div><div class="tile-expr mono">${expr}</div></div><span class="tile-val mono" data-sig-text="${sig}">0</span></div>`;
  }
  Sim.ledHtml = ledHtml;

  /** Longest distance (in stages) any carry travels for these operands. */
  function longestChain(stages) {
    let best = 0;
    let cur = 0;
    for (const st of stages) {
      if (st.g === 1) cur = 1; // carry generated here
      else if (st.p === 1 && st.cin === 1) cur += 1; // carry passes through
      else cur = 0;
      best = Math.max(best, cur);
    }
    return best;
  }

  function theory() {
    return h('div', { class: 'prose', html: `
      <h3>Aim</h3>
      <p>To add two n-bit binary numbers (n = 4, 8, 16) using full adders connected in cascade, and to observe carry propagation.</p>
      <h3>Theory</h3>
      <p>An <b>n-bit parallel binary adder</b> uses n full adders, one per bit position. All operand bits are applied at the same
      time, but the carry-out of stage <i>i</i> is the carry-in of stage <i>i + 1</i>. The carry therefore "ripples" from the least
      significant bit to the most significant bit, giving the name <b>ripple-carry adder (RCA)</b>.</p>
      <p>The sum has n bits plus a final carry Cₙ. Treating Cₙ as an extra bit gives the full (n + 1)-bit result, e.g.
      1011 + 0110 = 1 0001 (11 + 6 = 17).</p>
      <h3>Boolean expressions (stage i)</h3>
      <div class="eq-block mono">Sᵢ   = Aᵢ ⊕ Bᵢ ⊕ Cᵢ<br>Cᵢ₊₁ = AᵢBᵢ + Cᵢ(Aᵢ ⊕ Bᵢ)</div>
      <h3>Ripple delay</h3>
      <p>Because each stage waits for the previous carry, the worst-case delay is proportional to n (2n + 1 gate delays in this model).
      The worst case occurs when a carry is generated at bit 0 and every higher stage propagates it, e.g. 1111 + 0001.</p>
      <h3>Procedure</h3>
      <ol>
        <li>Choose the bit width (4, 8 or 16).</li>
        <li>Enter A and B by typing binary, clicking bit switches, using + / − or clicking the A/B terminals in the diagram.</li>
        <li>Set Cin if required. Press <b>Step</b> repeatedly to watch the carry move from FA0 to the MSB.</li>
        <li>Click any FA block to inspect its gates. Compare the final sum with the decimal and hex read-outs.</li>
      </ol>` });
  }
})();
