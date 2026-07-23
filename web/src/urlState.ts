// Encode/decode the full app configuration into the URL fragment, so a run is
// shareable and bookmarkable. Stored as base64url(JSON) under `#s=`.

/** Everything needed to reproduce a configuration (not the results). */
export interface AppSnapshot {
  qasm: string;
  layout: string; // layout-select value: ibm_* | "line" | "grid" | "custom"
  lineN?: number;
  gridRows?: number;
  gridCols?: number;
  custom?: string; // custom coupling-map text
  targets: number[];
  depol: number;
  readout: number;
  seed: string; // kept as a string so "" (random) round-trips
  ntries: number;
  useStabilizers: boolean;
}

function b64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(b64u: string): string {
  let b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeState(s: AppSnapshot): string {
  return b64urlEncode(JSON.stringify(s));
}

/** Extract a snapshot from a URL hash (`#s=…` or `…&s=…`), or null. */
export function decodeState(hash: string): AppSnapshot | null {
  const m = hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  try {
    return JSON.parse(b64urlDecode(m[1])) as AppSnapshot;
  } catch {
    return null;
  }
}
