// Message contract between the UI (main thread) and the picker Web Worker.

import type { Circuit, NoiseParam, PickOptions, PickResult } from "./types.js";

export interface RunRequest {
  type: "run";
  circuit: Circuit;
  targets: number[];
  noise: NoiseParam[];
  options: PickOptions;
}

export type WorkerResponse =
  | { type: "progress"; index: number; total: number; target: number }
  | { type: "commit"; k: number; target: number | null; cost: number }
  | { type: "result"; result: PickResult }
  | { type: "error"; message: string };
