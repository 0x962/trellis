import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../../../test/originDir.ts";
import { buildRuntime } from "../../../../../../runtime/test/runtimeBuild.ts";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";

const sourceDir = originDir(import.meta.dir);
const repo = resolve(sourceDir, "../../../../..");
let home: string, daemon: ChildProcess, client: RuntimeClient, host: HarnessHost;
beforeAll(buildRuntime);
beforeEach(async () => {
	home = await mkdtemp("/tmp/trl-hhost-");
	const bin = join(home, "bin");
	await mkdir(bin);
	for (const harness of ["claude", "codex", "pi", "opencode", "agy"]) {
		const executable = join(bin, harness);
		await writeFile(
			executable,
			`#!${process.execPath}\nimport ${JSON.stringify(resolve(repo, "apps/server/test/fixtures/harnessHost/nativeHarness.ts"))};\n`,
		);
		await chmod(executable, 0o700);
	}
	client = new RuntimeClient(join(home, "runtime.sock"));
	daemon = spawn(
		process.env.TRELLIS_RUNTIME_NODE ?? "node",
		[resolve(repo, "apps/runtime/dist/index.js"), "--home", home],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	await new Promise<void>((done) => daemon.stdout!.once("data", () => done()));
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: bin },
		bun: process.execPath,
		observationTimeoutMs: 1500,
	});
});
afterEach(async () => {
	await client.shutdown();
	await new Promise<void>((done) => daemon.once("exit", () => done()));
	await rm(home, { recursive: true, force: true });
});

test.each(["claude", "codex", "pi", "opencode"] as const)(
	"%s host supports identity, model, input, output, events, lists, elapsed, resume, and stop",
	async (harness) => {
		const started = await host.start({ id: "attempt", harness, cwd: home, prompt: "initial", model: "explicit-model" });
		expect(started.process.agent?.sessionId).toBe(`provider-${harness}`);
		expect(started.process.agent?.model).toBe("explicit-model");
		expect(started.process.acknowledgedMessageIds).toContain("attempt");
		expect(started.process.elapsedMs).toBeNumber();
		const args = started.process.launch!.args;
		if (harness === "claude") expect(args).toContain("--dangerously-skip-permissions");
		if (harness === "codex") expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
		if (harness === "pi") expect(args).toContain("read,bash,edit,write,grep,find,ls");
		if (harness === "opencode") expect(args).toContain("--model");
		await host.waitFor("attempt", (s) => s.activity?.state === "idle");
		expect((await host.list({ status: "running" })).map((s) => s.id)).toEqual(["attempt"]);
		expect((await host.list({ activity: "idle" })).map((s) => s.id)).toEqual(["attempt"]);
		await host.send("attempt", "hello", "message");
		await host.waitFor("attempt", (s) => s.activity?.state === "idle");
		expect(Buffer.from((await host.output("attempt")).data, "base64").toString()).toContain("fixture response");
		expect(Buffer.from((await host.output("attempt", 0, "events")).data, "base64").toString()).toContain(
			'"tool-start"',
		);
		await host.stop("attempt");
		expect((await host.status("attempt")).status).toBe("exited");
		const resumed = await host.resume({
			id: "resumed",
			harness,
			cwd: home,
			prompt: "resume",
			model: "explicit-model",
			sessionId: `provider-${harness}`,
		});
		expect(resumed.process.agent?.sessionId).toBe(`provider-${harness}`);
		await host.stop("resumed");
	},
	10000,
);

test("missing executable fails before process launch with its name and PATH", async () => {
	const empty = join(home, "empty");
	await mkdir(empty);
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { PATH: empty },
		bun: process.execPath,
	});
	await expect(host.start({ id: "missing", harness: "claude", cwd: home, prompt: "hello" })).rejects.toThrow("claude");
	expect(await client.list()).toEqual([]);
});

test("silent native hooks time out with the retained attempt ID", async () => {
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_BEHAVIOR: "silent" },
		bun: process.execPath,
		observationTimeoutMs: 100,
	});
	await expect(host.start({ id: "silent", harness: "claude", cwd: home, prompt: "hello" })).rejects.toThrow("silent");
	expect((await host.status("silent")).status).toBe("running");
	await host.stop("silent");
});

test.each(["claude", "codex", "pi", "opencode"] as const)(
	"%s interrupt preserves the actual process and waits for a provider idle event",
	async (harness) => {
		host = new HarnessHost({
			runtime: client,
			directory: join(home, "attempts"),
			env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_BEHAVIOR: "busy" },
			bun: process.execPath,
			observationTimeoutMs: 1500,
		});
		await host.start({ id: "busy", harness, cwd: home, prompt: "hello" });
		const pid = (await host.status("busy")).pid;
		expect((await host.interrupt("busy")).activity?.state).toBe("idle");
		expect((await host.status("busy")).pid).toBe(pid);
	},
);

test("AGY reports capability gaps and requires explicit manual mode", async () => {
	await expect(host.start({ id: "agy-auto", harness: "agy", cwd: home, prompt: "hello" })).rejects.toThrow("hooks");
	const result = await host.start({ id: "agy-manual", harness: "agy", cwd: home, prompt: "hello", mode: "manual" });
	expect(result.capabilityGaps.length).toBeGreaterThan(0);
	expect(result.process.agent).toBeNull();
	await expect(host.send("agy-manual", "hello", "message")).rejects.toThrow("hooks");
});

test("a crashed executable stays visible in the error list", async () => {
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_BEHAVIOR: "crash" },
		bun: process.execPath,
		observationTimeoutMs: 1500,
	});
	await expect(host.start({ id: "crashed", harness: "claude", cwd: home, prompt: "hello" })).rejects.toThrow("crashed");
	expect((await host.list({ status: "exited", hasError: true })).map((s) => s.id)).toEqual(["crashed"]);
});

test("a new host instance reconnects to the same process and streams output from its offset", async () => {
	await host.start({ id: "retained", harness: "claude", cwd: home, prompt: "first" });
	await host.waitFor("retained", (state) => state.activity?.state === "idle");
	const before = await host.status("retained");
	const offset = (await host.output("retained")).nextOffset;
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin") },
		bun: process.execPath,
		observationTimeoutMs: 1500,
	});
	const received = (async () => {
		let text = "";
		for await (const event of host.subscribe("retained", offset, AbortSignal.timeout(3000))) {
			if (event.type === "output") text += Buffer.from(event.data, "base64").toString();
			if (text.includes("fixture response")) return text;
		}
		throw new Error("No output after host reconnect");
	})();
	await host.send("retained", "next", "next-message");
	expect(await received).toContain("fixture response");
	expect((await host.status("retained")).pid).toBe(before.pid);
	await host.stop("retained");
});

test.each(["claude", "codex", "pi", "opencode"] as const)(
	"twelve concurrent %s starts share one process and reject a conflicting request",
	async (harness) => {
		const second = new HarnessHost({
			runtime: client,
			directory: join(home, "attempts"),
			env: { ...process.env, PATH: join(home, "bin") },
			bun: process.execPath,
			observationTimeoutMs: 1500,
		});
		const input = { id: "duplicate", harness, cwd: home, prompt: "once", model: "explicit-model" };
		const results = await Promise.all(
			Array.from({ length: 12 }, (_, index) => (index % 2 ? host : second).start(input)),
		);
		expect(new Set(results.map((result) => result.process.pid)).size).toBe(1);
		expect(await client.list()).toHaveLength(1);
		const directories = (await readdir(join(home, "attempts", "duplicate"))).filter((name) =>
			name.startsWith("config-"),
		);
		expect(directories).toHaveLength(1);
		if (harness === "pi")
			expect(results[0]!.process.launch!.args.join(" ")).toContain(
				join(home, "attempts", "duplicate", directories[0]!),
			);
		await expect(host.start({ ...input, prompt: "different" })).rejects.toThrow("different");
	},
);
