import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Node runs the real process cases. Bun test crashes when it finalizes a
// node-pty object, and the desktop runtime runs on Node.
// TRELLIS_REQUIRE_LINUX_LIFECYCLE=1 turns a host without cgroup delegation
// into a failure. TRELLIS_EXPECT_LINUX_REFUSAL=1 runs only the refusal case,
// for a runtime in a cgroup that this user cannot write.
// TRELLIS_LINUX_PROOF names the file that receives the proof record.
const refusal = process.env.TRELLIS_EXPECT_LINUX_REFUSAL === "1";
const required = process.env.TRELLIS_REQUIRE_LINUX_LIFECYCLE === "1";
const delegated = await (async () => {
	if (process.platform !== "linux" || refusal) return false;
	const { linuxCgroupLifecycle } = await import("./index.ts");
	try {
		linuxCgroupLifecycle.prepareLaunch({ id: "probe", command: "/bin/true", args: [], cwd: "/", mode: "stdio" });
		return true;
	} catch (error) {
		if (required) throw error;
		return false;
	}
})();

const home = mkdtempSync(join(tmpdir(), "trellis-linux-lifecycle-node-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

async function runFixture(mode: string) {
	symlinkSync(resolve(import.meta.dir, "../../../../../node_modules"), join(home, "node_modules"));
	const build = await Bun.build({
		entrypoints: [join(import.meta.dir, "linuxLifecycleFixture.ts")],
		outdir: home,
		target: "node",
		external: ["node-pty", "koffi"],
	});
	expect(build.success).toBe(true);
	const proof = process.env.TRELLIS_LINUX_PROOF ?? join(home, "proof.json");
	const child = Bun.spawn(["node", join(home, "linuxLifecycleFixture.js"), mode, proof], {
		stdout: "inherit",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	expect(stderr).toBe("");
	expect(code).toBe(0);
}

test.skipIf(!delegated)("real process trees stay contained and stop on Linux", () => runFixture("cases"), 120_000);

test.skipIf(process.platform !== "linux" || !refusal)("a launch without cgroup delegation is refused", () =>
	runFixture("refusal"),
);
