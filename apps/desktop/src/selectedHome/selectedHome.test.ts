import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readSelectedHome, writeSelectedHome } from "./selectedHome.ts";

test("selection persists the canonical home without writing inside it", async () => {
	const directory = await mkdtemp("/tmp/trl-selection-");
	try {
		const userData = join(directory, "desktop");
		const home = join(directory, "existing");
		await mkdir(home);
		await symlink(home, join(directory, "alias"));
		expect(readSelectedHome(userData)).toBe(join(userData, "host"));
		await writeSelectedHome(userData, join(directory, "alias"));
		expect(readSelectedHome(userData)).toBe(await realpath(home));
		expect(JSON.parse(await readFile(join(userData, "selected-home.json"), "utf8"))).toEqual({
			version: 1,
			home: await realpath(home),
		});
		expect((await stat(join(userData, "selected-home.json"))).mode & 0o777).toBe(0o600);
		expect(existsSync(join(home, "desktop-token"))).toBe(false);
		expect(existsSync(join(home, "selected-home.json"))).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("invalid or missing selections fail without replacing the saved choice", async () => {
	const directory = await mkdtemp("/tmp/trl-selection-invalid-");
	try {
		const home = join(directory, "home");
		await mkdir(home);
		await writeSelectedHome(directory, home);
		await expect(writeSelectedHome(directory, join(directory, "missing"))).rejects.toThrow();
		expect(readSelectedHome(directory)).toBe(await realpath(home));
		await writeFile(join(directory, "selected-home.json"), "null");
		expect(() => readSelectedHome(directory)).toThrow("selected Trellis data directory");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
