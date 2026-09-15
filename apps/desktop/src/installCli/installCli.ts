import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const installCli = async (input: { bin: string; root: string; home: string }) => {
	const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
	const script = `#!/bin/sh\nexport TRELLIS_DESKTOP_HOME=${quote(input.home)}\nexec ${quote(join(input.root, "bin/bun"))} ${quote(join(input.root, "packages/cli/src/index.ts"))} "$@"\n`;
	await mkdir(input.bin, { recursive: true });
	const pending = join(input.bin, `.trellis-${process.pid}`);
	await writeFile(pending, script, { mode: 0o755 });
	await rename(pending, join(input.bin, "trellis"));
};
