import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateCheckOption } from "./updateCheckOption.ts";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function homeWith(config?: string) {
	const home = await mkdtemp(join(tmpdir(), "trellis-codex-config-"));
	cleanups.push(() => rm(home, { recursive: true, force: true }));
	if (config !== undefined) {
		await mkdir(join(home, ".codex"), { recursive: true });
		await writeFile(join(home, ".codex", "config.toml"), config);
	}
	return home;
}

describe("updateCheckOption", () => {
	test("carries a setting that turns the question off", async () => {
		const home = await homeWith('model = "gpt-6-astra"\n\ncheck_for_update_on_startup = false\n');
		expect(await updateCheckOption(home)).toEqual(["-c", "check_for_update_on_startup=false"]);
	});

	test("carries a setting that turns the question on", async () => {
		const home = await homeWith("check_for_update_on_startup = true\n");
		expect(await updateCheckOption(home)).toEqual(["-c", "check_for_update_on_startup=true"]);
	});

	test("gives no override when the file states no value", async () => {
		const home = await homeWith('model = "gpt-6-astra"\n');
		expect(await updateCheckOption(home)).toEqual([]);
	});

	test("gives no override when the person has no codex configuration file", async () => {
		const home = await homeWith();
		expect(await updateCheckOption(home)).toEqual([]);
	});

	test("reads the value above the first table and not a same-named key inside one", async () => {
		const home = await homeWith("[notice]\ncheck_for_update_on_startup = false\n");
		expect(await updateCheckOption(home)).toEqual([]);
	});

	test("reads past a value that spans several lines", async () => {
		const home = await homeWith(
			'notify = [\n    "client",\n    "turn-ended",\n]\n\ncheck_for_update_on_startup = false\n',
		);
		expect(await updateCheckOption(home)).toEqual(["-c", "check_for_update_on_startup=false"]);
	});
});
