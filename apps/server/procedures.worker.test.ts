import { expect, test } from "bun:test";

// Each procedure file boots its own database worker in beforeAll. Under the
// parallel load of `bun run check` a boot takes longer than the 5 s default
// of a hook, so every hook and test of the nested run gets 30 s.
//
// The nested suite needs about two minutes on its own, and every parallel
// task slows it down. The cap below leaves room for that, so a slow machine
// reports the failures of the suite instead of one timeout with no detail.
test("the procedure suite passes through the worker transport", async () => {
	const proc = Bun.spawn(["bun", "test", "--timeout", "30000", "src/procedures"], {
		cwd: import.meta.dir,
		env: { ...process.env, TRELLIS_TEST_TRANSPORT: "worker" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 300_000);
