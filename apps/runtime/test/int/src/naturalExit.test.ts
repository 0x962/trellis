import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const home = mkdtempSync("/tmp/trl-natural-exit-");
const client = new RuntimeClient(join(home, "runtime.sock"));
let daemon: ChildProcess;
const running = (pid: number) => {
	const state = spawnSync("/bin/ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" }).stdout.trim();
	return state !== "" && !state.startsWith("Z");
};
beforeAll(async () => {
	await buildRuntime();
	daemon = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		[resolve(originDir(import.meta.dir), "../dist/index.js"), "--home", home],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	await new Promise<void>((resolve, reject) => {
		daemon.stdout!.once("data", () => resolve());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
});
afterAll(async () => {
	daemon.kill("SIGTERM");
	await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
	rmSync(home, { recursive: true, force: true });
});
for (const mode of ["stdio", "pty"] as const) {
	test(`${mode} natural leader exit stops redirected background jobs before it reports exited`, async () => {
		const command =
			"trap '' HUP; sleep 60 </dev/null >/dev/null 2>&1 & child=$!; echo CHILD:$child; printf GROUP:; /bin/ps -p $child -o pgid=; exit 0";
		const session = await client.start({
			id: `natural-${mode}`,
			command: "/bin/sh",
			args: mode === "pty" ? ["-i", "-c", command] : ["-c", command],
			cwd: home,
			mode,
			timeoutMs: 5000,
		});
		let childPid = 0;
		try {
			const deadline = Date.now() + 5000;
			while (Date.now() < deadline) {
				const output = Buffer.from((await client.output(session.id)).data, "base64").toString();
				childPid = Number(/CHILD:(\d+)/.exec(output)?.[1] ?? 0);
				if (childPid && (await client.list()).find((item) => item.id === session.id)?.status === "exited") break;
				await Bun.sleep(20);
			}
			expect(childPid).toBeGreaterThan(0);
			expect((await client.list()).find((item) => item.id === session.id)?.status).toBe("exited");
			const output = Buffer.from((await client.output(session.id)).data, "base64").toString();
			const group = Number(/GROUP:\s*(\d+)/.exec(output)?.[1]);
			if (mode === "pty") expect(group).not.toBe(session.pid!);
			else expect(group).toBe(session.pid!);
			expect(running(childPid)).toBe(false);
		} finally {
			if (childPid && running(childPid)) process.kill(childPid, "SIGKILL");
		}
	});
}

test("explicit stop includes a still-attached child which creates a new session", async () => {
	const node = process.env.TRELLIS_RUNTIME_NODE ?? "node";
	const script =
		"const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}); console.log('CHILD:'+child.pid); setInterval(()=>{},1000);";
	const session = await client.start({
		id: "explicit-new-session",
		command: node,
		args: ["-e", script],
		cwd: home,
		mode: "stdio",
	});
	let childPid = 0;
	try {
		const deadline = Date.now() + 5000;
		while (!childPid && Date.now() < deadline) {
			const output = Buffer.from((await client.output(session.id)).data, "base64").toString();
			childPid = Number(/CHILD:(\d+)/.exec(output)?.[1] ?? 0);
			if (!childPid) await Bun.sleep(20);
		}
		expect(childPid).toBeGreaterThan(0);
		expect(running(childPid)).toBe(true);
		expect((await client.stop(session.id)).status).toBe("exited");
		expect(running(childPid)).toBe(false);
	} finally {
		if (childPid && running(childPid)) process.kill(childPid, "SIGKILL");
		await client.stop(session.id);
	}
});
