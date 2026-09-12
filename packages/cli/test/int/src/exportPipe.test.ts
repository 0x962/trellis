import { expect, test } from "bun:test";
import { join } from "node:path";
import { originDir } from "../../../../../test/originDir";
import { fakeServer } from "../../fakeServer";

test("a review export writes the complete JSON through a pipe", async () => {
	const output = { body: "review body ".repeat(100_000) };
	const fake = fakeServer({ "reviews.export": output });
	const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: fake.fetch });
	const proc = Bun.spawn(
		[process.execPath, "src/index.ts", "review", "export", "owner/repo#12", "--url", server.url.href],
		{
			cwd: join(originDir(import.meta.dir), ".."),
			env: { ...process.env, TRELLIS_ACTOR: "agent:test" },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	await server.stop(true);
	expect(stderr).toBe("");
	expect(code).toBe(0);
	expect(stdout).toBe(`${JSON.stringify(output)}\n`);
});
