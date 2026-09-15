import { expect, test } from "bun:test";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	interruptOpenCode,
	parseOpenCodeEvent,
	prepareOpenCode,
	sendOpenCode,
} from "../../../../../src/agents/harnesses/opencode/index.ts";
import { createNativeHarnessAcceptance } from "../../../../nativeHarnessAcceptance.ts";

test.skipIf(process.env.TRELLIS_REAL_HARNESS_ACCEPTANCE !== "1")(
	"OpenCode native TUI accepts tools, interrupt, follow-up and exact session resume",
	async () => {
		const home = process.env.TRELLIS_NATIVE_ACCEPTANCE_HOME;
		const model = process.env.TRELLIS_NATIVE_OPENCODE_MODEL;
		if (!home || !model)
			throw new Error("Set TRELLIS_NATIVE_ACCEPTANCE_HOME and TRELLIS_NATIVE_OPENCODE_MODEL for this test.");
		const fixture = await createNativeHarnessAcceptance({
			name: "opencode",
			parse: parseOpenCodeEvent,
			env: {
				HOME: home,
				XDG_CONFIG_HOME: join(home, ".config"),
				XDG_DATA_HOME: join(home, ".local/share"),
				XDG_CACHE_HOME: join(home, ".cache"),
				XDG_STATE_HOME: join(home, ".local/state"),
			},
		});
		const base = {
			cwd: fixture.directory,
			configDirectory: join(fixture.directory, "config"),
			model,
			hookCommand: fixture.hookCommand,
		};
		let launchEnv: Record<string, string>;
		const start = async (input: Parameters<typeof prepareOpenCode>[0]) => {
			const launch = await prepareOpenCode(input);
			launchEnv = launch.env;
			if (process.env.TRELLIS_NATIVE_OPENCODE_BIN) launch.executable = process.env.TRELLIS_NATIVE_OPENCODE_BIN;
			const after = fixture.events.length;
			const started = await fixture.start(launch, fixture.directory);
			if (input.resume) {
				await fixture.waitFor((event) => event.kind === "session" && event.sessionId === input.sessionId, { after });
				await sendOpenCode(
					launch.env.TRELLIS_OPENCODE_CONTROL_SOCKET!,
					launch.env.TRELLIS_OPENCODE_CONTROL_TOKEN!,
					input.sessionId,
					input.prompt,
				);
			}
			return started;
		};
		const marker = `TRELLIS_OPENCODE_${crypto.randomUUID()}`;
		const initial = `Remember ${marker} for this conversation. Write proof.txt containing exactly ${marker}. Use the shell tool to run pwd. Reply exactly ${marker}.`;
		let watcher: ReturnType<typeof watch> | undefined;
		try {
			const process = await start({ ...base, resume: false, prompt: initial });
			expect(process.pid).toBeGreaterThan(0);
			const received = await fixture.waitFor((event) => event.kind === "prompt" && event.prompt === initial);
			const sessionId = received.sessionId!;
			expect(sessionId).toStartWith("ses_");
			await fixture.waitFor((event) => event.kind === "session" && event.model === model);
			await fixture.waitFor((event) => event.kind === "tool-start");
			await fixture.waitFor((event) => event.kind === "tool-end");
			await fixture.waitFor((event) => event.kind === "idle" && event.result?.includes(marker) === true);
			expect((await readFile(join(fixture.directory, "proof.txt"), "utf8")).trim()).toBe(marker);
			expect(fixture.output.length).toBeGreaterThan(0);
			const after = fixture.events.length;
			const toolStarted = Promise.withResolvers<void>();
			watcher = watch(fixture.directory, (_event, filename) => {
				if (filename === "sleep-started") toolStarted.resolve();
			});
			await sendOpenCode(
				launchEnv!.TRELLIS_OPENCODE_CONTROL_SOCKET!,
				launchEnv!.TRELLIS_OPENCODE_CONTROL_TOKEN!,
				sessionId,
				"Use the shell tool to run: printf started > sleep-started; sleep 30. Run this in the foreground.",
			);
			const active = await fixture.waitFor((event) => event.kind === "tool-start", { after });
			await toolStarted.promise;
			watcher.close();
			watcher = undefined;
			await interruptOpenCode(
				launchEnv!.TRELLIS_OPENCODE_CONTROL_SOCKET!,
				launchEnv!.TRELLIS_OPENCODE_CONTROL_TOKEN!,
				sessionId,
				active.turnId!,
			);
			const interrupted = await fixture.waitFor((event) => event.kind === "idle" && event.outcome === "interrupted", {
				after,
			});
			expect(interrupted.sessionId).toBe(sessionId);
			expect(interrupted.turnId).toBe(active.turnId);
			const next = fixture.events.length;
			await sendOpenCode(
				launchEnv!.TRELLIS_OPENCODE_CONTROL_SOCKET!,
				launchEnv!.TRELLIS_OPENCODE_CONTROL_TOKEN!,
				sessionId,
				"Reply exactly AFTER_INTERRUPT.",
			);
			await fixture.waitFor((event) => event.kind === "idle" && event.result?.includes("AFTER_INTERRUPT") === true, {
				after: next,
			});
			await fixture.stop();
			const other = fixture.events.length;
			await start({ ...base, resume: false, prompt: "Reply exactly SECOND_SESSION." });
			const second = await fixture.waitFor((event) => event.kind === "prompt", { after: other });
			expect(second.sessionId).not.toBe(sessionId);
			await fixture.waitFor((event) => event.kind === "idle" && event.result?.includes("SECOND_SESSION") === true, {
				after: other,
			});
			await fixture.stop();
			const resume = fixture.events.length;
			await start({
				...base,
				resume: true,
				sessionId,
				prompt: "Reply with the exact TRELLIS_OPENCODE marker from this conversation. Do not use tools or read files.",
			});
			const resumed = await fixture.waitFor((event) => event.kind === "prompt", { after: resume });
			expect(resumed.sessionId).toBe(sessionId);
			await fixture.waitFor((event) => event.kind === "session" && event.model === model, { after: resume });
			await fixture.waitFor((event) => event.kind === "idle" && event.result?.includes(marker) === true, {
				after: resume,
			});
			await fixture.stop();
		} finally {
			watcher?.close();
			await fixture.dispose();
		}
	},
	300_000,
);
