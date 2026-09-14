import { expect, test } from "bun:test";
import { originDir } from "../../../../test/originDir.ts";

// The procedure suite opens a database worker for each contract fixture.
// Its timeout includes those boots and the commands in process fixtures.
test("the procedure suite passes through the worker transport", async () => {
	const proc = Bun.spawn(["bun", "test", "--timeout", "30000", "src/procedures"], {
		cwd: originDir(import.meta.dir),
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
}, 600_000);
