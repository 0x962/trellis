import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

const desktop = resolve(originDir(import.meta.dir), "../..");

test("the native helper refuses a missing selected home before it creates files", async () => {
	const userData = await mkdtemp("/tmp/trl-selected-missing-");
	const home = join(userData, "missing");
	await writeFile(join(userData, "selected-home.json"), JSON.stringify({ version: 1, home }));
	const child = Bun.spawn([join(desktop, "dist/TrellisHost"), "serve"], {
		env: { ...process.env, TRELLIS_DESKTOP_HOME: undefined, TRELLIS_DESKTOP_USER_DATA: userData },
		stdout: "pipe",
		stderr: "pipe",
	});
	const timeout = setTimeout(() => child.kill("SIGTERM"), 2000);
	try {
		expect(await child.exited).toBe(1);
		expect(await new Response(child.stderr).text()).toContain("selected Trellis data directory does not exist");
		expect(existsSync(home)).toBe(false);
	} finally {
		clearTimeout(timeout);
		await rm(userData, { recursive: true, force: true });
	}
});
