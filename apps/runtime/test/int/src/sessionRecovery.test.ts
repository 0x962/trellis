import { expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test.each(["before", "after"])(
	"a leader that exits %s recovery retains child status and pushes final exit",
	async (when) => {
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
		if (when === "before") process.kill(session.pid!, "SIGKILL");
		daemon = await boot(home);
		const events = client.subscribeSession(session.id, AbortSignal.timeout(2000));
		const initial = await events.next();
		if (when === "after") {
			expect(initial.value).toMatchObject({ type: "session", session: { status: "running" } });
			process.kill(session.pid!, "SIGKILL");
		}
		const unknown =
			initial.value?.type === "session" && initial.value.session.status === "unknown"
				? initial.value
				: await (async () => {
						while (true) {
							const next = await events.next();
							if (next.done) throw new Error("No child status arrived");
							if (next.value.type === "session" && next.value.session.status === "unknown") return next.value;
						}
					})();
		expect(unknown).toMatchObject({
			type: "session",
			session: { status: "unknown", controllable: false, elapsedMs: null },
		});
		await Bun.sleep(50);
		process.kill(childPid, "SIGKILL");
		const completion = (async () => {
			for await (const event of events) if (event.type === "session" && event.session.status === "exited") return event;
			throw new Error("No process exit arrived");
		})();
		await expect(
			completion.finally(async () => {
				await kill(daemon);
				rmSync(home, { recursive: true, force: true });
			}),
		).resolves.toMatchObject({ type: "session", session: { status: "exited", elapsedMs: null } });
	},
);

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
	for (let index = 0; index < 10; index++) {
		const task = await client.start({
			id: `short-${index}`,
			command: "/usr/bin/true",
			args: [],
			cwd: home,
			mode: "stdio",
		});
		await client.stop(task.id);
	}
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

test("a recovered PID with another kernel identity does not claim or watch the replacement process", async () => {
	await buildRuntime();
	const home = mkdtempSync("/tmp/trl-reused-pid-");
	const replacement = spawn("/bin/sleep", ["60"], { detached: true, stdio: "ignore" });
	await new Promise<void>((done) => replacement.once("spawn", done));
	let daemon: ChildProcess | undefined;
	try {
		mkdirSync(join(home, "sessions"));
		writeFileSync(
			join(home, "sessions", "previous.session.json"),
			JSON.stringify({
				fingerprint: null,
				identity: `${replacement.pid}:0:0`,
				session: {
					id: "previous",
					daemonId: "old-daemon",
					pid: replacement.pid,
					mode: "stdio",
					status: "running",
					startedAt: "2000-01-01T00:00:00Z",
					endedAt: null,
					exitCode: null,
					error: null,
				},
			}),
		);
		daemon = await boot(home);
		const client = new RuntimeClient(join(home, "runtime.sock"));
		expect(await client.inspect("previous")).toMatchObject({ status: "exited", controllable: false, process: null });
		const events = [];
		for await (const event of client.subscribeSession("previous", AbortSignal.timeout(1000))) events.push(event);
		expect(events.at(-1)).toMatchObject({ type: "session", session: { status: "exited" } });
		expect(() => process.kill(replacement.pid!, 0)).not.toThrow();
		const exited = new Promise<void>((done) => daemon!.once("exit", () => done()));
		await client.shutdown();
		await exited;
		expect(() => process.kill(replacement.pid!, 0)).not.toThrow();
	} finally {
		if (daemon && daemon.exitCode === null && daemon.signalCode === null) await kill(daemon);
		await kill(replacement);
		rmSync(home, { recursive: true, force: true });
	}
});
