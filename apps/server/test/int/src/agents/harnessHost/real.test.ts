import { beforeAll, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RuntimeHarnessObservation, RuntimeStream } from "@trellis/runtime-protocol";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../../../test/originDir.ts";
import { buildRuntime } from "../../../../../../runtime/test/runtimeBuild.ts";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { waitForNativeHarnessFile } from "../../../../nativeHarnessFile.ts";

const enabled = process.env.TRELLIS_REAL_HARNESS_ACCEPTANCE === "1";
const repo = resolve(originDir(import.meta.dir), "../../../../..");
beforeAll(async () => {
	if (enabled) await buildRuntime();
});

async function readAll(host: HarnessHost, id: string, stream: RuntimeStream) {
	const chunks: Buffer[] = [];
	let offset = 0;
	while (true) {
		const output = await host.output(id, offset, stream);
		chunks.push(Buffer.from(output.data, "base64"));
		if (output.nextOffset === offset) return Buffer.concat(chunks).toString();
		offset = output.nextOffset;
	}
}

for (const harness of ["claude", "codex", "pi", "opencode", "muse"] as const) {
	test.skipIf(!enabled)(
		`${harness} host accepts real native receipts, tools, interrupt, follow-up, stop, and exact resume`,
		async () => {
			const authHome = process.env.TRELLIS_NATIVE_ACCEPTANCE_HOME;
			if (!authHome) throw new Error("Set TRELLIS_NATIVE_ACCEPTANCE_HOME to the authenticated provider home.");
			const model = process.env[`TRELLIS_NATIVE_${harness.toUpperCase()}_MODEL`];
			if (!model) throw new Error(`Set TRELLIS_NATIVE_${harness.toUpperCase()}_MODEL to the effective model ID.`);
			const expectedModel = harness === "pi" ? model.slice(model.indexOf("/") + 1) : model;
			const executable = harness === "opencode" ? process.env.TRELLIS_NATIVE_OPENCODE_BIN : undefined;
			const home = await mkdtemp(`/tmp/trl-real-host-${harness}-`);
			console.log(`${harness} real host evidence: ${home}`);
			const runtime = new RuntimeClient(join(home, "runtime.sock"));
			const daemon = spawn(
				process.env.TRELLIS_RUNTIME_NODE ?? "node",
				[resolve(repo, "apps/runtime/dist/index.js"), "--home", home],
				{ stdio: ["ignore", "pipe", "inherit"] },
			);
			const exited = new Promise<void>((done) => daemon.once("exit", () => done()));
			await new Promise<void>((done, reject) => {
				daemon.once("error", reject);
				daemon.stdout!.once("data", () => done());
			});
			const host = new HarnessHost({
				runtime,
				directory: join(home, "attempts"),
				bun: process.execPath,
				observationTimeoutMs: 90000,
				env: {
					...process.env,
					HOME: authHome,
					PATH: executable ? `${dirname(executable)}:${process.env.PATH}` : process.env.PATH,
					XDG_CONFIG_HOME: join(authHome, ".config"),
					XDG_DATA_HOME: join(authHome, ".local/share"),
					XDG_CACHE_HOME: join(authHome, ".cache"),
					XDG_STATE_HOME: join(authHome, ".local/state"),
					PI_OFFLINE: "1",
					CLAUDECODE: undefined,
					CLAUDE_SESSION_ID: undefined,
					CODEX_THREAD_ID: undefined,
				},
			});
			const cwd = harness === "codex" ? repo : harness === "claude" || harness === "muse" ? join(home, "repo") : home;
			if (harness === "claude" || harness === "muse") {
				await mkdir(cwd);
				const git = spawnSync("git", ["init", "--quiet", cwd], { env: process.env });
				if (git.status !== 0) throw new Error(git.stderr.toString());
			}
			if (harness === "claude") {
				const stateFile = join(process.env.CLAUDE_CONFIG_DIR || authHome, ".claude.json");
				const state = JSON.parse(await readFile(stateFile, "utf8"));
				expect(state.projects?.[await realpath(cwd)]?.hasTrustDialogAccepted).not.toBe(true);
			}
			const id = `initial-${crypto.randomUUID()}`;
			const resumedId = `resumed-${crypto.randomUUID()}`;
			const marker = `HOST_${crypto.randomUUID().replaceAll("-", "")}`;
			const proof = join(home, "proof.txt");
			const activePath = join(home, "tool-active");
			try {
				const started = await host.start({
					id,
					harness,
					cwd,
					model,
					prompt: `Remember ${marker}. Use the file edit tool to write ${proof} with exactly ${marker}. Use the shell tool to run /bin/pwd. Then reply exactly ${marker}. Modify no other files.`,
				});
				expect(started.process.status).toBe("running");
				expect(started.process.controllable).toBe(true);
				expect(started.process.acknowledgedMessageIds).toContain(id);
				expect(started.process.agent?.sessionId).toBeTruthy();
				expect(started.process.agent?.model).toBe(expectedModel);
				const sessionId = started.process.agent!.sessionId!;
				const complete = await host.waitFor(
					id,
					(state) => state.activity?.state === "idle" && state.result?.text.includes(marker) === true,
				);
				expect((await readFile(proof, "utf8")).trim()).toBe(marker);
				expect(complete.elapsedMs).toBeGreaterThan(0);
				expect((await host.list({ status: "running", activity: "idle" })).map((state) => state.id)).toEqual([id]);
				const initialEvents = (await readAll(host, id, "events"))
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line) as RuntimeHarnessObservation);
				expect(
					initialEvents.some(
						({ event }) => event.kind === "prompt" && event.prompt?.startsWith(`trellis-message:${id}\n`),
					),
				).toBe(true);
				expect(initialEvents.some(({ event }) => event.kind === "tool-start")).toBe(true);
				expect(initialEvents.some(({ event }) => event.kind === "tool-end")).toBe(true);
				if (harness === "codex") {
					await host.send(
						id,
						"Use the native web search tool to search for OpenAI Codex app-server documentation. Then reply exactly HOST_WEBSEARCH_DONE.",
						`web-${crypto.randomUUID()}`,
					);
					await host.waitFor(
						id,
						(state) => state.activity?.state === "idle" && state.result?.text.includes("HOST_WEBSEARCH_DONE") === true,
					);
					const events = (await readAll(host, id, "events"))
						.trim()
						.split("\n")
						.map((line) => JSON.parse(line) as RuntimeHarnessObservation);
					expect(events.some(({ event }) => event.kind === "tool-start" && event.tool?.name === "webSearch")).toBe(
						true,
					);
					expect(events.some(({ event }) => event.kind === "tool-end" && event.tool?.name === "webSearch")).toBe(true);
				}
				await host.resize(id, 132, 40);

				const messageId = `sleep-${crypto.randomUUID()}`;
				const active = waitForNativeHarnessFile(activePath);
				const sent = await host.send(
					id,
					`Use the shell tool to run this exact command in the foreground: printf active > ${activePath}; /bin/sleep 60. Do not run it in the background. Then reply SLEEP_DONE.`,
					messageId,
				);
				expect(sent.acknowledgedMessageIds).toContain(messageId);
				await active;
				expect((await host.status(id)).activity?.state).toBe("working");
				const interrupted = await host.interrupt(id);
				expect(interrupted.activity?.state).toBe("idle");
				expect(interrupted.agent?.outcome).toBe("interrupted");
				expect(interrupted.pid).toBe(started.process.pid);

				const nextMessageId = `next-${crypto.randomUUID()}`;
				const outputOffset = (await host.output(id)).nextOffset;
				const observed = (async () => {
					let outputBytes = 0;
					for await (const event of host.subscribe(id, outputOffset, AbortSignal.timeout(90000))) {
						if (event.type === "output") outputBytes += Buffer.from(event.data, "base64").length;
						if (event.type === "session" && event.session.result?.text.includes("HOST_AFTER_INTERRUPT"))
							return { state: event.session, outputBytes };
					}
					throw new Error("The host stream closed before the next response.");
				})();
				const [{ state: next, outputBytes }] = await Promise.all([
					observed,
					host.send(id, "Reply exactly HOST_AFTER_INTERRUPT. Do not use tools.", nextMessageId),
				]);
				expect(outputBytes).toBeGreaterThan(0);
				expect(next.acknowledgedMessageIds).toContain(nextMessageId);
				expect(next.agent?.sessionId).toBe(sessionId);
				expect(next.elapsedMs).toBeGreaterThan(complete.elapsedMs!);
				await host.stop(id);
				expect((await host.status(id)).status).toBe("exited");
				expect(await host.list({ status: "running" })).toEqual([]);
				expect((await host.list({ status: "exited" })).map((state) => state.id)).toEqual([id]);

				const resumed = await host.resume({
					id: resumedId,
					harness,
					cwd,
					model,
					sessionId,
					prompt:
						"What exact HOST_ marker did you remember earlier in this conversation? Reply with that marker only. Do not use tools.",
				});
				expect(resumed.process.agent?.sessionId).toBe(sessionId);
				expect(resumed.process.acknowledgedMessageIds).toContain(resumedId);
				await host.waitFor(
					resumedId,
					(state) => state.activity?.state === "idle" && state.result?.text.includes(marker) === true,
				);
				await host.stop(resumedId);
				expect((await host.status(resumedId)).status).toBe("exited");
				const terminal = await readAll(host, id, "stdout");
				expect(terminal.length).toBeGreaterThan(0);
				await writeFile(join(home, "terminal.txt"), terminal);
				await writeFile(join(home, "events.jsonl"), await readAll(host, id, "events"));
				await writeFile(join(home, "metadata.json"), JSON.stringify({ harness, model, sessionId, id, resumedId }));
			} finally {
				await runtime.shutdown();
				await exited;
			}
		},
		300000,
	);
}
