import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let home: string;
afterEach(async () => {
	if (home) await rm(home, { recursive: true, force: true });
});

test("the runtime receives a prompt above two megabytes", async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-r-"));
	const entry = join(home, "probe.ts");
	await symlink(resolve(import.meta.dir, "../../../node_modules"), join(home, "node_modules"));
	await writeFile(
		entry,
		`
import { startRuntime } from ${JSON.stringify(join(import.meta.dir, "server.ts"))};
import { RuntimeClient } from ${JSON.stringify(resolve(import.meta.dir, "../../../packages/runtime-protocol/src/client.ts"))};
const runtime = await startRuntime(${JSON.stringify(home)});
try {
	const client = new RuntimeClient(runtime.hello.socketPath);
	await client.observe("absent", "token", { kind: "prompt", prompt: "x".repeat(2_100_000) });
} catch (error) {
	console.log(error.message);
} finally {
	await runtime.close();
}
`,
	);
	const build = await Bun.build({
		entrypoints: [entry],
		outdir: home,
		target: "node",
		external: ["fs-ext", "node-pty", "koffi"],
	});
	expect(build.success).toBe(true);
	const child = Bun.spawn(["node", join(home, "probe.js")], { stdout: "pipe", stderr: "pipe" });
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
	expect(stdout).toContain("Session absent does not exist");
}, 30_000);
