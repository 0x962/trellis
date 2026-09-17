import { expect, test } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkCodexManagerVersion } from "../../../../../../src/agents/harnessHost/checkCodexManagerVersion/checkCodexManagerVersion.ts";

test("manager launch refuses engines before the tested environment-access API", async () => {
	const home = await mkdtemp("/tmp/trl-codex-version-");
	const executable = join(home, "codex");
	await writeFile(executable, '#!/bin/sh\nprintf "codex-cli 0.153.0\\n"\n');
	await chmod(executable, 0o700);
	await expect(checkCodexManagerVersion(executable, home, {})).rejects.toThrow("0.154.0");
	await writeFile(executable, '#!/bin/sh\nprintf "codex-cli 0.154.0\\n"\n');
	await checkCodexManagerVersion(executable, home, {});
});
