import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("recovery reconciles real processes and prevents duplicate attempts", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-recovery-"));
	try {
		await symlink(resolve(import.meta.dir, "../../../../node_modules"), join(home, "node_modules"));
		const build = await Bun.build({
			entrypoints: [join(import.meta.dir, "recoverAttemptRecord.fixture.ts")],
			outdir: home,
			target: "node",
			external: ["fs-ext", "node-pty", "koffi"],
		});
		expect(build.success).toBe(true);
		const child = Bun.spawn(["node", join(home, "recoverAttemptRecord.fixture.js"), home], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
		expect(stderr).toBe("");
		expect(code).toBe(0);
		expect(await readFile(join(home, "passed"), "utf8")).toContain("restart");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
}, 30_000);
