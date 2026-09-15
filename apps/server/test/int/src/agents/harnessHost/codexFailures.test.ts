import { expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

const enabled = process.env.TRELLIS_REAL_HARNESS_ACCEPTANCE === "1";
for (const status of [401, 400, 429, 503, "dropped-stream", "retry"] as const)
	test.skipIf(!enabled)(
		`Codex native engine exposes final HTTP ${status} failure`,
		async () => {
			const fixture = await harnessHostFixture();
			let requests = 0;
			const endpoint = Bun.serve({
				port: 0,
				fetch() {
					requests++;
					if (status === "dropped-stream")
						return new Response(
							'event: response.created\ndata: {"type":"response.created","response":{"id":"r","object":"response","created_at":123,"status":"in_progress","model":"test-model","output":[]}}\n\n',
							{ headers: { "content-type": "text/event-stream" } },
						);
					return Response.json(
						{
							error: {
								message: `fixture HTTP ${status}`,
								type: "invalid_request_error",
								code: status === 401 ? "invalid_api_key" : "fixture_failure",
							},
						},
						{ status: status === "retry" ? 503 : status },
					);
				},
			});
			const config = join(fixture.home, "codex-home");
			await mkdir(config);
			await writeFile(
				join(config, "config.toml"),
				`model_provider="local"\nmodel="test-model"\n[projects.${JSON.stringify(fixture.home)}]\ntrust_level="trusted"\n[model_providers.local]\nname="local"\nbase_url="http://127.0.0.1:${endpoint.port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=${status === "retry" ? 5 : 0}\nstream_idle_timeout_ms=1000\n`,
			);
			const hookProof = join(fixture.home, "native-hook.txt");
			if (status === 401) {
				await writeFile(
					join(config, "hooks.json"),
					JSON.stringify({
						hooks: { SessionStart: [{ hooks: [{ type: "command", command: `printf hook >> '${hookProof}'` }] }] },
					}),
				);
			}
			const configBefore = await readFile(join(config, "config.toml"), "utf8");
			const host = new HarnessHost({
				runtime: fixture.client,
				directory: join(fixture.home, "attempts"),
				bun: process.execPath,
				observationTimeoutMs: 30000,
				env: { ...process.env, CODEX_HOME: config, CODEX_THREAD_ID: undefined },
			});
			try {
				await host.start({
					id: "fault",
					harness: "codex",
					cwd: fixture.home,
					model: "test-model",
					prompt: "Reply hello.",
				});
				if (status === "retry") {
					let events = "";
					for await (const event of host.subscribe("fault", 0, AbortSignal.timeout(15000), "events")) {
						if (event.type === "output") events += Buffer.from(event.data, "base64").toString();
						if (events.includes('"willRetry":true')) break;
					}
					expect(events).toContain('"willRetry":true');
					expect((await host.status("fault")).activity?.state).toBe("working");
					expect((await host.interrupt("fault")).agent?.outcome).toBe("interrupted");
					return;
				}
				const failed = await host.waitFor("fault", (state) => state.agent?.error != null);
				expect(requests).toBeGreaterThan(0);
				expect(failed.activity?.state).toBe("idle");
				expect(failed.agent?.error).toBeTruthy();
				expect(failed.agent?.sessionId).toBeTruthy();
				if (status === 401) {
					expect(await readFile(hookProof, "utf8")).toContain("hook");
					expect(await readFile(join(config, "config.toml"), "utf8")).toBe(configBefore);
				}
				const events = await readFile(join(fixture.home, "sessions/fault.events.json.bytes"), "utf8");
				expect(events).toContain('"willRetry":false');
				console.log(`Codex HTTP ${status}: ${requests} requests; ${failed.agent?.error}; evidence ${fixture.home}`);
			} finally {
				await host.stop("fault");
				const exit = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
				await fixture.client.shutdown();
				await exit;
				endpoint.stop(true);
			}
		},
		45000,
	);

test("Codex terminal exit stops its engine and retained runtime attempt", async () => {
	const fixture = await harnessHostFixture();
	const host = new HarnessHost({
		runtime: fixture.client,
		directory: join(fixture.home, "attempts"),
		bun: process.execPath,
		observationTimeoutMs: 10000,
		env: { ...process.env, PATH: join(fixture.home, "bin"), HARNESS_FIXTURE_BEHAVIOR: "terminal-exit" },
	});
	try {
		await host.start({ id: "closed", harness: "codex", cwd: fixture.home, prompt: "hello" });
		const exited = await host.waitFor("closed", (state) => state.status === "exited");
		expect(exited.controllable).toBe(false);
		const pid = Number((await readFile(join(fixture.home, "bin/codex-engines.txt"), "utf8")).trim());
		expect(() => process.kill(pid, 0)).toThrow();
	} finally {
		const exit = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
		await fixture.client.shutdown();
		await exit;
		await rm(fixture.home, { recursive: true, force: true });
	}
});

for (const signal of ["SIGKILL", "SIGUSR1"] as const)
	test(`Codex ${signal === "SIGKILL" ? "engine crash" : "event connection loss"} cannot leave a live unobserved agent`, async () => {
		const fixture = await harnessHostFixture();
		try {
			await fixture.host.start({ id: "lost", harness: "codex", cwd: fixture.home, prompt: "hello" });
			const pid = Number((await readFile(join(fixture.home, "bin/codex-engines.txt"), "utf8")).trim());
			process.kill(pid, signal);
			const failed = await fixture.host.waitFor("lost", (state) => state.agent?.error != null);
			expect(failed.agent?.error).toMatch(/Codex (engine exited|app-server connection closed)/);
			const stopped = await fixture.host.stop("lost");
			expect(stopped.status).toBe("exited");
			expect(() => process.kill(pid, 0)).toThrow();
		} finally {
			const exit = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
			await fixture.client.shutdown();
			await exit;
			await rm(fixture.home, { recursive: true, force: true });
		}
	});

test("Codex terminal spawn failure closes its engine without an exit-event deadlock", async () => {
	const fixture = await harnessHostFixture();
	const host = new HarnessHost({
		runtime: fixture.client,
		directory: join(fixture.home, "attempts"),
		bun: process.execPath,
		observationTimeoutMs: 10000,
		env: { ...process.env, PATH: join(fixture.home, "bin"), HARNESS_FIXTURE_BEHAVIOR: "terminal-spawn-error" },
	});
	try {
		await host.start({ id: "spawn-failure", harness: "codex", cwd: fixture.home, prompt: "hello" });
		let ended = false;
		for await (const event of fixture.client.subscribeSession("spawn-failure", AbortSignal.timeout(2000))) {
			if (event.type === "session" && event.session.status === "exited") {
				ended = true;
				expect(event.session.agent?.error).toContain("ENOENT");
				break;
			}
		}
		expect(ended).toBe(true);
	} finally {
		const exit = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
		await fixture.client.shutdown();
		await exit;
		await rm(fixture.home, { recursive: true, force: true });
	}
});

test("the native terminal answers user-input requests without an observer rejection", async () => {
	const fixture = await harnessHostFixture();
	const host = new HarnessHost({
		runtime: fixture.client,
		directory: join(fixture.home, "attempts"),
		bun: process.execPath,
		observationTimeoutMs: 3000,
		env: { ...process.env, PATH: join(fixture.home, "bin"), HARNESS_FIXTURE_BEHAVIOR: "question" },
	});
	try {
		await host.start({ id: "question", harness: "codex", cwd: fixture.home, prompt: "hello" });
		for await (const event of host.subscribe("question", 0, AbortSignal.timeout(3000))) {
			if (event.type === "output" && Buffer.from(event.data, "base64").toString().includes("fixture response")) break;
		}
		await host.send("question", "Ask a question", "ask");
		for await (const event of host.subscribe("question", 0, AbortSignal.timeout(3000))) {
			if (event.type === "output" && Buffer.from(event.data, "base64").toString().includes("question shown")) break;
		}
		expect((await host.status("question")).agent?.error).toBeNull();
		await host.input("question", "\r");
		const finished = await host.waitFor(
			"question",
			(state) => state.agent?.turnId === "turn-2" && state.activity?.state === "idle",
		);
		expect(finished.agent?.error).toBeNull();
		expect(finished.agent?.outcome).toBe("completed");
	} finally {
		const exit = new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
		await fixture.client.shutdown();
		await exit;
		await rm(fixture.home, { recursive: true, force: true });
	}
});
