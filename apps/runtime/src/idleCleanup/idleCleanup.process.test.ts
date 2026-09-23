import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The time limit of the test can end the test body, and the hook still
// runs, so the home goes here.
let home = "";
afterAll(async () => {
	if (home !== "") await rm(home, { recursive: true, force: true });
});

test("Node stops an idle process tree, rejects late input, and restores the conversation", async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-idle-node-test-"));
	let child: ReturnType<typeof Bun.spawn> | undefined;
	try {
		await mkdir(join(home, "node_modules"));
		for (const name of ["node-pty", "koffi"])
			await symlink(
				dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`))),
				join(home, "node_modules", name),
			);
		const build = await Bun.build({
			entrypoints: [join(import.meta.dir, "idleCleanupProcessFixture.ts")],
			outdir: home,
			target: "node",
			external: ["node-pty", "koffi"],
		});
		expect(build.success).toBe(true);
		const subprocess = Bun.spawn(["node", build.outputs[0]!.path], { stdout: "pipe", stderr: "pipe" });
		child = subprocess;
		const [code, stderr] = await Promise.all([subprocess.exited, new Response(subprocess.stderr).text()]);
		expect(code, stderr).toBe(0);
	} finally {
		child?.kill();
		if (child) await child.exited;
	}
}, 15_000);
