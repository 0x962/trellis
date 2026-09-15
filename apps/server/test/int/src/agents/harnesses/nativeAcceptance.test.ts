import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseClaudeEvent, prepareClaude, readClaudeStatus } from "../../../../../src/agents/harnesses/claude/index.ts";
import { parseCodexEvent, prepareCodex } from "../../../../../src/agents/harnesses/codex/index.ts";
import { createNativeHarnessAcceptance } from "../../../../nativeHarnessAcceptance.ts";
import { waitForNativeHarnessFile } from "../../../../nativeHarnessFile.ts";

const enabled = process.env.TRELLIS_REAL_HARNESS_ACCEPTANCE === "1";
const realHome = process.env.TRELLIS_NATIVE_ACCEPTANCE_HOME;
const cwd = resolve(import.meta.dir, "../../../../../../..");

for (const harness of ["claude", "codex"] as const) {
	test.skipIf(!enabled)(
		`${harness} native TUI accepts tools, follow-up, interrupt, and exact-ID resume`,
		async () => {
			if (!realHome) throw new Error("Set TRELLIS_NATIVE_ACCEPTANCE_HOME to the authenticated CLI home.");
			const model = process.env[harness === "claude" ? "TRELLIS_NATIVE_CLAUDE_MODEL" : "TRELLIS_NATIVE_CODEX_MODEL"];
			if (!model) throw new Error(`Set TRELLIS_NATIVE_${harness.toUpperCase()}_MODEL to an available model.`);
			const fixture = await createNativeHarnessAcceptance({
				name: harness,
				parse: harness === "claude" ? parseClaudeEvent : parseCodexEvent,
				env: {
					HOME: realHome,
					XDG_CONFIG_HOME: `${realHome}/.config`,
					XDG_DATA_HOME: `${realHome}/.local/share`,
					XDG_CACHE_HOME: `${realHome}/.cache`,
				},
			});
			const prepare = harness === "claude" ? prepareClaude : prepareCodex;
			const version = Bun.spawn([harness, "--version"], {
				env: { ...process.env, HOME: realHome },
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(await version.exited).toBe(0);
			await writeFile(
				join(fixture.directory, "metadata.json"),
				JSON.stringify({ harness, version: (await new Response(version.stdout).text()).trim(), model, cwd }),
			);
			const base = { cwd, model, hookCommand: fixture.hookCommand, configDirectory: fixture.directory };
			const artifact = join(fixture.directory, "artifact.txt");
			const started = join(fixture.directory, "command-started");
			const marker = `NATIVE_${crypto.randomUUID().replaceAll("-", "")}`;
			try {
				const launched = await fixture.start(
					await prepare({
						...base,
						resume: false,
						prompt: `Use the file edit tool to write ${artifact} with exactly ${marker}. Use the shell tool to run /bin/pwd. Then reply exactly ${marker}. Modify no other files.`,
					}),
					cwd,
				);
				const session = await fixture.waitFor((event) => event.kind === "session" && !!event.sessionId);
				expect(session.sessionId).toBeTruthy();
				const selectedModel = await fixture.waitFor((event) => !!event.model);
				expect(selectedModel.model).toBe(model);
				await fixture.waitFor((event) => event.kind === "tool-start");
				await fixture.waitFor((event) => event.kind === "tool-end");
				const first = await fixture.waitFor(
					(event) => event.kind === "idle" && event.result?.includes(marker) === true,
				);
				expect(first.sessionId).toBe(session.sessionId);
				expect((await readFile(artifact, "utf8")).trim()).toBe(marker);
				expect(fixture.output.length).toBeGreaterThan(0);

				const after = fixture.events.length;
				const running = waitForNativeHarnessFile(started);
				fixture.write(
					`\u001b[200~Use the shell tool to run this exact command in the foreground: printf started > ${started}; /bin/sleep 30. Do not run it in the background. Then reply SLEEP_DONE.\u001b[201~\r`,
				);
				const active = await fixture.waitFor((event) => event.kind === "tool-start", { after });
				await running;
				fixture.write("\u0003");
				if (harness === "codex") {
					const interrupted = await fixture.waitFor((event) => event.outcome === "interrupted", { after });
					expect(interrupted.turnId).toBe(active.turnId);
				} else {
					const status = await readClaudeStatus({ sessionId: session.sessionId!, pid: launched.pid }, "claude", {
						...process.env,
						HOME: realHome,
					});
					expect(status?.status).toBe("idle");
				}
				const interruptedAfter = fixture.events.length;
				fixture.write("\u001b[200~Reply exactly AFTER_INTERRUPT. Do not use tools.\u001b[201~\r");
				const continued = await fixture.waitFor(
					(event) => event.kind === "idle" && event.result?.includes("AFTER_INTERRUPT") === true,
					{ after: interruptedAfter },
				);
				expect(continued.sessionId).toBe(session.sessionId);
				await fixture.stop();

				const resumedAfter = fixture.events.length;
				await fixture.start(
					await prepare({
						...base,
						resume: true,
						sessionId: session.sessionId!,
						prompt:
							"What exact NATIVE_ marker did you return earlier in this conversation? Reply with that marker only. Do not use tools.",
					}),
					cwd,
				);
				const resumed = await fixture.waitFor(
					(event) => event.kind === "idle" && event.result?.includes(marker) === true,
					{ after: resumedAfter },
				);
				expect(resumed.sessionId).toBe(session.sessionId);
				await fixture.stop();
				console.log(`${harness} native acceptance evidence: ${fixture.directory}`);
			} finally {
				await fixture.dispose();
			}
		},
		240_000,
	);
}
