import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const killProcessGroup = (pid: number) => {
	try {
		process.kill(-pid, "SIGKILL");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
};

test("failed cleanup preserves PTY input, viewport resize, and a later stop", async () => {
	await buildRuntime();
	const source = originDir(import.meta.dir);
	const home = mkdtempSync("/tmp/trl-cleanup-");
	const daemon = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		["--import", resolve(source, "../test/failCleanup.mjs"), resolve(source, "../dist/index.js"), "--home", home],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	const client = new RuntimeClient(join(home, "runtime.sock"));
	let pid: number | null = null;
	try {
		await new Promise<void>((resolve, reject) => {
			daemon.stdout!.once("data", () => resolve());
			daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
		});
		const launched = await client.start({
			id: "retained-pty",
			command: "/bin/sh",
			args: ["-c", "while IFS= read -r line; do stty size; printf '%s\\n' \"$line\"; done"],
			cwd: home,
			mode: "pty",
			cols: 98,
			rows: 40,
			env: { TRELLIS_ATTEMPT_TOKEN: "cleanup-fixture-token" },
		});
		pid = launched.pid;
		writeFileSync(join(home, "fail-cleanup"), "");
		await expect(client.stop(launched.id)).rejects.toThrow("spawnSync /bin/ps ETIMEDOUT");
		const failed = await client.inspect(launched.id);
		expect(failed).toMatchObject({
			pid,
			status: "running",
			controllable: true,
			error: "Process cleanup is unconfirmed: spawnSync /bin/ps ETIMEDOUT",
		});
		await expect(
			client.observe(launched.id, "wrong-token", { kind: "session", sessionId: "provider" }),
		).rejects.toThrow("token");
		expect(
			await client.observe(launched.id, "cleanup-fixture-token", { kind: "session", sessionId: "provider" }),
		).toMatchObject({ agent: { sessionId: "provider" } });
		await client.resize(launched.id, 200, 80);
		await client.input(launched.id, Buffer.from("Input after failed cleanup\n").toString("base64"));
		const deadline = Date.now() + 5000;
		let output = "";
		while (!output.includes("80 200") && Date.now() < deadline) {
			output = Buffer.from((await client.output(launched.id)).data, "base64").toString();
			await Bun.sleep(20);
		}
		expect(output).toContain("80 200");
		expect(output).toContain("Input after failed cleanup");
		const stopped = await client.stop(launched.id);
		expect(stopped).toMatchObject({ status: "exited", controllable: false });
		expect(stopped.error).not.toBe(failed.error);
	} finally {
		if (pid !== null) killProcessGroup(pid);
		daemon.kill("SIGTERM");
		await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
		rmSync(home, { recursive: true, force: true });
	}
}, 15000);
