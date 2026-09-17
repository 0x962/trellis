import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Playwright loads this file under Node, so the path comes from `import.meta.url`.
const fixture = fileURLToPath(new URL("../fixtures/harnessModels.ts", import.meta.url));

// Writes a `claude`, `codex`, `opencode`, `pi`, and `muse` launcher into
// `bin`, each one running the model fixture under the bun on PATH. Returns
// `bin`.
export const writeHarnessModelsBin = (bin: string) => {
	mkdirSync(bin, { recursive: true });
	for (const harness of ["claude", "codex", "opencode", "pi", "muse"]) {
		const executable = join(bin, harness);
		writeFileSync(executable, `#!/usr/bin/env bun\nimport ${JSON.stringify(fixture)};\n`);
		chmodSync(executable, 0o700);
	}
	return bin;
};
