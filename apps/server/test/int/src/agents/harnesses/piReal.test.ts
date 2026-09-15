import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePiEvent, preparePi } from "../../../../../src/agents/harnesses/pi/pi.ts";
import { createNativeHarnessAcceptance } from "../../../../nativeHarnessAcceptance.ts";

const realTest = process.env.TRELLIS_REAL_HARNESS_ACCEPTANCE === "1" ? test : test.skip;

realTest(
	"Pi native TUI accepts tools, interrupt, follow-up and exact session resume",
	async () => {
		const home = process.env.TRELLIS_NATIVE_ACCEPTANCE_HOME;
		if (!home) throw new Error("Set TRELLIS_NATIVE_ACCEPTANCE_HOME to the authenticated provider home.");
		const model = process.env.TRELLIS_NATIVE_PI_MODEL;
		if (!model) throw new Error("Set TRELLIS_NATIVE_PI_MODEL to the authenticated provider/model.");
		const effectiveModel = model.slice(model.indexOf("/") + 1);
		const fixture = await createNativeHarnessAcceptance({
			name: "pi",
			parse: (event) => parsePiEvent(event as Parameters<typeof parsePiEvent>[0]),
			env: { HOME: home, PI_OFFLINE: "1" },
		});
		const marker = `TRELLIS_PI_${randomUUID()}`;
		const initial = `Remember this private marker for this conversation: ${marker}. Use the write tool to create proof.txt containing exactly ${marker}. Use bash to run printf TRELLIS_PI_TOOL. Then reply exactly ${marker}.`;
		const options = {
			cwd: fixture.directory,
			configDirectory: join(fixture.directory, "config"),
			hookCommand: fixture.hookCommand,
			model,
		};
		try {
			const launch = await preparePi({ ...options, resume: false, prompt: initial });
			const started = await fixture.start(launch, fixture.directory);
			expect(started.pid).toBeGreaterThan(0);
			const session = await fixture.waitFor((event) => event.kind === "session");
			expect(session.sessionId).toBeTruthy();
			expect(session.model).toBe(effectiveModel);
			const sessionId = session.sessionId!;
			await fixture.waitFor((event) => event.kind === "prompt" && event.prompt === initial);
			await fixture.waitFor((event) => event.kind === "working");
			await fixture.waitFor((event) => event.kind === "tool-start" && event.tool?.name === "write");
			const tool = await fixture.waitFor((event) => event.kind === "tool-start" && event.tool?.name === "bash");
			await fixture.waitFor((event) => event.kind === "tool-end" && event.tool?.id === tool.tool?.id);
			await fixture.waitFor((event) => event.kind === "idle" && !!event.result?.includes(marker));
			expect(await readFile(join(fixture.directory, "proof.txt"), "utf8")).toBe(marker);
			expect(fixture.output).toContain("TRELLIS_PI_TOOL");

			let after = fixture.events.length;
			const activePath = join(fixture.directory, "tool-active");
			const active = Promise.withResolvers<void>();
			const watcher = watch(fixture.directory, () => {
				if (existsSync(activePath)) active.resolve();
			});
			const timer = setTimeout(() => active.reject(new Error("Pi did not start the long shell command.")), 30000);
			const interruptPrompt =
				"Use bash to run exactly: printf active > tool-active; sleep 60. After it ends, reply DONE.";
			fixture.write(`${interruptPrompt}\r`);
			try {
				await Promise.all([
					active.promise,
					fixture.waitFor((event) => event.kind === "prompt" && event.prompt === interruptPrompt, { after }),
					fixture.waitFor((event) => event.kind === "tool-start" && event.tool?.name === "bash", { after }),
				]);
			} finally {
				clearTimeout(timer);
				watcher.close();
			}
			after = fixture.events.length;
			fixture.write("\u001b");
			const interrupted = await fixture.waitFor((event) => event.kind === "idle", { after, timeoutMs: 15000 });
			expect(interrupted.sessionId).toBe(sessionId);
			expect(interrupted.result).toBeUndefined();

			after = fixture.events.length;
			fixture.write("Reply exactly TRELLIS_PI_AFTER_INTERRUPT.\r");
			await fixture.waitFor(
				(event) => event.kind === "idle" && !!event.result?.includes("TRELLIS_PI_AFTER_INTERRUPT"),
				{ after },
			);
			await fixture.stop();

			after = fixture.events.length;
			await fixture.start(
				await preparePi({ ...options, resume: false, prompt: "Reply exactly TRELLIS_PI_SECOND_SESSION." }),
				fixture.directory,
			);
			const second = await fixture.waitFor((event) => event.kind === "session", { after });
			expect(second.sessionId).not.toBe(sessionId);
			await fixture.waitFor((event) => event.kind === "idle" && !!event.result?.includes("TRELLIS_PI_SECOND_SESSION"), {
				after,
			});
			await fixture.stop();

			after = fixture.events.length;
			await fixture.start(
				await preparePi({
					...options,
					resume: true,
					sessionId,
					prompt: "What private marker did I ask you to remember? Reply with only that marker. Do not read any files.",
				}),
				fixture.directory,
			);
			const resumed = await fixture.waitFor((event) => event.kind === "session", { after });
			expect(resumed.sessionId).toBe(sessionId);
			expect(resumed.model).toBe(effectiveModel);
			await fixture.waitFor((event) => event.kind === "idle" && !!event.result?.includes(marker), { after });
			await fixture.stop();
			console.log(
				JSON.stringify({
					harness: "pi",
					sessionId,
					secondSessionId: second.sessionId,
					model: session.model,
					events: fixture.events.length,
					evidenceDirectory: fixture.directory,
				}),
			);
		} finally {
			await fixture.dispose();
		}
	},
	180000,
);
