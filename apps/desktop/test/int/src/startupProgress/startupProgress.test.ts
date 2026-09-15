import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

const root = resolve(originDir(import.meta.dir), "../..");

test("native progress works without a host, updates its timer, and closes on failure", async () => {
	const temporary = await mkdtemp("/tmp/trl-progress-");
	try {
		const build = await Bun.build({
			entrypoints: [join(root, "test/fixtures/startupProgressProbe.ts")],
			outdir: temporary,
			naming: "probe.cjs",
			target: "node",
			format: "cjs",
			external: ["electron"],
		});
		expect(build.success).toBe(true);
		const electron = resolve(root, "../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
		const child = Bun.spawn([electron, join(temporary, "probe.cjs"), join(root, "dist/startup.html")], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect({ code, failure: stderr.includes("Uncaught") }).toEqual({ code: 0, failure: false });
		const result = JSON.parse(stdout.trim());
		expect(result.initial).toEqual({
			stage: "Wait for background host",
			elapsed: "Elapsed: 0:00",
			require: "undefined",
			process: "undefined",
			live: "polite",
		});
		expect(result.restored.stage).toBe("Restore agent sessions");
		expect(result.restored.elapsed).not.toBe("Elapsed: 0:00");
		expect(result).toMatchObject({
			visible: true,
			count: 1,
			closed: 0,
			afterError: 0,
			errors: ["Host failed"],
			enabled: true,
		});
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}, 15000);
