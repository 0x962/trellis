import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareHome } from "./prepareHome";

const roots: string[] = [];
const emptyHome = async () => {
	const root = await mkdtemp("/tmp/trl-first-launch-");
	roots.push(root);
	return join(root, "host");
};
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

test("new data selection continues before any data files exist", async () => {
	const home = await emptyHome();
	const result = await prepareHome(
		{ home },
		{
			message: async (options) => {
				expect(options.detail).toContain(home);
				return { response: 0 };
			},
			useExisting: async () => {
				throw Error("Unexpected directory selection");
			},
		},
	);
	expect(result).toBe(true);
	expect(existsSync(home)).toBe(false);
});
test("existing directory selection yields to the directory handoff", async () => {
	const home = await emptyHome();
	let selected = false;
	const result = await prepareHome(
		{ home },
		{
			message: async () => ({ response: 1 }),
			useExisting: async () => {
				selected = true;
			},
		},
	);
	expect(selected).toBe(true);
	expect(result).toBe(false);
	expect(existsSync(home)).toBe(false);
});
test("Cancel leaves first launch without a data directory", async () => {
	const home = await emptyHome();
	const result = await prepareHome(
		{ home },
		{
			message: async (options) => ({ response: options.cancelId! }),
			useExisting: async () => {
				throw Error("Unexpected directory selection");
			},
		},
	);
	expect(result).toBe(false);
	expect(existsSync(home)).toBe(false);
});
test("an established data directory continues without a first-launch dialog", async () => {
	const home = await emptyHome();
	await mkdir(home);
	await writeFile(join(home, "desktop-token"), "fixture");
	const result = await prepareHome(
		{ home },
		{
			message: async () => {
				throw Error("Unexpected first launch");
			},
			useExisting: async () => {
				throw Error("Unexpected directory selection");
			},
		},
	);
	expect(result).toBe(true);
});
