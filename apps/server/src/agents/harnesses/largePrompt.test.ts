import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareCodex } from "./codex/prepareCodex";
import { prepareMuse } from "./muse/prepareMuse";

let directory: string;
afterEach(async () => {
	if (directory) await rm(directory, { recursive: true, force: true });
});

for (const [name, prepare] of [
	["Codex", prepareCodex],
	["Muse", prepareMuse],
] as const) {
	test(`${name} passes a complete large prompt through a private file`, async () => {
		directory = await mkdtemp(join(tmpdir(), "trellis-prompt-"));
		const prompt = "Prompt 文\n".repeat(300_000);
		const launch = await prepare({
			cwd: directory,
			configDirectory: directory,
			prompt,
			hookCommand: "",
			resume: false,
		});
		expect(launch.args.join(" ").length).toBeLessThan(1000);
		expect(JSON.parse(await readFile(launch.args[1]!, "utf8")).prompt).toBe(prompt);
		expect((await stat(launch.args[1]!)).mode & 0o777).toBe(0o600);
	});
}
