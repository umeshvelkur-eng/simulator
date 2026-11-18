/**
 * logic.js — Pure digital-logic engine for the 8086 Digital Logic Simulator.
 *
 * This file has NO DOM access. It is shared by the browser UI (window.Logic)
 * and the Node test-suite (module.exports), so every calculation the UI shows
 * can be verified independently.
 *
 * Two layers live here:
 *  1. Gate-level netlists (half adder, full adder, ripple-carry adder,
 *     carry look-ahead adder, adder/subtractor). The circuit diagrams are
 *     driven by evaluating these netlists, so every wire and gate drawn on
 *     screen corresponds to a real signal in the calculation.
 *  2. Reference arithmetic functions (rippleCarryAdd, claAdd, addSubtract, ...)
 *     written independently, used for step-by-step explanations and to
 *     cross-check the netlists in the tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Primitive gates — operate on the integers 0 and 1.
   * ------------------------------------------------------------------ */
  const AND = (...xs) => (xs.every((x) => x === 1) ? 1 : 0);
  const OR = (...xs) => (xs.some((x) => x === 1) ? 1 : 0);
  const XOR = (...xs) => xs.reduce((acc, x) => acc ^ x, 0) & 1; // odd parity
  const NOT = (x) => (x === 1 ? 0 : 1);
  const WIRE = (x) => x; // plain connection / named alias

  const GATE_FUNCS = { AND, OR, XOR, NOT, WIRE };

  /** Propagation delay of each gate in "unit gate delays". A wire adds none. */
  const GATE_DELAY = { AND: 1, OR: 1, XOR: 1, NOT: 1, WIRE: 0 };

  /* ------------------------------------------------------------------ *
   * Single-bit adders (reference implementations)
   * ------------------------------------------------------------------ */
  function halfAdder(a, b) {
    return { sum: XOR(a, b), carry: AND(a, b) };
  }

  /**
   * Full adder built from 2 XOR, 2 AND and 1 OR gate.
   *   p = A ⊕ B          (propagate / first XOR)
   *   g = A · B          (generate  / first AND)
   *   t = p · Cin        (second AND)
   *   sum  = p ⊕ Cin     (second XOR)
   *   cout = g + t       (OR)
   */
  function fullAdder(a, b, cin) {
    const p = XOR(a, b);
    const g = AND(a, b);
    const t = AND(p, cin);
    return { p, g, t, sum: XOR(p, cin), cout: OR(g, t) };
  }

  /* ------------------------------------------------------------------ *
   * Bit / number helpers
   * ------------------------------------------------------------------ */
  const MAX_WIDTH = 16;

  const mask = (width) => 2 ** width - 1;

  /** Returns an array of bits, index 0 = least-significant bit. */
  function toBits(value, width) {
    const bits = [];
    for (let i = 0; i < width; i++) bits.push((value >> i) & 1);
    return bits;
  }

  /** Inverse of toBits (index 0 = LSB). */
  function fromBits(bits) {
    return bits.reduce((acc, b, i) => acc + b * 2 ** i, 0);
  }

  /** Binary string, MSB first, zero-padded to `width`. */
  function toBin(value, width) {
    return value.toString(2).padStart(width, '0');
  }

  /** Inserts a space every `size` bits counting from the LSB: "10110110" -> "1011 0110". */
  function groupBits(str, size = 4) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const fromRight = str.length - i;
      out += str[i];
      if (fromRight > 1 && (fromRight - 1) % size === 0) out += ' ';
    }
    return out;
  }

  function toHex(value, width) {
    return '0x' + value.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0');
  }

  /** Two's-complement interpretation of an unsigned `width`-bit value. */
  function toSigned(value, width) {
    return value >= 2 ** (width - 1) ? value - 2 ** width : value;
  }

  /**
   * Validates user-typed binary text.
   * Accepts optional "0b" prefix, spaces and underscores as separators.
   * Returns { ok:true, value } or { ok:false, error }.
   */
  function parseBinary(text, width) {
    const cleaned = String(text == null ? '' : text)
      .trim()
      .replace(/^0b/i, '')
      .replace(/[\s_]/g, '');
    if (cleaned === '') return { ok: false, error: 'Enter a binary number (digits 0 and 1).' };
    const bad = cleaned.match(/[^01]/);
    if (bad) return { ok: false, error: `Invalid character "${bad[0]}" — only 0 and 1 are allowed.` };
    if (cleaned.length > width) {
      return { ok: false, error: `Too many bits: ${cleaned.length} entered, maximum is ${width}.` };
    }
    return { ok: true, value: parseInt(cleaned, 2), cleaned };
  }

  /**
   * Validates a decimal number typed by the user.
   * Unsigned range 0 … 2^w − 1. When allowNegative is true, −2^(w−1) … −1 is
   * also accepted and stored as its two's-complement bit pattern.
   */
  function parseDecimal(text, width, allowNegative) {
    const cleaned = String(text == null ? '' : text).trim().replace(/[\s_,]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '+') return { ok: false, error: 'Enter a decimal number.' };
    if (!/^[+-]?\d+$/.test(cleaned)) {
      const bad = cleaned.replace(/^[+-]/, '').match(/[^0-9]/);
      return { ok: false, error: `Invalid character "${bad ? bad[0] : cleaned[0]}" — use digits 0–9${allowNegative ? ' and an optional minus sign' : ''}.` };
    }
    const n = Number(cleaned);
    const max = mask(width);
    const min = allowNegative ? -(2 ** (width - 1)) : 0;
    if (n < 0 && !allowNegative) return { ok: false, error: `Negative values are not used here — enter 0 to ${max}.` };
    if (n > max || n < min) {
      return { ok: false, error: `Out of range for ${width} bits: enter ${min} to ${max}.` };
    }
    return { ok: true, value: n < 0 ? n + 2 ** width : n };
  }

  /** Validates a hexadecimal number (optional 0x prefix). */
  function parseHex(text, width) {
    const cleaned = String(text == null ? '' : text).trim().replace(/^0x/i, '').replace(/[\s_]/g, '').replace(/h$/i, '');
    if (cleaned === '') return { ok: false, error: 'Enter a hexadecimal number (0–9, A–F).' };
    const bad = cleaned.match(/[^0-9a-f]/i);
    if (bad) return { ok: false, error: `Invalid character "${bad[0]}" — only 0–9 and A–F are allowed.` };
    const n = parseInt(cleaned, 16);
    if (n > mask(width)) return { ok: false, error: `Too large for ${width} bits: maximum is ${toHex(mask(width), width)}.` };
    return { ok: true, value: n };
  }

  const popcount = (v) => {
    let c = 0;
    while (v) {
      c += v & 1;
      v >>>= 1;
    }
    return c;
  };

  /* ------------------------------------------------------------------ *
   * Gate-level netlists
   *
   * A netlist is { inputs:[names], outputs:[names], gates:[{id,type,in,out}] }.
   * Gates are listed in topological order (each gate only uses signals that
   * are primary inputs or outputs of earlier gates).
   * ------------------------------------------------------------------ */

  /**
   * Evaluates a netlist.
   * Returns { values, levels, maxLevel } where levels[sig] is the signal's
   * structural arrival time in unit gate delays (inputs = 0).
   */
  function evaluateNetlist(netlist, inputValues) {
    const values = {};
    const levels = {};
    for (const name of netlist.inputs) {
      const v = inputValues[name];
      if (v !== 0 && v !== 1) throw new Error(`Input ${name} must be 0 or 1 (got ${v})`);
      values[name] = v;
      levels[name] = 0;
    }
    for (const gate of netlist.gates) {
      const ins = gate.in.map((s) => {
        if (!(s in values)) throw new Error(`Gate ${gate.id}: signal "${s}" is not defined yet`);
        return values[s];
      });
      const fn = GATE_FUNCS[gate.type];
      if (!fn) throw new Error(`Unknown gate type ${gate.type}`);
      values[gate.out] = fn(...ins);
      levels[gate.out] = Math.max(...gate.in.map((s) => levels[s])) + GATE_DELAY[gate.type];
    }
    let maxLevel = 0;
    for (const k in levels) if (levels[k] > maxLevel) maxLevel = levels[k];
    return { values, levels, maxLevel };
  }

  /** Appends the 5 gates of one full adder to `gates`. Signal names are supplied by the caller. */
  function addFullAdderGates(gates, n) {
    gates.push({ id: `XOR1_${n.tag}`, type: 'XOR', in: [n.a, n.b], out: n.p });
    gates.push({ id: `AND1_${n.tag}`, type: 'AND', in: [n.a, n.b], out: n.g });
    gates.push({ id: `XOR2_${n.tag}`, type: 'XOR', in: [n.p, n.cin], out: n.sum });
    gates.push({ id: `AND2_${n.tag}`, type: 'AND', in: [n.p, n.cin], out: n.t });
    gates.push({ id: `OR_${n.tag}`, type: 'OR', in: [n.g, n.t], out: n.cout });
  }

  function halfAdderNetlist() {
    return {
      name: 'Half Adder',
      inputs: ['A', 'B'],
      outputs: ['S', 'C'],
      gates: [
        { id: 'XOR1', type: 'XOR', in: ['A', 'B'], out: 'S' },
        { id: 'AND1', type: 'AND', in: ['A', 'B'], out: 'C' },
      ],
    };
  }

  function fullAdderNetlist() {
    const gates = [];
    addFullAdderGates(gates, { tag: '0', a: 'A', b: 'B', cin: 'Cin', p: 'P', g: 'G', t: 'T', sum: 'S', cout: 'Cout' });
    return { name: 'Full Adder', inputs: ['A', 'B', 'Cin'], outputs: ['S', 'Cout'], gates };
  }

  /** n-bit ripple-carry adder: A0..An-1, B0..Bn-1, C0 -> S0..Sn-1, Cn. */
  function rippleAdderNetlist(width) {
    const inputs = [];
    for (let i = 0; i < width; i++) inputs.push(`A${i}`, `B${i}`);
    inputs.push('C0');
    const gates = [];
    for (let i = 0; i < width; i++) {
      addFullAdderGates(gates, {
        tag: String(i), a: `A${i}`, b: `B${i}`, cin: `C${i}`,
        p: `P${i}`, g: `G${i}`, t: `T${i}`, sum: `S${i}`, cout: `C${i + 1}`,
      });
    }
    const outputs = [];
    for (let i = 0; i < width; i++) outputs.push(`S${i}`);
    outputs.push(`C${width}`);
    return { name: `${width}-bit Ripple Carry Adder`, inputs, outputs, gates };
  }

  /**
   * Structure of the product terms of carry Cj in a carry look-ahead adder
   * (expanded, sum-of-products form):
   *   Cj = G(j-1) + P(j-1)G(j-2) + ... + P(j-1)...P1·G0 + P(j-1)...P0·C0
   * Each term: { kind:'G', k, ps:[...] } = Gk · Π P(ps)   or   { kind:'C', ps } = C0 · Π P(ps)
   */
  function lookaheadTermStructure(j) {
    const terms = [];
    for (let k = j - 1; k >= 0; k--) {
      const ps = [];
      for (let m = j - 1; m > k; m--) ps.push(m);
      terms.push({ kind: 'G', k, ps });
    }
    const ps = [];
    for (let m = j - 1; m >= 0; m--) ps.push(m);
    terms.push({ kind: 'C', ps });
    return terms;
  }

  /** Signal name used by the CLA netlist for a product term of carry Cj. */
  function claTermSignal(j, term) {
    if (term.kind === 'G') return term.ps.length === 0 ? `G${term.k}` : `T${j}_${term.k}`;
    return `T${j}_c`;
  }

  /** Human readable product: "P2·P1·G0" */
  function describeTerm(term) {
    const ps = term.ps.map((m) => `P${m}`);
    return [...ps, term.kind === 'G' ? `G${term.k}` : 'C0'].join('·');
  }

  /**
   * n-bit carry look-ahead adder. Every carry is computed directly from the
   * G/P signals and C0 with one AND level and one OR level — no carry waits
   * for the previous carry.
   */
  function claNetlist(width) {
    const inputs = [];
    for (let i = 0; i < width; i++) inputs.push(`A${i}`, `B${i}`);
    inputs.push('C0');
    const gates = [];
    for (let i = 0; i < width; i++) {
      gates.push({ id: `PX_${i}`, type: 'XOR', in: [`A${i}`, `B${i}`], out: `P${i}` });
      gates.push({ id: `GA_${i}`, type: 'AND', in: [`A${i}`, `B${i}`], out: `G${i}` });
    }
    const termsByCarry = {};
    for (let j = 1; j <= width; j++) {
      const termSignals = [];
      for (const term of lookaheadTermStructure(j)) {
        const sig = claTermSignal(j, term);
        if (!(term.kind === 'G' && term.ps.length === 0)) {
          const factors = [...term.ps.map((m) => `P${m}`), term.kind === 'G' ? `G${term.k}` : 'C0'];
          gates.push({ id: `TA_${sig}`, type: 'AND', in: factors, out: sig });
        }
        termSignals.push(sig);
      }
      termsByCarry[j] = termSignals;
      gates.push({ id: `CO_${j}`, type: 'OR', in: termSignals, out: `C${j}` });
    }
    for (let i = 0; i < width; i++) {
      gates.push({ id: `SX_${i}`, type: 'XOR', in: [`P${i}`, `C${i}`], out: `S${i}` });
    }
    const outputs = [];
    for (let i = 0; i < width; i++) outputs.push(`S${i}`);
    outputs.push(`C${width}`);
    return { name: `${width}-bit Carry Look-Ahead Adder`, inputs, outputs, gates, termsByCarry };
  }

  /**
   * n-bit parallel adder/subtractor.
   *   Xi = Bi ⊕ M       (controlled inverter)
   *   C0 = M            (adds the +1 of two's complement when subtracting)
   *   ripple chain of full adders on A and X
   *   V  = Cn ⊕ C(n-1)  (signed overflow)
   */
  function addSubNetlist(width) {
    const inputs = [];
    for (let i = 0; i < width; i++) inputs.push(`A${i}`, `B${i}`);
    inputs.push('M');
    const gates = [];
    for (let i = 0; i < width; i++) gates.push({ id: `BX_${i}`, type: 'XOR', in: [`B${i}`, 'M'], out: `X${i}` });
    gates.push({ id: 'C0_WIRE', type: 'WIRE', in: ['M'], out: 'C0' });
    for (let i = 0; i < width; i++) {
      addFullAdderGates(gates, {
        tag: String(i), a: `A${i}`, b: `X${i}`, cin: `C${i}`,
        p: `P${i}`, g: `G${i}`, t: `T${i}`, sum: `S${i}`, cout: `C${i + 1}`,
      });
    }
    gates.push({ id: 'OVF', type: 'XOR', in: [`C${width}`, `C${width - 1}`], out: 'V' });
    const outputs = [];
    for (let i = 0; i < width; i++) outputs.push(`S${i}`);
    outputs.push(`C${width}`, 'V');
    return { name: `${width}-bit Adder/Subtractor`, inputs, outputs, gates };
  }

  /** Builds the input map {A0:..,B0:..} for multi-bit netlists. */
  function wordInputs(a, b, width, extra) {
    const map = {};
    for (let i = 0; i < width; i++) {
      map[`A${i}`] = (a >> i) & 1;
      map[`B${i}`] = (b >> i) & 1;
    }
    return Object.assign(map, extra || {});
  }

  /** Reads an n-bit word from evaluated signal values, e.g. readWord(values,'S',4). */
  function readWord(values, prefix, width) {
    let v = 0;
    for (let i = 0; i < width; i++) v += (values[`${prefix}${i}`] || 0) * 2 ** i;
    return v;
  }

  /* ------------------------------------------------------------------ *
   * Reference multi-bit arithmetic
   * ------------------------------------------------------------------ */

  /** Ripple-carry addition, bit by bit, through cascaded full adders. */
  function rippleCarryAdd(a, b, width, cin = 0) {
    const A = toBits(a, width);
    const B = toBits(b, width);
    const carries = [cin];
    const stages = [];
    for (let i = 0; i < width; i++) {
      const fa = fullAdder(A[i], B[i], carries[i]);
      stages.push({ i, a: A[i], b: B[i], cin: carries[i], ...fa });
      carries.push(fa.cout);
    }
    const sumBits = stages.map((s) => s.sum);
    const sum = fromBits(sumBits);
    return { stages, carries, sumBits, sum, cout: carries[width], total: sum + carries[width] * 2 ** width };
  }

  /**
   * Carry look-ahead addition.
   * `carries` are computed in PARALLEL from G, P and C0 (expanded equations);
   * `recursive` uses Ci+1 = Gi + Pi·Ci and is kept to show both forms agree.
   */
  function claAdd(a, b, width, cin = 0) {
    const A = toBits(a, width);
    const B = toBits(b, width);
    const g = A.map((ai, i) => AND(ai, B[i]));
    const p = A.map((ai, i) => XOR(ai, B[i]));
    const carries = [cin];
    const terms = [null];
    for (let j = 1; j <= width; j++) {
      const t = lookaheadTermStructure(j).map((term) => {
        const factors = term.ps.map((m) => p[m]);
        factors.push(term.kind === 'G' ? g[term.k] : cin);
        return { ...term, value: AND(...factors), label: describeTerm(term), signal: claTermSignal(j, term) };
      });
      terms.push(t);
      carries.push(OR(...t.map((x) => x.value)));
    }
    const recursive = [cin];
    for (let i = 0; i < width; i++) recursive.push(OR(g[i], AND(p[i], recursive[i])));
    const sumBits = p.map((pi, i) => XOR(pi, carries[i]));
    return { g, p, carries, recursive, terms, sumBits, sum: fromBits(sumBits), cout: carries[width] };
  }

  /**
   * Parallel adder/subtractor. mode 0 = ADD (A + B), mode 1 = SUBTRACT (A + ~B + 1).
   * overflow = Cn ⊕ C(n-1) (signed two's-complement overflow).
   */
  function addSubtract(a, b, width, mode) {
    const m = mode ? 1 : 0;
    const bx = m ? (b ^ mask(width)) : b; // every Bi passes through an XOR with M
    const r = rippleCarryAdd(a, bx, width, m);
    const overflow = XOR(r.carries[width], r.carries[width - 1]);
    return {
      mode: m, a, b, bx, cin: m, ...r,
      result: r.sum,
      overflow,
      signedA: toSigned(a, width),
      signedB: toSigned(b, width),
      signedResult: toSigned(r.sum, width),
    };
  }

  /**
   * Theoretical worst-case delays in unit gate delays (each gate = 1 delay,
   * unlimited fan-in for the look-ahead network). These match the structural
   * levels produced by evaluateNetlist on the corresponding netlists.
   */
  function delayModel(width) {
    return {
      rca: { pg: 1, carry: (j) => 2 * j + 1, carryOut: 2 * width + 1, sum: 2 * width },
      cla: { pg: 1, carry: () => 3, carryOut: 3, sum: width > 1 ? 4 : 2 },
    };
  }

  /**
   * Status flags as the Intel 8086 defines them for ADD / SUB on an 8- or
   * 16-bit operand. (Educational calculation — not an instruction emulator.)
   */
  function flags8086(a, b, width, op) {
    const m = mask(width);
    const mod = 2 ** width;
    const sub = op === 'SUB';
    const result = sub ? (a - b + mod) % mod : (a + b) % mod;
    const sa = toSigned(a, width);
    const sb = toSigned(b, width);
    const sr = toSigned(result, width);
    const CF = sub ? (a < b ? 1 : 0) : (a + b > m ? 1 : 0); // carry (ADD) or borrow (SUB)
    const OF = sub
      ? ((sa < 0) !== (sb < 0) && (sr < 0) !== (sa < 0) ? 1 : 0)
      : ((sa < 0) === (sb < 0) && (sr < 0) !== (sa < 0) ? 1 : 0);
    const AF = ((a ^ b ^ result) & 0x10) ? 1 : 0; // carry/borrow between bit 3 and bit 4
    const ZF = result === 0 ? 1 : 0;
    const SF = (result >> (width - 1)) & 1;
    const PF = popcount(result & 0xff) % 2 === 0 ? 1 : 0; // even parity of the low byte
    const adder = addSubtract(a, b, width, sub ? 1 : 0);
    return { result, signedResult: sr, CF, OF, AF, ZF, SF, PF, adderCarryOut: adder.cout, adderOverflow: adder.overflow };
  }

  return {
    // gates
    AND, OR, XOR, NOT, GATE_DELAY,
    // single-bit
    halfAdder, fullAdder,
    // helpers
    MAX_WIDTH, mask, toBits, fromBits, toBin, groupBits, toHex, toSigned, parseBinary, parseDecimal, parseHex, popcount,
    // netlists
    evaluateNetlist, halfAdderNetlist, fullAdderNetlist, rippleAdderNetlist, claNetlist, addSubNetlist,
    lookaheadTermStructure, claTermSignal, describeTerm, wordInputs, readWord,
    // arithmetic
    rippleCarryAdd, claAdd, addSubtract, delayModel, flags8086,
  };
});
