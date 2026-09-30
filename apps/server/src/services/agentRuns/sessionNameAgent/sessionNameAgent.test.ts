import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeLaunchWriterScope, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { readRuntimeCaptureHold, withRuntimeMutationExclusion, writeRuntimeCaptureHold } from "@trellis/runtime-protocol/mutation-exclusion";
import type { HarnessDescriptor, HarnessStartInput } from "../../../agents/harnessHost/types";
import { tempDirs } from "../../../tempDir";
import type { IoCtx } from "../../support";
import { pauseRestartFixture } from "../pauseRestartFixture";
import { requestSessionName } from "./sessionNameAgent";
import { withSessionNameScope } from "./withSessionNameScope";

const temporary = tempDirs();

async function fixture(scoped = true) {
	const home = await realpath(await temporary("trellis-session-name-scope-"));
	const writerScopes: RuntimeLaunchWriterScope[] = [
		{ kind: "workspace", directory: join(home, "original-workspace") },
		{ kind: "provider", directory: join(home, "original-profile") },
		{ kind: "repository", directory: join(home, "original-common.git") },
	];
	const source: HarnessDescriptor = {
		fingerprint: "synthetic-original",
		harness: "codex",
		prompt: "Original prompt",
		spec: {
			id: "original-attempt", command: "codex", args: [], mode: "pty",
			cwd: writerScopes[0]!.directory,
			env: { CODEX_HOME: writerScopes[1]!.directory, SYNTHETIC_SETTING: "retained", TRELLIS_ACTOR: "agent:original" },
			...(scoped ? { writerScopes } : {}),
			capture: {
				harness: "codex", accountId: "original-account", profileId: "original-profile-id",
				agentRunId: "original-run", attemptId: "original-attempt",
				providerScopePaths: [writerScopes[1]!.directory], providerRoots: [],
			},
		},
	};
	await mkdir(join(home, "harness-attempts", source.spec.id), { recursive: true });
	await writeFile(join(home, "harness-attempts", source.spec.id, "launch.json"), JSON.stringify(source));
	const run = {
		harness: { preset: "codex" as const, model: "openai/gpt-5.6-sol", startCommand: "unused", resumeCommand: "unused" },
		terminalId: source.spec.id, instruction: "Original instruction", name: "Original name", ticketIdentifier: null,
	};
	return { home, source, writerScopes, run, ctx: { home, log: () => {} } as unknown as IoCtx };
}

function completed(id: string): RuntimeProcessStatus {
	return {
		...pauseRestartFixture(id, new Date("2026-09-29T00:00:00Z")),
		agent: {
			sessionId: "name-session", model: "openai/gpt-5.6-sol", turnId: null, tool: null, lastTool: null,
			lastMessage: { text: "Synthetic work name", at: "2026-09-29T00:00:00Z" }, error: null, outcome: "completed",
		},
	};
}

test.each([false, true])("holds naming scopes through cleanup when launch fails: %s", async (fail) => {
	const f = await fixture();
	let launch: HarnessStartInput | undefined;
	let contender: Promise<void> | undefined;
	let stopped = false;
	let captured = false;
	const request = requestSessionName(f.ctx, { runId: "original-run", agentResponse: "Synthetic response" }, {
		run: async () => f.run,
		host: (_home, env) => {
			expect(env).toEqual({ CODEX_HOME: f.writerScopes[1]!.directory, SYNTHETIC_SETTING: "retained" });
			return {
				async start(input) {
					launch = input;
					expect(input.id).not.toBe(f.source.spec.id);
					expect(input.capture).toBeUndefined();
					expect(input.writerScopes).toEqual([
						f.writerScopes[1]!, f.writerScopes[2]!, { kind: "workspace", directory: await realpath(input.cwd) },
					]);
					expect(input.prompt).toContain("Original instruction");
					expect(input.prompt).toContain("Synthetic response");
					expect(input.model).toBe(f.run.harness.model);
					await mkdir(join(f.home, "harness-attempts", input.id));
					contender = withRuntimeMutationExclusion(f.home, [f.writerScopes[1]!], async () => {
						captured = true;
						expect(stopped).toBe(true);
						expect(existsSync(input.cwd)).toBe(false);
						expect(existsSync(join(f.home, "harness-attempts", input.id))).toBe(false);
					});
					if (fail) throw new Error("synthetic_launch_failed");
					return { process: completed(input.id) };
				},
				async waitFor() { throw new Error("unexpected_wait"); },
				async stop(id) {
					expect(id).toBe(launch!.id);
					expect(captured).toBe(false);
					expect(existsSync(launch!.cwd)).toBe(true);
					stopped = true;
					return completed(id);
				},
			};
		},
	});
	if (fail) await expect(request).rejects.toThrow("synthetic_launch_failed");
	else expect(await request).toEqual({
		candidateName: "Synthetic work name", initialPrompt: f.run.instruction,
		protectedTerms: [f.run.name, "", f.run.harness.model],
	});
	await contender;
	expect(captured).toBe(true);
	expect(existsSync(join(f.home, "harness-attempts", f.source.spec.id, "launch.json"))).toBe(true);
});

test("historical scopes remain unknown even when readable capture metadata exists", async () => {
	const f = await fixture(false);
	let launch: HarnessStartInput | undefined;
	await requestSessionName(f.ctx, { runId: "original-run", agentResponse: "Synthetic response" }, {
		run: async () => f.run,
		host: () => ({
			async start(input) {
				launch = input;
				expect(input.writerScopes).toBeUndefined();
				expect(input.capture).toBeUndefined();
				return { process: completed(input.id) };
			},
			async waitFor() { throw new Error("unexpected_wait"); },
			async stop(id) { return completed(id); },
		}),
	});
	expect(existsSync(launch!.cwd)).toBe(false);
});

test.each([false, true])("a retained hold refuses preparation with historical scopes: %s", async (historical) => {
	const f = await fixture(!historical);
	const directory = join(f.home, "naming-workspace");
	await mkdir(directory);
	writeRuntimeCaptureHold(f.home, {
		schemaVersion: 1, captureId: "retained-capture", requestSha256: "a".repeat(64), global: false,
		attemptIds: ["captured-attempt"], createdAt: "2026-09-29T00:00:00Z",
		scopes: [{ kind: "provider", directory: historical ? join(f.home, "unknown-profile") : f.writerScopes[1]!.directory }],
		overlapScopes: [{ kind: "provider", directory: historical ? join(f.home, "unknown-profile") : f.writerScopes[1]!.directory }],
	});
	let entered = false;
	await expect(withSessionNameScope(f.home, f.source, "naming-attempt", directory, async () => {
		entered = true;
	})).rejects.toMatchObject({ code: "CAPTURE_HELD" });
	expect(entered).toBe(false);
	expect(existsSync(directory)).toBe(false);
	expect(readRuntimeCaptureHold(f.home, "retained-capture")).toBeDefined();
});
