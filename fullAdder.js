/**
 * Experiment 2 — Full Adder (2 XOR, 2 AND, 1 OR)
 *   P    = A ⊕ B
 *   Sum  = P ⊕ Cin            = A ⊕ B ⊕ Cin
 *   G    = A · B
 *   T    = P · Cin
 *   Cout = G + T              = AB + Cin(A ⊕ B)
 */
(function () {
  'use strict';
  const { h, Svg } = Sim;
  const NET = Logic.fullAdderNetlist();

  const ROWS = [];
  for (let A = 0; A <= 1; A++)
    for (let B = 0; B <= 1; B++)
      for (let Cin = 0; Cin <= 1; Cin++) {
        const f = Logic.fullAdder(A, B, Cin);
        ROWS.push({ id: `${A}${B}${Cin}`, values: { A, B, Cin, P: f.p, S: f.sum, Cout: f.cout } });
      }

  const DEFAULT_NAMES = { A: 'A', B: 'B', Cin: 'Cin', P: 'P', G: 'G', T: 'T', S: 'S', Cout: 'Cout' };

  /**
   * Draws the gate-level full adder. `names` maps the logical role of each
   * signal to the netlist signal name, so the same drawing is reused as the
   * stage inspector of the multi-bit adder (e.g. A -> "A3", Cin -> "C3").
   */
  Sim.drawFullAdder = function (host, opts) {
    const n = Object.assign({}, DEFAULT_NAMES, opts.names || {});
    const lab = Object.assign({ A: 'A', B: 'B', Cin: 'Cin', S: 'Sum', Cout: 'Cout', P: 'P', G: 'G', T: 'T' }, opts.labels || {});
    const tg = opts.onToggle;
    const c = Svg.create(host, 800, 330, opts.title || 'Full adder logic diagram', { cls: opts.cls });

    const x1 = Svg.gate(c.gates, { type: 'XOR', x: 230, y: 50, sig: n.P, tip: `XOR 1: ${lab.P} = ${lab.A} ⊕ ${lab.B}` });
    const a1 = Svg.gate(c.gates, { type: 'AND', x: 230, y: 150, sig: n.G, tip: `AND 1: ${lab.G} = ${lab.A} · ${lab.B}` });
    const x2 = Svg.gate(c.gates, { type: 'XOR', x: 430, y: 70, sig: n.S, tip: `XOR 2: Sum = ${lab.P} ⊕ ${lab.Cin}` });
    const a2 = Svg.gate(c.gates, { type: 'AND', x: 430, y: 200, sig: n.T, tip: `AND 2: ${lab.T} = ${lab.P} · ${lab.Cin}` });
    const or = Svg.gate(c.gates, { type: 'OR', x: 600, y: 160, sig: n.Cout, tip: `OR: Cout = ${lab.G} + ${lab.T}` });

    const yA = x1.in[0][1];
    const yB = 120;
    const yC = 290;
    Svg.pin(c.pins, { sig: n.A, x: 70, y: yA, label: lab.A, onToggle: tg && tg('A') });
    Svg.pin(c.pins, { sig: n.B, x: 70, y: yB, label: lab.B, onToggle: tg && tg('B') });
    Svg.pin(c.pins, { sig: n.Cin, x: 70, y: yC, label: lab.Cin, onToggle: tg && tg('Cin') });

    // A -> XOR1, AND1
    Svg.wire(c.wires, n.A, [[84, yA], x1.in[0]]);
    Svg.wire(c.wires, n.A, [[140, yA], [140, a1.in[0][1]], a1.in[0]]);
    Svg.dot(c.dots, n.A, 140, yA);
    // B -> XOR1, AND1
    Svg.wire(c.wires, n.B, [[84, yB], [180, yB], [180, x1.in[1][1]], x1.in[1]]);
    Svg.wire(c.wires, n.B, [[180, yB], [180, a1.in[1][1]], a1.in[1]]);
    Svg.dot(c.dots, n.B, 180, yB);
    // P -> XOR2, AND2
    Svg.wire(c.wires, n.P, [x1.out, [350, x1.out[1]], [350, x2.in[0][1]], x2.in[0]], `${lab.P} = ${lab.A} ⊕ ${lab.B}`);
    Svg.wire(c.wires, n.P, [[350, x2.in[0][1]], [350, a2.in[0][1]], a2.in[0]], `${lab.P} = ${lab.A} ⊕ ${lab.B}`);
    Svg.dot(c.dots, n.P, 350, x2.in[0][1]);
    // Cin -> AND2, XOR2
    Svg.wire(c.wires, n.Cin, [[84, yC], [390, yC], [390, a2.in[1][1]], a2.in[1]]);
    Svg.wire(c.wires, n.Cin, [[390, a2.in[1][1]], [390, x2.in[1][1]], x2.in[1]]);
    Svg.dot(c.dots, n.Cin, 390, a2.in[1][1]);
    // G -> OR, T -> OR
    Svg.wire(c.wires, n.G, [a1.out, or.in[0]], `${lab.G} = ${lab.A} · ${lab.B}`);
    Svg.wire(c.wires, n.T, [a2.out, [550, a2.out[1]], [550, or.in[1][1]], or.in[1]], `${lab.T} = ${lab.P} · ${lab.Cin}`);
    // outputs
    Svg.wire(c.wires, n.S, [x2.out, [700, x2.out[1]]]);
    Svg.wire(c.wires, n.Cout, [or.out, [700, or.out[1]]]);
    Svg.pin(c.pins, { sig: n.S, x: 714, y: x2.out[1], label: lab.S, labelPos: 'right', kind: 'out' });
    Svg.pin(c.pins, { sig: n.Cout, x: 714, y: or.out[1], label: lab.Cout, labelPos: 'right', kind: 'out' });

    Svg.label(c.labels, 318, x1.out[1] - 12, lab.P);
    Svg.label(c.labels, 318, a1.out[1] - 12, lab.G);
    Svg.label(c.labels, 522, a2.out[1] - 12, lab.T);
    Svg.label(c.labels, 590, x2.out[1] - 14, 'Sum = A ⊕ B ⊕ Cin');
    Svg.label(c.labels, 714, or.out[1] + 38, 'Cout = AB + Cin(A ⊕ B)');
    return c;
  };

  const refs = {};

  Sim.registerExperiment({
    id: 'full-adder',
    number: 2,
    short: 'FA',
    title: 'Full Adder',
    subtitle: 'Adds three bits — A, B and a carry-in — producing Sum and Carry-out.',
    summary: '2 XOR, 2 AND and 1 OR gate.',

    defaultState: () => ({ A: 1, B: 1, Cin: 0 }),
    sanitize: (s) => ({ A: s.A ? 1 : 0, B: s.B ? 1 : 0, Cin: s.Cin ? 1 : 0 }),
    compute: (s) => Logic.evaluateNetlist(NET, { A: s.A, B: s.B, Cin: s.Cin }),

    keys: {
      a: (ctx) => ctx.setState({ A: ctx.state.A ? 0 : 1 }),
      b: (ctx) => ctx.setState({ B: ctx.state.B ? 0 : 1 }),
      c: (ctx) => ctx.setState({ Cin: ctx.state.Cin ? 0 : 1 }),
    },

    testStates: () => ROWS.map((r) => ({ A: r.values.A, B: r.values.B, Cin: r.values.Cin })),
    verify(model, s) {
      const total = s.A + s.B + s.Cin;
      const out = [];
      if (model.values.S !== (total & 1)) out.push(`FA sum mismatch for ${s.A}${s.B}${s.Cin}`);
      if (model.values.Cout !== total >> 1) out.push(`FA carry mismatch for ${s.A}${s.B}${s.Cin}`);
      return out;
    },

    renderCircuit(host, ctx) {
      Sim.drawFullAdder(host, {
        title: 'Full adder logic diagram with two XOR, two AND and one OR gate',
        onToggle: (k) => () => ctx.setState({ [k]: ctx.state[k] ? 0 : 1 }),
      });
    },

    mount(ctx) {
      refs.tA = Sim.createToggle({ label: 'A', sub: 'Input bit', key: 'a', onChange: (v) => ctx.setState({ A: v }) });
      refs.tB = Sim.createToggle({ label: 'B', sub: 'Input bit', key: 'b', onChange: (v) => ctx.setState({ B: v }) });
      refs.tC = Sim.createToggle({ label: 'Cin', sub: 'Carry in', key: 'c', onChange: (v) => ctx.setState({ Cin: v }) });
      ctx.inputsHost.append(
        h('div', { class: 'toggle-stack' }, refs.tA.el, refs.tB.el, refs.tC.el),
        h('p', { class: 'muted small' }, 'Keys ', h('kbd', {}, 'A'), ' ', h('kbd', {}, 'B'), ' ', h('kbd', {}, 'C'), ' toggle the inputs. Terminals in the diagram are clickable too.')
      );

      refs.decimal = h('div', { class: 'big-eq mono' });
      ctx.outputsHost.append(
        h('div', { class: 'led-grid' }, Sim.ledTile('S', 'Sum', 'A ⊕ B ⊕ Cin'), Sim.ledTile('Cout', 'Carry-out', 'AB + Cin(A⊕B)')),
        h('div', { class: 'out-row' }, h('span', { class: 'out-k' }, 'Binary result (Cout S)'), h('span', { class: 'out-v mono', html: '<i class="sbit" data-sig="Cout" data-sig-text="Cout">0</i><i class="sbit" data-sig="S" data-sig-text="S">0</i>' })),
        refs.decimal,
        h('h3', { class: 'mini-title' }, 'Intermediate signals'),
        h('div', { class: 'chip-row' },
          chip('P', 'A ⊕ B', 'XOR 1'),
          chip('G', 'A · B', 'AND 1'),
          chip('T', 'Cin · (A ⊕ B)', 'AND 2'))
      );

      const tt = ctx.addTab('truth', 'Truth Table');
      refs.table = Sim.createTruthTable({
        columns: [
          { key: 'A', label: 'A' }, { key: 'B', label: 'B' }, { key: 'Cin', label: 'Cin' },
          { key: 'P', label: 'A⊕B', group: 'mid', tip: 'Intermediate signal P' },
          { key: 'S', label: 'Sum', group: 'out' }, { key: 'Cout', label: 'Cout', group: 'out' },
        ],
        rows: ROWS,
      });
      refs.sweepMsg = h('span', { class: 'muted small' });
      refs.sweepBtn = h('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          refs.table.clearMarks();
          refs.sweepBtn.textContent = 'Stop';
          refs.sweepMsg.textContent = 'Verifying…';
          ctx.sweep(ROWS, {
            apply: (r) => ctx.setState({ A: r.values.A, B: r.values.B, Cin: r.values.Cin }),
            check: (r, shown) => shown.S === r.values.S && shown.Cout === r.values.Cout,
            mark: (r, ok) => refs.table.mark(r.id, ok),
            onDone: (done, ok) => {
              refs.sweepBtn.textContent = 'Verify all 8 combinations';
              refs.sweepMsg.textContent = done ? (ok ? 'All 8 rows match the circuit ✓' : 'Mismatch found ✗') : 'Stopped.';
            },
          });
        },
      }, 'Verify all 8 combinations');
      tt.append(refs.table.el, h('div', { class: 'row-actions' }, refs.sweepBtn, refs.sweepMsg));

      refs.steps = ctx.addTab('steps', 'Step-by-step');
      ctx.addTab('compare', 'Half vs Full').append(comparison());
      const th = ctx.addTab('theory', 'Theory');
      refs.result = h('div', {});
      th.append(theory(), h('h3', {}, 'Result'), refs.result);
    },

    refresh(ctx) {
      const { A, B, Cin } = ctx.state;
      const v = ctx.model.values;
      refs.tA.set(A);
      refs.tB.set(B);
      refs.tC.set(Cin);
      refs.table.highlight(`${A}${B}${Cin}`);
      const s = ctx.shown;
      refs.decimal.innerHTML = `${A} + ${B} + ${Cin} = <b>${s.Cout * 2 + s.S}</b><small>₁₀</small>`;
      refs.decimal.classList.toggle('pending', !ctx.resolved);

      Sim.renderSteps(refs.steps, [
        { level: 0, label: 'Read the inputs', expr: `A = ${A}, B = ${B}, Cin = ${Cin}` },
        { level: 1, label: 'XOR 1: A ⊕ B', expr: `P = A ⊕ B = ${A} ⊕ ${B}`, result: `P = ${v.P}` },
        { level: 2, label: 'XOR 2: (A ⊕ B) ⊕ Cin', expr: `S = P ⊕ Cin = ${v.P} ⊕ ${Cin}`, result: `Sum = ${v.S}` },
        { level: 1, label: 'AND 1: A · B', expr: `G = A · B = ${A} · ${B}`, result: `G = ${v.G}` },
        { level: 2, label: 'AND 2: Cin · (A ⊕ B)', expr: `T = Cin · P = ${Cin} · ${v.P}`, result: `T = ${v.T}` },
        { level: 3, label: 'OR: Carry-out', expr: `Cout = G + T = ${v.G} + ${v.T}`, result: `Cout = ${v.Cout}` },
        { level: 3, num: 'Final', label: 'Result', expr: `${A} + ${B} + ${Cin} = (${v.Cout}${v.S})₂ = ${2 * v.Cout + v.S}₁₀`, result: `Sum = ${v.S}, Carry = ${v.Cout}` },
      ], 'Steps 1 and 3 happen in parallel (t = 1); steps 2 and 4 at t = 2; the carry-out is ready at t = 3 gate delays.');

      refs.result.innerHTML = `<p>The full adder was simulated and verified against its 8-row truth table. For A = <b>${A}</b>,
        B = <b>${B}</b>, Cin = <b>${Cin}</b> the circuit gives Sum = <b>${v.S}</b> and Carry-out = <b>${v.Cout}</b>,
        i.e. ${A} + ${B} + ${Cin} = ${2 * v.Cout + v.S}.</p>`;
    },
  });

  function chip(sig, expr, gate) {
    return h('div', { class: 'sig-chip', 'data-sig': sig, title: `${gate} output` },
      h('span', { class: 'chip-name mono' }, sig), h('span', { class: 'chip-expr mono' }, expr), h('b', { class: 'chip-val mono', 'data-sig-text': sig }, '0'));
  }
  Sim.sigChip = chip;

  function comparison() {
    return h('div', { class: 'prose', html: `
      <table class="cmp-table">
        <thead><tr><th>Feature</th><th>Half Adder</th><th>Full Adder</th></tr></thead>
        <tbody>
          <tr><td>Inputs</td><td>2 (A, B)</td><td>3 (A, B, Cin)</td></tr>
          <tr><td>Outputs</td><td>Sum, Carry</td><td>Sum, Carry-out</td></tr>
          <tr><td>Accepts carry from previous bit</td><td>No</td><td>Yes</td></tr>
          <tr><td>Sum</td><td class="mono">A ⊕ B</td><td class="mono">A ⊕ B ⊕ Cin</td></tr>
          <tr><td>Carry</td><td class="mono">A · B</td><td class="mono">AB + Cin(A ⊕ B)</td></tr>
          <tr><td>Gates</td><td>1 XOR, 1 AND</td><td>2 XOR, 2 AND, 1 OR</td></tr>
          <tr><td>Worst-case delay</td><td>1 gate delay</td><td>3 gate delays (to Cout)</td></tr>
          <tr><td>Use</td><td>LSB only (no carry in)</td><td>Every bit of a multi-bit adder</td></tr>
        </tbody>
      </table>
      <h3>A full adder is two half adders plus an OR gate</h3>
      <p>The first half adder (XOR 1 + AND 1) adds A and B, giving P = A ⊕ B and G = A·B. The second half adder
      (XOR 2 + AND 2) adds P and Cin, giving the final Sum and T = P·Cin. A carry-out occurs if <i>either</i> half adder
      produced a carry, so Cout = G + T. Both carries can never be 1 at the same time, which is why an OR gate is enough.</p>` });
  }

  function theory() {
    return h('div', { class: 'prose', html: `
      <h3>Aim</h3>
      <p>To design and verify a full adder using two XOR gates, two AND gates and one OR gate, and to study its intermediate signals.</p>
      <h3>Theory</h3>
      <p>When numbers wider than one bit are added, every column except the least significant one must add <b>three</b> bits:
      the two operand bits and the carry coming from the column to its right. A <b>full adder</b> does this. The three bits
      can add up to 0–3, so the result fits in two bits: <b>Sum</b> (2⁰) and <b>Carry-out</b> (2¹).</p>
      <p>Sum is 1 when an odd number of inputs are 1 (three-input XOR). Carry-out is 1 when at least two inputs are 1 — either
      A and B are both 1 (<i>generate</i>), or exactly one of them is 1 and a carry arrives (<i>propagate</i>).</p>
      <h3>Boolean expressions</h3>
      <div class="eq-block mono">Sum       = A ⊕ B ⊕ Cin<br>Carry-out = A·B + Cin·(A ⊕ B)</div>
      <h3>Procedure</h3>
      <ol>
        <li>Set A, B and Cin with the switches or keyboard keys A, B, C.</li>
        <li>Use <b>Step</b> to watch the signal pass XOR 1 / AND 1 (t = 1), XOR 2 / AND 2 (t = 2) and the OR gate (t = 3).</li>
        <li>Read the intermediate signals P, G, T and the outputs; compare with the highlighted truth-table row.</li>
        <li>Press <b>Verify all 8 combinations</b> to test the whole truth table automatically.</li>
      </ol>` });
  }
})();
