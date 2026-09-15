import { expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const runtimeNode = process.env.TRELLIS_RUNTIME_NODE ?? "node";
const sourceDir = originDir(import.meta.dir);
const boot = async (home: string) => {
	const child = spawn(runtimeNode, [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((resolve, reject) => {
		child.stdout!.once("data", () => resolve());
		child.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	return child;
};
const kill = async (child: ChildProcess) => {
	child.kill("SIGKILL");
	await new Promise<void>((resolve) => child.once("exit", () => resolve()));
};

test("recovery does not report exit while the process session retains a live child", async () => {
	await buildRuntime();
	const home = mkdtempSync("/tmp/trl-orphan-");
	const client = new RuntimeClient(join(home, "runtime.sock"));
	let daemon = await boot(home);
	const session = await client.start({
		id: "orphan",
		command: runtimeNode,
		args: [
			"-e",
			"const c=require('node:child_process').spawn('/bin/sleep',['60'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)",
		],
		cwd: home,
		mode: "stdio",
	});
	let childPid = 0;
	for await (const event of client.subscribe(session.id, 0, AbortSignal.timeout(5000))) {
		if (event.type !== "output") continue;
		childPid = Number(Buffer.from(event.data, "base64").toString().trim());
		if (childPid > 0) break;
	}
	await kill(daemon);
	process.kill(session.pid!, "SIGKILL");
	daemon = await boot(home);
	const observed = await client.inspect(session.id);
	process.kill(childPid, "SIGKILL");
	let stopped = await client.inspect(session.id);
	const deadline = Date.now() + 5000;
	while (stopped.status !== "exited" && Date.now() < deadline) {
		await Bun.sleep(10);
		stopped = await client.inspect(session.id);
	}
	await kill(daemon);
	rmSync(home, { recursive: true, force: true });
	expect(observed.status).toBe("unknown");
	expect(observed.controllable).toBe(false);
	expect(observed.error).toContain("child");
	expect(stopped.status).toBe("exited");
});

test("a recovered live process pushes its exit without a status poll", async () => {
	await buildRuntime();
	const home = mkdtempSync("/tmp/trl-recovered-stream-");
	const client = new RuntimeClient(join(home, "runtime.sock"));
	let daemon = await boot(home);
	const spec = {
		id: "recovered-stream",
		command: "/bin/sleep",
		args: ["60"],
		cwd: home,
		mode: "stdio" as const,
		env: { TRELLIS_ATTEMPT_TOKEN: "recovery-token" },
	};
	const session = await client.start(spec);
	await client.turn(session.id, "recovery-token", "UserPromptSubmit", session.id);
	const receipt = await client.turn(session.id, "recovery-token", "Stop", undefined, "Completed before restart");
	await kill(daemon);
	daemon = await boot(home);
	const recovered = await client.inspect(session.id);
	expect(recovered.activity).toBeNull();
	expect(recovered.acknowledgedMessageIds).toEqual([session.id]);
	expect(recovered.result).toEqual(receipt.result);
	expect((await client.start(spec)).pid).toBe(session.pid);
	await expect(client.input(session.id, Buffer.from("input").toString("base64"))).rejects.toThrow();
	const events = client.subscribeSession(session.id, AbortSignal.timeout(1000));
	const initial = await events.next();
	expect(initial.value).toMatchObject({ type: "session", session: { status: "running", controllable: false } });
	process.kill(session.pid!, "SIGKILL");
	const completion = (async () => {
		for await (const event of events) if (event.type === "session" && event.session.status === "exited") return event;
		throw new Error("No process exit arrived");
	})();
	await expect(
		completion.finally(async () => {
			await kill(daemon);
			rmSync(home, { recursive: true, force: true });
		}),
	).resolves.toMatchObject({ type: "session", session: { status: "exited" } });
});
