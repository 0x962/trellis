import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Node runs the real process cases, as the desktop runtime does. Bun test
// crashes when it finalizes a koffi or node-pty object, so this file loads
// neither module.
// TRELLIS_REQUIRE_LINUX_LIFECYCLE=1 turns a host without cgroup delegation
// into a failure. TRELLIS_EXPECT_LINUX_REFUSAL=1 runs only the refusal case,
// for a runtime in a cgroup that this user cannot write.
// TRELLIS_LINUX_PROOF names the file that receives the proof record.
const refusal = process.env.TRELLIS_EXPECT_LINUX_REFUSAL === "1";
const required = process.env.TRELLIS_REQUIRE_LINUX_LIFECYCLE === "1";
const home = mkdtempSync(join(tmpdir(), "trellis-linux-lifecycle-node-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

const fixture = await (async () => {
	if (process.platform !== "linux") return undefined;
	symlinkSync(resolve(import.meta.dir, "../../../../../node_modules"), join(home, "node_modules"));
	const build = await Bun.build({
		entrypoints: [join(import.meta.dir, "linuxLifecycleFixture.ts")],
		outdir: home,
		target: "node",
		external: ["node-pty", "koffi"],
	});
	if (!build.success) throw new AggregateError(build.logs, "Cannot bundle the Linux lifecycle fixture");
	return join(home, "linuxLifecycleFixture.js");
})();
const probe = fixture === undefined || refusal ? undefined : Bun.spawnSync(["node", fixture, "probe", ""]);

async function run(mode: string) {
	const proof = process.env.TRELLIS_LINUX_PROOF ?? join(home, "proof.json");
	const child = Bun.spawn(["node", fixture!, mode, proof], { stdout: "inherit", stderr: "pipe" });
	const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	expect(stderr).toBe("");
	expect(code).toBe(0);
}

test.skipIf(!required)("the host provides a delegated cgroup v2 subtree", () => {
	expect(probe?.stderr.toString()).toBe("");
	expect(probe?.exitCode).toBe(0);
});

test.skipIf(probe?.exitCode !== 0)("real process trees stay contained and stop on Linux", () => run("cases"), 120_000);

test.skipIf(fixture === undefined || !refusal)("a launch without cgroup delegation is refused", () => run("refusal"));
