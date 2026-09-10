import { expect, test } from "bun:test";

test(
	"the procedure suite passes through the worker transport",
	async () => {
		const proc = Bun.spawn(["bun", "test", "src/procedures"], {
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
	},
	120_000,
);
