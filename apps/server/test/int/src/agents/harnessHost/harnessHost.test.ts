import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { providers } from "../../../../../src/agents/harnessHost/providers.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

let home: string, daemon: ChildProcess, client: RuntimeClient, host: HarnessHost;
beforeEach(async () => {
	({ home, client, daemon, host } = await harnessHostFixture());
});
afterEach(async () => {
	await client.shutdown();
	await new Promise<void>((done) => daemon.once("exit", () => done()));
	await rm(home, { recursive: true, force: true });
});

test("the host registers the supported native harnesses", () => {
	expect(Object.keys(providers).sort()).toEqual(["claude", "codex", "opencode", "pi"]);
});

test("a manager gets private working context and cannot reuse an unrestricted launch descriptor", async () => {
	const input = {
		id: "manager-tools",
		managerId: "assignment",
		harness: "claude" as const,
		cwd: home,
		prompt: "Coordinate",
	};
	const managerSystemPrompt = `Database persona ${crypto.randomUUID()}`;
	const descriptor = await host.prepare({ ...input, kind: "manager", managerSystemPrompt });
	expect(descriptor.spec.cwd).toBe(join(home, "attempts", "manager-workspaces", "assignment"));
	expect(descriptor.spec.args).toContain("--strict-mcp-config");
	expect(descriptor.spec.args).not.toContain("--dangerously-skip-permissions");
	expect(await host.prepare({ ...input, kind: "manager", managerSystemPrompt })).toEqual(descriptor);
	const resumed = await host.prepare(
		{ ...input, cwd: descriptor.spec.cwd, id: "manager-resumed", kind: "manager", managerSystemPrompt },
		"same-provider-session",
	);
	expect(resumed.spec.cwd).toBe(descriptor.spec.cwd);
	await expect(
		host.prepare({ ...input, kind: "manager", managerSystemPrompt: "Changed database instruction" }),
	).rejects.toThrow("different launch request");
	await expect(host.prepare(input)).rejects.toThrow("different launch request");
	expect(await client.list()).toEqual([]);
});

test("the host preserves the assignment token and process deadline", async () => {
	await host.start({
		id: "assignment",
		harness: "pi",
		cwd: home,
		prompt: "initial",
		token: "assignment-token",
		timeoutMs: 60000,
	});
	const descriptor = JSON.parse(await readFile(join(home, "attempts", "assignment", "launch.json"), "utf8"));
	expect(descriptor.spec.env.TRELLIS_ATTEMPT_TOKEN).toBe("assignment-token");
	expect(descriptor.spec.timeoutMs).toBe(60000);
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
		if (harness === "codex") expect(JSON.parse(args[1]!).model).toBe("explicit-model");
		if (harness === "pi") expect(args).toContain("read,bash,edit,write,grep,find,ls");
		if (harness === "opencode") expect(args).toContain("--model");
		await host.waitFor("attempt", (s) => s.activity?.state === "idle");
		expect((await host.list({ status: "running" })).map((s) => s.id)).toEqual(["attempt"]);
		expect((await host.list({ activity: "idle" })).map((s) => s.id)).toEqual(["attempt"]);
		await host.send("attempt", "hello", "message");
		await host.waitFor("attempt", (s) => s.activity?.state === "idle");
		let response = "";
		for await (const event of host.subscribe("attempt", 0, AbortSignal.timeout(3000))) {
			if (event.type === "output") response += Buffer.from(event.data, "base64").toString();
			if (response.includes("fixture response")) break;
		}
		expect(response).toContain("fixture response");
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

test.each(["claude", "codex", "pi", "opencode"] as const)(
	"missing %s executable fails before process launch with its name and PATH",
	async (harness) => {
		const empty = join(home, "empty");
		await mkdir(empty);
		host = new HarnessHost({
			runtime: client,
			directory: join(home, "attempts"),
			env: { PATH: empty },
			bun: process.execPath,
		});
		await expect(host.start({ id: "missing", harness, cwd: home, prompt: "hello" })).rejects.toMatchObject({
			code: "HARNESS_NOT_INSTALLED",
		});
		expect(await client.list()).toEqual([]);
	},
);

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

test.each(["codex", "pi", "opencode"] as const)(
	"a normal %s completion does not confirm interruption",
	async (harness) => {
		host = new HarnessHost({
			runtime: client,
			directory: join(home, "attempts"),
			env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_BEHAVIOR: "normal-interrupt" },
			bun: process.execPath,
			observationTimeoutMs: 500,
		});
		await host.start({ id: "normal", harness, cwd: home, prompt: "hello" });
		await expect(host.interrupt("normal")).rejects.toMatchObject({ code: "HARNESS_OBSERVATION_TIMEOUT" });
		expect((await host.status("normal")).status).toBe("running");
	},
);

test("invalid public launch input fails before it creates attempt files", async () => {
	for (const change of [{ harness: "unknown" }, { cwd: "relative" }, { prompt: 42 }])
		await expect(
			host.start({ id: "invalid", harness: "claude", cwd: home, prompt: "hello", ...change } as never),
		).rejects.toThrow();
	expect(await client.list()).toEqual([]);
	await expect(readdir(join(home, "attempts"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("concurrent OpenCode resumes send one native initial prompt", async () => {
	const input = {
		id: "resume-once",
		harness: "opencode" as const,
		cwd: home,
		prompt: "initial resume",
		sessionId: "provider-original",
	};
	const results = await Promise.all(Array.from({ length: 12 }, () => host.resume(input)));
	expect(new Set(results.map((row) => row.process.pid)).size).toBe(1);
	const output = Buffer.from((await host.output(input.id)).data, "base64").toString();
	expect(output.match(/native prompt accepted/g)).toHaveLength(1);
	expect(results.every((row) => row.process.acknowledgedMessageIds.includes(input.id))).toBe(true);
});

test("an uncertain native delivery is not sent again after host recreation", async () => {
	await host.start({ id: "unknown-native", harness: "opencode", cwd: home, prompt: "first" });
	await host.waitFor("unknown-native", (state) => state.activity?.state === "idle");
	const descriptor = JSON.parse(await readFile(join(home, "attempts", "unknown-native", "launch.json"), "utf8"));
	const prompt = "trellis-message:uncertain\nnext";
	await client.registerNativeDelivery(
		"unknown-native",
		descriptor.spec.env.TRELLIS_ATTEMPT_TOKEN,
		"uncertain",
		createHash("sha256").update(prompt).digest("hex"),
		true,
	);
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin") },
		bun: process.execPath,
		observationTimeoutMs: 100,
	});
	await expect(host.send("unknown-native", "next", "uncertain")).rejects.toMatchObject({
		code: "HARNESS_OBSERVATION_TIMEOUT",
	});
	expect(Buffer.from((await host.output("unknown-native")).data, "base64").toString()).not.toContain(
		"native prompt accepted",
	);
});

test("an older OpenCode version fails before attempt files or processes exist", async () => {
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_VERSION: "1.4.11" },
		bun: process.execPath,
	});
	await expect(host.start({ id: "old", harness: "opencode", cwd: home, prompt: "hello" })).rejects.toMatchObject({
		code: "HARNESS_VERSION_UNSUPPORTED",
		message: expect.stringContaining("1.4.11"),
	});
	await expect(host.start({ id: "old", harness: "opencode", cwd: home, prompt: "hello" })).rejects.toThrow(
		"tested minimum is 1.18.31",
	);
	expect(await client.list()).toEqual([]);
	await expect(readdir(join(home, "attempts"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("a duplicate OpenCode attempt does not repeat the version command", async () => {
	const input = { id: "version-once", harness: "opencode" as const, cwd: home, prompt: "hello" };
	const first = await host.start(input);
	const duplicate = await host.start(input);
	expect(duplicate.process.pid).toBe(first.process.pid);
	expect(await readFile(join(home, "bin", "version-reads.txt"), "utf8")).toBe("version\n");
});

test("empty OpenCode version output fails without launch artifacts", async () => {
	host = new HarnessHost({
		runtime: client,
		directory: join(home, "attempts"),
		env: { ...process.env, PATH: join(home, "bin"), HARNESS_FIXTURE_VERSION: "" },
		bun: process.execPath,
	});
	await expect(host.start({ id: "unknown-version", harness: "opencode", cwd: home, prompt: "hello" })).rejects.toThrow(
		"version",
	);
	expect(await client.list()).toEqual([]);
	await expect(readdir(join(home, "attempts"))).rejects.toMatchObject({ code: "ENOENT" });
});
