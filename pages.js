/**
 * pages.js — Home page experiment cards and the interactive 8086 flags demo.
 */
(function () {
  'use strict';
  const { h } = Sim;

  /** Experiment cards on the home page. */
  Sim.renderHomeCards = function (host) {
    host.replaceChildren(
      ...Sim.experiments.map((d) =>
        h('a', { class: 'exp-card', href: `#${d.id}` },
          h('span', { class: 'exp-card-num mono' }, String(d.number).padStart(2, '0')),
          h('span', { class: 'exp-card-icon mono' }, d.short),
          h('h3', {}, d.title),
          h('p', {}, d.subtitle),
          h('span', { class: 'exp-card-meta' }, d.summary, h('span', { class: 'arrow' }, '→'))))
    );
  };

  /**
   * "ADD / SUB and the 8086 flags" demo.
   * Shows how the adder outputs map onto CF, OF, ZF, SF, PF and AF.
   */
  Sim.mount8086Demo = function (host) {
    const st = Object.assign({ width: 8, op: 'ADD', a: 0x7f, b: 0x01 }, Sim.store.get('demo8086', {}));
    if (![8, 16].includes(st.width)) st.width = 8;
    const out = h('div', { class: 'flags-out' });
    const save = () => Sim.store.set('demo8086', st);

    const opSeg = Sim.createSegmented({
      label: 'Instruction', value: st.op,
      options: [{ value: 'ADD', label: 'ADD' }, { value: 'SUB', label: 'SUB / CMP' }],
      onChange: (v) => { st.op = v; update(); },
    });
    const wSeg = Sim.createSegmented({
      label: 'Operand size', value: st.width,
      options: [{ value: 8, label: '8-bit (AL, BL)' }, { value: 16, label: '16-bit (AX, BX)' }],
      onChange: (v) => { st.width = v; st.a &= Logic.mask(v); st.b &= Logic.mask(v); update(); },
    });
    const inA = Sim.createBinaryInput({ name: 'dst', label: 'Destination (AL / AX)', width: st.width, value: st.a, showSigned: true, onChange: (v) => { st.a = v; update(); } });
    const inB = Sim.createBinaryInput({ name: 'src', label: 'Source (BL / BX)', width: st.width, value: st.b, showSigned: true, onChange: (v) => { st.b = v; update(); } });

    host.append(
      h('div', { class: 'demo-grid' },
        h('div', { class: 'card card-body demo-inputs' },
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Operation'), opSeg.el),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Operand size'), wSeg.el),
          inA.el, inB.el),
        h('div', { class: 'card card-body' }, out))
    );

    function update() {
      save();
      opSeg.set(st.op);
      wSeg.set(st.width);
      inA.set(st.a, st.width);
      inB.set(st.b, st.width);
      const w = st.width;
      const f = Logic.flags8086(st.a, st.b, w, st.op);
      const reg = w === 8 ? ['AL', 'BL'] : ['AX', 'BX'];
      const sub = st.op === 'SUB';
      const flag = (name, val, title, why) =>
        `<div class="flag ${val ? 'set' : ''}"><div class="flag-name mono">${name}</div><div class="flag-val mono">${val}</div><div class="flag-title">${title}</div><div class="flag-why">${why}</div></div>`;
      out.innerHTML = `
        <div class="asm mono"><span class="kw">${st.op}</span> ${reg[0]}, ${reg[1]} <span class="muted">; ${reg[0]} = ${Logic.toHex(st.a, w)}, ${reg[1]} = ${Logic.toHex(st.b, w)}</span></div>
        <div class="word-table">
          <div class="wt-row"><span class="wt-k">${reg[0]}</span><span class="wt-bits">${Sim.bitsHtml(st.a, w)}</span><span class="wt-n">${Logic.toSigned(st.a, w)}<small>u ${st.a}</small></span></div>
          <div class="wt-row"><span class="wt-k">${reg[1]}</span><span class="wt-bits">${Sim.bitsHtml(st.b, w)}</span><span class="wt-n">${Logic.toSigned(st.b, w)}<small>u ${st.b}</small></span></div>
          <div class="wt-row total"><span class="wt-k">Result</span><span class="wt-bits">${Sim.bitsHtml(f.result, w)}</span><span class="wt-n">${f.signedResult}<small>u ${f.result} · ${Logic.toHex(f.result, w)}</small></span></div>
        </div>
        <div class="flag-grid">
          ${flag('CF', f.CF, 'Carry flag', sub ? `Borrow: ${f.CF ? 'unsigned dst < src' : 'no borrow'}. The adder’s carry-out was ${f.adderCarryOut}; the 8086 stores its inverse for SUB.` : `Carry out of bit ${w - 1}: ${f.CF ? 'unsigned result did not fit' : 'unsigned result fits'}.`)}
          ${flag('OF', f.OF, 'Overflow flag', `Signed overflow = C${w} ⊕ C${w - 1} of the adder (= ${f.adderOverflow}). ${f.OF ? 'Signed result is out of range.' : 'Signed result is valid.'}`)}
          ${flag('ZF', f.ZF, 'Zero flag', f.ZF ? 'Every result bit is 0.' : 'At least one result bit is 1.')}
          ${flag('SF', f.SF, 'Sign flag', `Copy of the result’s MSB (bit ${w - 1}).`)}
          ${flag('PF', f.PF, 'Parity flag', `Low byte has ${Logic.popcount(f.result & 0xff)} one-bit(s) — ${f.PF ? 'even' : 'odd'} parity.`)}
          ${flag('AF', f.AF, 'Auxiliary carry', 'Carry / borrow between bit 3 and bit 4 (used by BCD adjust instructions).')}
        </div>
        <p class="muted small">Educational calculation of the flag rules documented for the 8086. It is not an instruction-set emulator and does not model the chip’s internal circuitry.</p>`;
    }
    update();
  };
})();
