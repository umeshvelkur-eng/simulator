/**
 * Experiment 1 — Half Adder
 *   Sum   = A ⊕ B   (XOR gate)
 *   Carry = A · B   (AND gate)
 */
(function () {
  'use strict';
  const { h, Svg } = Sim;
  const NET = Logic.halfAdderNetlist();

  const ROWS = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([A, B]) => ({
    id: `${A}${B}`,
    values: { A, B, S: A ^ B, C: A & B },
  }));

  const refs = {};

  Sim.registerExperiment({
    id: 'half-adder',
    number: 1,
    short: 'HA',
    title: 'Half Adder',
    subtitle: 'Adds two 1-bit inputs A and B, producing a Sum bit and a Carry bit.',
    summary: 'XOR + AND — the simplest binary adder.',

    defaultState: () => ({ A: 0, B: 0 }),
    sanitize: (s) => ({ A: s.A ? 1 : 0, B: s.B ? 1 : 0 }),
    compute: (s) => Logic.evaluateNetlist(NET, { A: s.A, B: s.B }),

    keys: {
      a: (ctx) => ctx.setState({ A: ctx.state.A ? 0 : 1 }),
      b: (ctx) => ctx.setState({ B: ctx.state.B ? 0 : 1 }),
    },

    testStates: () => ROWS.map((r) => ({ A: r.values.A, B: r.values.B })),
    verify(model, s) {
      const ref = Logic.halfAdder(s.A, s.B);
      const out = [];
      if (model.values.S !== ref.sum) out.push(`HA sum mismatch for A=${s.A} B=${s.B}`);
      if (model.values.C !== ref.carry) out.push(`HA carry mismatch for A=${s.A} B=${s.B}`);
      return out;
    },

    /* ---------------- Circuit diagram ---------------- */
    renderCircuit(host, ctx) {
      const c = Svg.create(host, 640, 270, 'Half adder logic diagram: XOR gate produces Sum, AND gate produces Carry');
      const toggle = (k) => () => ctx.setState({ [k]: ctx.state[k] ? 0 : 1 });

      const xor = Svg.gate(c.gates, { type: 'XOR', x: 300, y: 50, sig: 'S', tip: 'XOR gate: Sum = A ⊕ B' });
      const and = Svg.gate(c.gates, { type: 'AND', x: 300, y: 180, sig: 'C', tip: 'AND gate: Carry = A · B' });

      const yA = xor.in[0][1];
      const yB = and.in[1][1];
      Svg.pin(c.pins, { sig: 'A', x: 70, y: yA, label: 'A', onToggle: toggle('A') });
      Svg.pin(c.pins, { sig: 'B', x: 70, y: yB, label: 'B', onToggle: toggle('B') });

      // A feeds XOR input 1 and AND input 1
      Svg.wire(c.wires, 'A', [[84, yA], xor.in[0]], 'A → XOR');
      Svg.wire(c.wires, 'A', [[150, yA], [150, and.in[0][1]], and.in[0]], 'A → AND');
      Svg.dot(c.dots, 'A', 150, yA);
      // B feeds AND input 2 and XOR input 2
      Svg.wire(c.wires, 'B', [[84, yB], and.in[1]], 'B → AND');
      Svg.wire(c.wires, 'B', [[210, yB], [210, xor.in[1][1]], xor.in[1]], 'B → XOR');
      Svg.dot(c.dots, 'B', 210, yB);

      Svg.wire(c.wires, 'S', [xor.out, [520, xor.out[1]]], 'Sum');
      Svg.wire(c.wires, 'C', [and.out, [520, and.out[1]]], 'Carry');
      Svg.pin(c.pins, { sig: 'S', x: 534, y: xor.out[1], label: 'Sum', labelPos: 'right', kind: 'out' });
      Svg.pin(c.pins, { sig: 'C', x: 534, y: and.out[1], label: 'Carry', labelPos: 'right', kind: 'out' });

      Svg.label(c.labels, 445, xor.out[1] - 14, 'S = A ⊕ B');
      Svg.label(c.labels, 445, and.out[1] - 14, 'C = A · B');
      Svg.label(c.labels, 320, 250, 'Click the A / B terminals to toggle them', 'hint-label');
    },

    /* ---------------- Static UI ---------------- */
    mount(ctx) {
      // Inputs
      refs.tA = Sim.createToggle({ label: 'A', sub: 'Input bit', key: 'a', onChange: (v) => ctx.setState({ A: v }) });
      refs.tB = Sim.createToggle({ label: 'B', sub: 'Input bit', key: 'b', onChange: (v) => ctx.setState({ B: v }) });
      ctx.inputsHost.append(
        h('div', { class: 'toggle-stack' }, refs.tA.el, refs.tB.el),
        h('p', { class: 'muted small' }, 'Tip: press ', h('kbd', {}, 'A'), ' / ', h('kbd', {}, 'B'), ' or click the input terminals in the diagram.')
      );

      // Outputs
      refs.decimal = h('div', { class: 'big-eq mono' });
      ctx.outputsHost.append(
        h('div', { class: 'led-grid' }, ledTile('S', 'Sum', 'A ⊕ B'), ledTile('C', 'Carry', 'A · B')),
        h('div', { class: 'out-row' }, h('span', { class: 'out-k' }, 'Binary result (C S)'), h('span', { class: 'out-v mono', html: '<i class="sbit" data-sig="C" data-sig-text="C">0</i><i class="sbit" data-sig="S" data-sig-text="S">0</i>' })),
        refs.decimal
      );

      // Tabs
      const tt = ctx.addTab('truth', 'Truth Table');
      refs.table = Sim.createTruthTable({
        columns: [
          { key: 'A', label: 'A' }, { key: 'B', label: 'B' },
          { key: 'S', label: 'Sum', group: 'out' }, { key: 'C', label: 'Carry', group: 'out' },
        ],
        rows: ROWS,
      });
      refs.sweepMsg = h('span', { class: 'muted small' });
      refs.sweepBtn = h('button', {
        type: 'button', class: 'btn', 'data-tip': 'Apply each row to the circuit and check the displayed outputs',
        onclick: () => {
          refs.table.clearMarks();
          refs.sweepBtn.textContent = 'Stop';
          refs.sweepMsg.textContent = 'Verifying…';
          ctx.sweep(ROWS, {
            apply: (r) => ctx.setState({ A: r.values.A, B: r.values.B }),
            check: (r, shown) => shown.S === r.values.S && shown.C === r.values.C,
            mark: (r, ok) => refs.table.mark(r.id, ok),
            onDone: (done, ok) => {
              refs.sweepBtn.textContent = 'Verify all 4 combinations';
              refs.sweepMsg.textContent = done ? (ok ? 'All 4 rows match the circuit ✓' : 'Mismatch found ✗') : 'Stopped.';
            },
          });
        },
      }, 'Verify all 4 combinations');
      tt.append(refs.table.el, h('div', { class: 'row-actions' }, refs.sweepBtn, refs.sweepMsg));

      refs.steps = ctx.addTab('steps', 'Step-by-step');
      const th = ctx.addTab('theory', 'Theory');
      refs.result = h('div', {});
      th.append(theory(), h('h3', {}, 'Result'), refs.result);
    },

    refresh(ctx) {
      const { A, B } = ctx.state;
      const { S, C } = ctx.model.values;
      refs.tA.set(A);
      refs.tB.set(B);
      refs.table.highlight(`${A}${B}`);
      const shown = ctx.shown;
      refs.decimal.innerHTML = `${A} + ${B} = <b>${shown.C * 2 + shown.S}</b><small>₁₀</small>`;
      refs.decimal.classList.toggle('pending', !ctx.resolved);

      Sim.renderSteps(refs.steps, [
        { level: 0, label: 'Read the inputs', expr: `A = ${A}, B = ${B}` },
        { level: 1, label: 'Sum from the XOR gate', expr: `S = A ⊕ B = ${A} ⊕ ${B}`, result: `S = ${S}` },
        { level: 1, label: 'Carry from the AND gate', expr: `C = A · B = ${A} · ${B}`, result: `C = ${C}` },
        { level: 1, num: 'Final', label: 'Result', expr: `A + B = ${A} + ${B} = (${C}${S})₂ = ${2 * C + S}₁₀`, result: `Sum = ${S}, Carry = ${C}` },
      ], 'Both gates work in parallel, so Sum and Carry are ready after a single gate delay (t = 1).');

      refs.result.innerHTML = `<p>The half adder was simulated and its outputs matched the truth table. For the current inputs
        A = <b>${A}</b>, B = <b>${B}</b> the circuit gives Sum = <b>${S}</b> and Carry = <b>${C}</b>, i.e. ${A} + ${B} = ${2 * C + S}.</p>`;
    },
  });

  function ledTile(sig, label, expr) {
    return h('div', { class: 'led-tile', 'data-sig': sig },
      h('span', { class: 'led' }),
      h('div', {}, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-expr mono' }, expr)),
      h('span', { class: 'tile-val mono', 'data-sig-text': sig }, '0'));
  }
  Sim.ledTile = ledTile;

  function theory() {
    return h('div', { class: 'prose', html: `
      <h3>Aim</h3>
      <p>To design and verify a half adder using an XOR gate and an AND gate, and to observe its outputs for every input combination.</p>
      <h3>Theory</h3>
      <p>A <b>half adder</b> is a combinational circuit that adds two single binary digits A and B. Adding two bits can give
      0, 1 or 2 (= 10₂), so two outputs are needed: <b>Sum</b> (the 2⁰ digit) and <b>Carry</b> (the 2¹ digit).</p>
      <p>The Sum is 1 when exactly one input is 1 — the definition of exclusive-OR. The Carry is 1 only when both inputs are 1 —
      the definition of AND. It is called a <i>half</i> adder because it has no carry input, so it cannot accept a carry from a
      lower bit position. Two half adders and an OR gate make a full adder (Experiment 2).</p>
      <h3>Boolean expressions</h3>
      <div class="eq-block mono">Sum   = A ⊕ B = A'B + AB'<br>Carry = A · B</div>
      <h3>Circuit diagram</h3>
      <p>Input A and B each branch (junction dots) to both gates. The XOR output is Sum; the AND output is Carry. Wires turn
      green when they carry logic 1.</p>
      <h3>Procedure</h3>
      <ol>
        <li>Set A and B with the switches, the keyboard (A / B) or by clicking the input terminals.</li>
        <li>Watch the signal propagate through both gates (use <b>Step</b> to advance one gate delay at a time).</li>
        <li>Note Sum and Carry and compare them with the highlighted truth-table row.</li>
        <li>Repeat for all four combinations, or press <b>Verify all 4 combinations</b>.</li>
      </ol>` });
  }
})();
