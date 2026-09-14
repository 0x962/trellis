import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

for (const method of ["input", "deliver"] as const) {
	test(`${method} on closed stdin retains the live process and reports an uncertain write`, async () => {
		await buildRuntime();
		const home = mkdtempSync("/tmp/trl-closed-input-");
		const daemon = spawn(
			process.env.TRELLIS_RUNTIME_NODE ?? "node",
			[resolve(originDir(import.meta.dir), "../dist/index.js"), "--home", home],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		const exited = new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
		const client = new RuntimeClient(join(home, "runtime.sock"));
		let pid: number | null = null;
		try {
			await new Promise<void>((resolve) => daemon.stdout!.once("data", () => resolve()));
			const identity = await client.hello();
			const session = await client.start({
				id: "closed-input",
				command: "/bin/sh",
				args: ["-c", "exec 0<&-; echo ready; exec sleep 60"],
				cwd: home,
				mode: "stdio",
			});
			pid = session.pid;
			let ready = false;
			for (let i = 0; i < 100 && !ready; i++) {
				ready = Buffer.from((await client.output(session.id)).data, "base64").includes("ready");
				if (!ready) await Bun.sleep(20);
			}
			expect(ready).toBe(true);
			const bytes = Buffer.from("test\n").toString("base64");
			const send = () =>
				method === "input" ? client.input(session.id, bytes) : client.deliver(session.id, "message-1", bytes);
			await expect(send()).rejects.toThrow("EPIPE");
			expect((await client.hello()).daemonId).toBe(identity.daemonId);
			const retained = (await client.list())[0]!;
			expect(retained.status).toBe("running");
			expect(retained.pid).toBe(pid);
			expect(retained.endedAt).toBeNull();
			expect(retained.error).toContain("Input delivery is unconfirmed");
			expect(() => process.kill(pid!, 0)).not.toThrow();
			if (method === "deliver") {
				expect((await client.deliver(session.id, "message-1", bytes)).status).toBe("unknown");
				const ledger = JSON.parse(readFileSync(join(home, "sessions", `${session.id}.input.json`), "utf8"));
				expect(ledger[0][1].status).toBe("unknown");
			}
			expect((await client.stop(session.id)).status).toBe("exited");
			expect(() => process.kill(pid!, 0)).toThrow();
			pid = null;
			await client.shutdown();
			await exited;
			expect(daemon.exitCode).toBe(0);
		} finally {
			if (pid !== null) process.kill(-pid, "SIGKILL");
			if (daemon.exitCode === null && daemon.signalCode === null) daemon.kill("SIGTERM");
			await exited;
			rmSync(home, { recursive: true, force: true });
		}
	});
}
