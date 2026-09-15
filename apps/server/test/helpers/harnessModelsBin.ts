import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const fixture = resolve(import.meta.dir, "../fixtures/harnessModels.ts");

// Writes a `claude`, `codex`, `opencode`, and `pi` launcher into `bin`, each
// one running the model fixture under the bun on PATH. Returns `bin`.
export const writeHarnessModelsBin = (bin: string) => {
	mkdirSync(bin, { recursive: true });
	for (const harness of ["claude", "codex", "opencode", "pi"]) {
		const executable = join(bin, harness);
		writeFileSync(executable, `#!/usr/bin/env bun\nimport ${JSON.stringify(fixture)};\n`);
		chmodSync(executable, 0o700);
	}
	return bin;
};
