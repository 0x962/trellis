import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

const root = resolve(originDir(import.meta.dir), "../..");

test("native progress shows steps and estimates, resumes after relaunch, and honors reduced motion", async () => {
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
		const child = Bun.spawn([electron, join(temporary, "probe.cjs"), join(root, "dist/startup.html"), temporary], {
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
		expect(result.initial).toMatchObject({
			phase: "Prepare restart",
			steps: "Step 1/6",
			progress: "0",
			elapsed: null,
			opacity: "1",
			motion: "0.16s, 0.16s",
			require: "undefined",
			process: "undefined",
			live: "polite",
		});
		expect(result.initial.remaining).toMatch(/^About .+ remaining$/);
		expect(result.titleBar).toBeNull();
		expect(result.host).toMatchObject({ steps: "Step 2/6", progress: "17" });
		expect(result.handoff).toEqual({ windows: 0, saved: true });
		expect(result.resume).toMatchObject({ steps: "Step 4/6", progress: "50" });
		expect(result.last).toMatchObject({ steps: "Step 6/6", progress: "83" });
		expect(result.reduced.motion).toBe("0s");
		expect(result.finished).toEqual({ windows: 0, saved: false, history: true, revealAboveMain: true });
		expect(result).toMatchObject({ afterError: 0, errors: ["Host failed"], enabled: true });
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}, 15000);
