import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { pauseRestartFixture } from "../../services/agentRuns/pauseRestartFixture";
import { HarnessHost } from "./harnessHost.ts";

test("delivers a full observer prompt through the existing runtime after session identity", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-observer-launch-"));
	try {
		const prompt = "supplied context ".repeat(30000);
		const id = crypto.randomUUID();
		await mkdir(join(directory, id));
		await writeFile(
			join(directory, id, "launch.json"),
			JSON.stringify({
				fingerprint: "fixture",
				harness: "claude",
				textOnly: true,
				sessionId: "saved",
				prompt,
				spec: { id, command: "claude", args: [], cwd: directory, env: {} },
			}),
		);
		const state = {
			...pauseRestartFixture(id, new Date()),
			status: "running" as const,
			agent: {
				sessionId: "saved",
				model: "anthropic/claude-sonnet-5.5",
				turnId: null,
				tool: null,
				lastTool: null,
				lastMessage: null,
				error: null,
				outcome: null,
			},
		};
		const deliveries: string[] = [];
		const runtime = {
			list: async () => ({ sessions: [], complete: true }),
			start: async (spec: { args: string[] }) => {
				expect(spec.args).not.toContain(prompt);
			},
			inspect: async () => state,
			deliver: async (attemptId: string, messageId: string, data: string) => {
				expect(attemptId).toBe(id);
				expect(messageId).toBe(id);
				deliveries.push(Buffer.from(data, "base64").toString());
				state.acknowledgedMessageIds.push(id);
				return { status: "acknowledged" };
			},
			subscribeSession: async function* () {
				yield { type: "session", session: state };
			},
		} as unknown as RuntimeClient;
		const host = new HarnessHost({ runtime, directory, agentsDirectory: directory, env: {}, bun: process.execPath });
		await host.startPrepared(id);
		expect(deliveries).toEqual([`\u001b[200~trellis-message:${id}\n${prompt}\u001b[201~\r`]);
		await host.startPrepared(id);
		expect(deliveries).toHaveLength(1);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
