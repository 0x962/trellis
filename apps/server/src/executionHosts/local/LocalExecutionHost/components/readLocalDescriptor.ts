import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessDescriptor } from "../../../../agents/harnessHost/types.ts";

// The prepared launch record of one attempt under `home/harness-attempts`.
// A custom launch writes a record with `harness: "custom"` and a `spec` and
// no fingerprint.
export const readLocalDescriptor = async (home: string, attemptId: string): Promise<HarnessDescriptor> =>
	JSON.parse(await readFile(join(home, "harness-attempts", attemptId, "launch.json"), "utf8"));
