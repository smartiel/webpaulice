// Minimal OpenQASM 2.0 parser producing the internal Circuit representation.
//
// Scope: enough to read the circuits qiskit's `qasm2.dumps` emits for Clifford
// payloads. Multiple qregs are flattened into one index space in declaration
// order. Register-wide operands broadcast (qiskit semantics). Custom `gate`
// definitions and non-Clifford gates are rejected with a clear message.

import type { Circuit, Gate, Measure } from "../types.js";
import { SUPPORTED_INPUT_GATES } from "../core/convert.js";

/** Evaluate a QASM parameter expression (numbers, `pi`, + - * /, parens). */
function evalExpr(input: string): number {
  const tokens = input.match(/\s*([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?|pi|[-+*/()])/g);
  if (!tokens) throw new Error(`Cannot parse expression "${input}"`);
  const toks = tokens.map((t) => t.trim());
  let pos = 0;
  const peek = () => toks[pos];
  const eat = () => toks[pos++];

  function factor(): number {
    const t = peek();
    if (t === "(") {
      eat();
      const v = expr();
      if (eat() !== ")") throw new Error(`Unbalanced parens in "${input}"`);
      return v;
    }
    if (t === "-") {
      eat();
      return -factor();
    }
    if (t === "+") {
      eat();
      return factor();
    }
    if (t === "pi") {
      eat();
      return Math.PI;
    }
    const n = Number(eat());
    if (Number.isNaN(n)) throw new Error(`Unexpected token in "${input}"`);
    return n;
  }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const rhs = factor();
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const rhs = term();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }
  const result = expr();
  if (pos !== toks.length) throw new Error(`Trailing tokens in "${input}"`);
  return result;
}

interface RegInfo {
  offset: number;
  size: number;
}

/** Parse OpenQASM 2.0 source into the internal Circuit representation. */
export function parseQasm(src: string): Circuit {
  // Strip line comments and block comments.
  const clean = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  if (/\bgate\s+[A-Za-z_]/.test(clean) || /\bopaque\s+/.test(clean)) {
    throw new Error(
      "Custom `gate`/`opaque` definitions are not supported. Please transpile to " +
        "the standard Clifford basis (h, s, sdg, sx, sxdg, x, z, cx, cz) first.",
    );
  }

  const statements = clean
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const qregs: Record<string, RegInfo> = {};
  const cregSizes: Record<string, number> = {};
  const cregOrder: string[] = [];
  let nqubits = 0;
  const gates: Gate[] = [];
  const measures: Measure[] = [];

  const resolveQubits = (operand: string): number[] => {
    const m = operand.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[\s*(\d+)\s*\])?$/);
    if (!m) throw new Error(`Cannot parse qubit operand "${operand}"`);
    const [, name, idx] = m;
    const reg = qregs[name];
    if (!reg) throw new Error(`Unknown quantum register "${name}"`);
    if (idx === undefined) {
      return Array.from({ length: reg.size }, (_, i) => reg.offset + i);
    }
    const i = Number(idx);
    if (i >= reg.size) throw new Error(`Index ${i} out of range for register "${name}"`);
    return [reg.offset + i];
  };

  const resolveClbits = (operand: string): { creg: string; bit: number }[] => {
    const m = operand.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[\s*(\d+)\s*\])?$/);
    if (!m) throw new Error(`Cannot parse clbit operand "${operand}"`);
    const [, name, idx] = m;
    const size = cregSizes[name];
    if (size === undefined) throw new Error(`Unknown classical register "${name}"`);
    if (idx === undefined) {
      return Array.from({ length: size }, (_, i) => ({ creg: name, bit: i }));
    }
    return [{ creg: name, bit: Number(idx) }];
  };

  for (const stmt of statements) {
    if (/^OPENQASM\b/.test(stmt)) continue;
    if (/^include\b/.test(stmt)) continue;

    let m = stmt.match(/^qreg\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]$/);
    if (m) {
      const [, name, size] = m;
      qregs[name] = { offset: nqubits, size: Number(size) };
      nqubits += Number(size);
      continue;
    }
    m = stmt.match(/^creg\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*(\d+)\s*\]$/);
    if (m) {
      const [, name, size] = m;
      cregSizes[name] = Number(size);
      cregOrder.push(name);
      continue;
    }

    // measure q -> c
    m = stmt.match(/^measure\s+(.+?)\s*->\s*(.+)$/);
    if (m) {
      const qs = resolveQubits(m[1].trim());
      const cs = resolveClbits(m[2].trim());
      if (qs.length !== cs.length) {
        throw new Error(`measure operand size mismatch: ${stmt}`);
      }
      for (let i = 0; i < qs.length; i++) {
        measures.push({ qubit: qs[i], creg: cs[i].creg, bit: cs[i].bit });
      }
      continue;
    }

    // gate application: name(params)? args
    m = stmt.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s+(.+)$/);
    if (!m) throw new Error(`Cannot parse statement: "${stmt}"`);
    const [, name, paramStr, argStr] = m;

    if (!SUPPORTED_INPUT_GATES.has(name)) {
      throw new Error(
        `Unsupported gate "${name}". Supported: h, s, sdg, sx, sxdg, x, z, cx, cz, ` +
          `rz/u1 (Clifford angles), id, measure, barrier.`,
      );
    }
    if (name === "barrier") continue; // ignored by the picker

    const params = paramStr
      ? paramStr.split(",").map((p) => evalExpr(p.trim()))
      : undefined;

    const operands = argStr.split(",").map((a) => a.trim());
    const resolved = operands.map(resolveQubits);
    const width = Math.max(...resolved.map((r) => r.length));
    for (const r of resolved) {
      if (r.length !== 1 && r.length !== width) {
        throw new Error(`Operand broadcast mismatch in "${stmt}"`);
      }
    }
    for (let i = 0; i < width; i++) {
      const qubits = resolved.map((r) => (r.length === 1 ? r[0] : r[i]));
      gates.push({ name, qubits, ...(params ? { params } : {}) });
    }
  }

  if (nqubits === 0) throw new Error("No quantum registers declared.");

  const cregs = cregOrder.map((name) => ({ name, size: cregSizes[name] }));
  return { nqubits, gates, measures, cregs };
}
