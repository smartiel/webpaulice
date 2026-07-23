// Picker Web Worker: initializes the wasm module and runs the (potentially
// long) windowed search off the main thread, streaming per-target progress.

import init, { init_panic_hook } from "./wasm/paulice.js";
import { pickChecks } from "./core/pickChecks.js";
import type { RunRequest, WorkerResponse } from "./workerApi.js";

let ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (!ready) {
    ready = init().then(() => {
      init_panic_hook();
    });
  }
  return ready;
}

const post = (m: WorkerResponse) => self.postMessage(m);

self.onmessage = async (e: MessageEvent<RunRequest>) => {
  const msg = e.data;
  if (msg.type !== "run") return;
  try {
    await ensureReady();
    const result = pickChecks(
      msg.circuit,
      msg.targets,
      msg.noise,
      msg.options,
      (p) => post({ type: "progress", ...p }),
      (c) => post({ type: "commit", ...c }),
    );
    post({ type: "result", result });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
