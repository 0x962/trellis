import { afterAll, beforeAll, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../test/originDir.ts";
import { buildRuntime } from "../../runtimeBuild.ts";

const runtimeNode = process.env.TRELLIS_RUNTIME_NODE ?? "node";
const sourceDir = originDir(import.meta.dir);
const home = mkdtempSync("/tmp/trl-rt-");
const client = new RuntimeClient(join(home, "runtime.sock"));
let daemon: ChildProcess;
async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
	const until = Date.now() + 5000;
	while (true) {
		const value = await read();
		if (accept(value)) return value;
		if (Date.now() > until) throw new Error("Condition did not become true");
		await Bun.sleep(20);
	}
}
beforeAll(async () => {
	await buildRuntime();
	daemon = spawn(runtimeNode, [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((resolve, reject) => {
		daemon.stdout!.once("data", () => resolve());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
});
afterAll(async () => {
	for (const session of await client.list()) if (session.status === "running") await client.stop(session.id);
	daemon.kill("SIGTERM");
	await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
	rmSync(home, { recursive: true, force: true });
});
test("repeated concurrent starts and client reconnect keep one child", async () => {
	const spec = { id: "dedup", command: "/bin/cat", args: [], cwd: home, mode: "stdio" as const };
	const sessions = await Promise.all(Array.from({ length: 12 }, () => client.start(spec)));
	expect(new Set(sessions.map((session) => session.pid)).size).toBe(1);
	const next = new RuntimeClient(join(home, "runtime.sock"));
	expect((await next.list()).filter((session) => session.id === spec.id)).toHaveLength(1);
	const bytes = Buffer.from([0, 27, 91, 65, 0xc3, 0xa9, 10]);
	await next.input(spec.id, bytes.toString("base64"));
	const output = await waitFor(
		() => next.output(spec.id),
		(out) => out.nextOffset >= bytes.length,
	);
	expect(Buffer.from(output.data, "base64")).toEqual(bytes);
	await next.stop(spec.id);
	expect((await client.start(spec)).status).toBe("exited");
});
test("socket, manifest and output use owner-only permissions", async () => {
	expect(statSync(join(home, "runtime.sock")).mode & 0o777).toBe(0o600);
	expect(statSync(join(home, "manifest.json")).mode & 0o777).toBe(0o600);
	expect(JSON.parse(readFileSync(join(home, "manifest.json"), "utf8")).daemonId).toBe((await client.hello()).daemonId);
});
test("PTY input, resize and stop work in Node", async () => {
	const session = await client.start({
		id: "pty",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "pty",
		cols: 80,
		rows: 24,
	});
	expect(session.pid).toBeGreaterThan(0);
	await client.resize(session.id, 120, 40);
	await client.input(session.id, Buffer.from("hello pty\n").toString("base64"));
	const output = await waitFor(
		() => client.output(session.id),
		(out) => Buffer.from(out.data, "base64").includes("hello pty"),
	);
	expect(output.nextOffset).toBeGreaterThan(0);
	expect((await client.stop(session.id)).status).toBe("exited");
});
test("stop before launch records cancellation and rejects a delayed start", async () => {
	expect((await client.stop("canceled-before-start")).status).toBe("exited");
	const result = await client.start({
		id: "canceled-before-start",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "stdio",
	});
	expect(result.pid).toBeNull();
	expect(result.status).toBe("exited");
});
test("same launch identifier cannot change its command", async () => {
	await expect(
		client.start({ id: "dedup", command: "/bin/echo", args: ["duplicate"], cwd: home, mode: "stdio" }),
	).rejects.toThrow("different command");
});
test("output is bounded and reports the missing byte interval", async () => {
	const count = 1200000;
	const session = await client.start({
		id: "large-output",
		command: process.env.TRELLIS_RUNTIME_NODE ?? "node",
		args: ["-e", `process.stdout.write(Buffer.alloc(${count},120))`],
		cwd: home,
		mode: "stdio",
	});
	await waitFor(
		() => client.list(),
		(sessions) => sessions.find((item) => item.id === session.id)?.status === "exited",
	);
	const result = await client.output(session.id);
	expect(result.nextOffset).toBe(count);
	expect(result.startOffset).toBe(count - 1024 * 1024);
	expect(result.truncated).toBe(true);
	expect(Buffer.from(result.data, "base64").length).toBe(1024 * 1024);
	expect(statSync(join(home, "sessions", `${session.id}.output.json`)).mode & 0o777).toBe(0o600);
});
test("PTY churn releases file descriptors", async () => {
	const descriptors = () =>
		spawnSync("/usr/sbin/lsof", ["-p", String(daemon.pid), "-Ff"], { encoding: "utf8" })
			.stdout.split("\n")
			.filter((line) => /^f\d/.test(line)).length;
	const before = descriptors();
	expect(before).toBeGreaterThan(0);
	for (let i = 0; i < 25; i++) {
		const session = await client.start({ id: `churn-${i}`, command: "/bin/cat", args: [], cwd: home, mode: "pty" });
		await client.stop(session.id);
	}
	expect(descriptors()).toBeLessThanOrEqual(before + 2);
});
test("stop kills the shell and its child process group", async () => {
	const session = await client.start({
		id: "descendants",
		command: "/bin/sh",
		args: ["-c", "sleep 60 & echo $!; wait"],
		cwd: home,
		mode: "stdio",
	});
	const result = await waitFor(
		() => client.output(session.id),
		(out) => out.nextOffset > 0,
	);
	const childPid = Number(Buffer.from(result.data, "base64").toString().trim());
	expect(childPid).toBeGreaterThan(0);
	await client.stop(session.id);
	expect(() => process.kill(session.pid!, 0)).toThrow();
	await waitFor(
		async () => spawnSync("ps", ["-p", String(childPid), "-o", "stat="], { encoding: "utf8" }).stdout.trim(),
		(state) => state === "" || state.startsWith("Z"),
	);
});
test("a second daemon cannot change the live runtime identity", async () => {
	const before = await client.hello();
	const duplicate = spawn(runtimeNode, [resolve(sourceDir, "../dist/index.js"), "--home", home], { stdio: "ignore" });
	const code = await new Promise<number | null>((resolve) => duplicate.once("exit", resolve));
	expect(code).not.toBe(0);
	expect((await client.hello()).daemonId).toBe(before.daemonId);
});
test("hard crash retains output and marks prior processes unknown", async () => {
	const spec = {
		id: "crash",
		command: runtimeNode,
		args: ["-e", "process.stdout.write('durable bytes\\n'); setInterval(()=>{},1000)"],
		cwd: home,
		mode: "stdio" as const,
	};
	const session = await client.start(spec);

	await waitFor(
		() => client.output(session.id),
		(out) => out.nextOffset > 0,
	);
	const oldId = (await client.hello()).daemonId;
	daemon.kill("SIGKILL");
	await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
	process.kill(-session.pid!, "SIGKILL");
	daemon = spawn(runtimeNode, [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((resolve, reject) => {
		daemon.stdout!.once("data", () => resolve());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	expect((await client.hello()).daemonId).not.toBe(oldId);
	expect((await client.start(spec)).status).toBe("unknown");
	expect((await client.start(spec)).pid).toBe(session.pid);
	expect(Buffer.from((await client.output(session.id)).data, "base64").toString()).toBe("durable bytes\n");
	expect((await client.stop("canceled-before-start")).pid).toBeNull();
});
test("stop reaches PTY jobs in separate process groups", async () => {
	const session = await client.start({
		id: "pty-descendants",
		command: "/bin/sh",
		args: ["-i", "-c", "trap '' HUP; sleep 60 & echo CHILD:$!; wait"],
		cwd: home,
		mode: "pty",
	});
	const output = await waitFor(
		() => client.output(session.id),
		(out) => /CHILD:(\d+)/.test(Buffer.from(out.data, "base64").toString()),
	);
	const pid = Number(/CHILD:(\d+)/.exec(Buffer.from(output.data, "base64").toString())![1]);
	await client.stop(session.id);
	await waitFor(
		async () => spawnSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" }).stdout.trim(),
		(state) => state === "" || state.startsWith("Z"),
	);
});
test("a missing executable retains its actionable launch error", async () => {
	const session = await client.start({
		id: "missing",
		command: "/not/a/real/program",
		args: [],
		cwd: home,
		mode: "stdio",
	});
	const sessions = await waitFor(
		() => client.list(),
		(rows) => rows.find((row) => row.id === session.id)?.status === "exited",
	);
	expect(sessions.find((row) => row.id === session.id)?.error).toContain("ENOENT");
});
test("keyed input is written once across concurrent calls", async () => {
	const session = await client.start({ id: "keyed-input", command: "/bin/cat", args: [], cwd: home, mode: "stdio" });
	const bytes = Buffer.from("one message\n").toString("base64");
	const deliveries = await Promise.all(Array.from({ length: 8 }, () => client.deliver(session.id, "message-1", bytes)));
	expect(deliveries.every((delivery) => delivery.status === "written")).toBe(true);
	const output = await waitFor(
		() => client.output(session.id),
		(out) => out.nextOffset > 0,
	);
	expect(Buffer.from(output.data, "base64").toString()).toBe("one message\n");
	await expect(client.deliver(session.id, "message-1", Buffer.from("different").toString("base64"))).rejects.toThrow(
		"different bytes",
	);
	await client.stop(session.id);
});
test("structured stdout does not mix with stderr diagnostics", async () => {
	const session = await client.start({
		id: "separate-stderr",
		command: runtimeNode,
		args: ["-e", "process.stdout.write('json\\n');process.stderr.write('diagnostic\\n')"],
		cwd: home,
		mode: "stdio",
		separateStderr: true,
	});
	await waitFor(
		() => client.list(),
		(rows) => rows.find((row) => row.id === session.id)?.status === "exited",
	);
	expect(Buffer.from((await client.output(session.id)).data, "base64").toString()).toBe("json\n");
	expect(Buffer.from((await client.output(session.id, 0, "stderr")).data, "base64").toString()).toBe("diagnostic\n");
});
test("unknown keyed input stays unknown and is not sent again", async () => {
	const bytes = Buffer.from("uncertain\n").toString("base64");
	await expect(client.deliver("missing", "unknown-message", bytes)).rejects.toThrow("exited");
	expect((await client.deliver("missing", "unknown-message", bytes)).status).toBe("unknown");
});
test("keyed input records survive a daemon restart", async () => {
	daemon.kill("SIGTERM");
	await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
	daemon = spawn(runtimeNode, [resolve(sourceDir, "../dist/index.js"), "--home", home], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	await new Promise<void>((resolve, reject) => {
		daemon.stdout!.once("data", () => resolve());
		daemon.once("exit", (code) => reject(new Error(`Runtime exited ${code}`)));
	});
	expect(
		(await client.deliver("missing", "unknown-message", Buffer.from("uncertain\n").toString("base64"))).status,
	).toBe("unknown");
	expect(
		(await client.deliver("keyed-input", "message-1", Buffer.from("one message\n").toString("base64"))).status,
	).toBe("written");
});
