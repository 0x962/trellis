import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectExistingHome } from "./inspectExistingHome.ts";

test("an existing home resolves aliases and reports a live owner without changing its lock", async () => {
	const directory = await mkdtemp("/tmp/trl-home-inspect-");
	try {
		const home = join(directory, "home");
		await mkdir(join(home, "db"), { recursive: true });
		await writeFile(join(home, "db/PG_VERSION"), "17\n");
		const lock = JSON.stringify({ pid: process.pid, role: "server", port: 4521 });
		await writeFile(join(home, "trellis.lock"), lock);
		await symlink(home, join(directory, "alias"));
		expect(await inspectExistingHome(join(directory, "alias"))).toEqual({
			home: await realpath(home),
			owner: { pid: process.pid, role: "server", port: 4521 },
			runtime: null,
		});
		expect(await readFile(join(home, "trellis.lock"), "utf8")).toBe(lock);
		await writeFile(join(home, "trellis.lock"), JSON.stringify({ pid: 2147483647, role: "server", port: 4521 }));
		expect((await inspectExistingHome(home)).owner).toBeNull();
		await mkdir(join(home, "runtime"));
		await writeFile(join(home, "runtime/manifest.json"), JSON.stringify({ pid: process.pid, version: 5 }));
		expect((await inspectExistingHome(home)).runtime).toEqual({ pid: process.pid, version: 5 });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a directory without a Trellis database cannot become an existing home", async () => {
	const directory = await mkdtemp("/tmp/trl-home-invalid-");
	try {
		await expect(inspectExistingHome(directory)).rejects.toThrow("Trellis database");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
