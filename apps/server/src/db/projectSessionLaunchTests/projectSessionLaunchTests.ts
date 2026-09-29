import { expect, spyOn, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SessionCreateInputSchema } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { HarnessHost } from "../../agents/harnessHost/harnessHost.ts";
import * as connection from "../../agents/native/connection.ts";
import { startNative } from "../../services/agentRuns/nativeStart.ts";
import { pauseRestartFixture } from "../../services/agentRuns/pauseRestartFixture";
import { getRun } from "../../services/agentRuns/queries.ts";
import { prepareCreate } from "../../services/sessions/create.ts";
import { getSession, listSessions } from "../../services/sessions/queries.ts";
import { prepareDelete } from "../../services/sessions/remove.ts";
import { accepted } from "../../services/sessions/sessions.ts";
import { prepareStart } from "../../services/sessions/start.ts";
import { ctx, db, drainBackground, harness, home, launches, start } from "../projectSessionsFixture.ts";

async function withRuntime(
	observe: () => RuntimeProcessStatus[],
	action: (runtime: RuntimeClient, reads: Array<string[] | undefined>) => Promise<void>,
) {
	const runtime = connection.nativeClient(home);
	const reads: Array<string[] | undefined> = [];
	const list = spyOn(runtime, "list").mockImplementation(async (input = {}) => {
		reads.push(input.ids);
		return { complete: true, sessions: observe() };
	});
	const ensure = spyOn(connection, "ensureNativeRuntime").mockResolvedValue(runtime);
	try {
		await action(runtime, reads);
	} finally {
		ensure.mockRestore();
		list.mockRestore();
	}
}

export function projectSessionLaunchTests() {
	test("file-only prompts work and invalid launch choices fail before allocation", async () => {
		expect(SessionCreateInputSchema.safeParse({ prompt: "", files: [new File(["hello"], "note.txt")] }).success).toBe(
			true,
		);
		expect(SessionCreateInputSchema.safeParse({ prompt: "" }).success).toBe(false);
		expect(
			SessionCreateInputSchema.safeParse({
				prompt: "hello",
				harness: { preset: "claude", model: "openai/gpt-5.6-sol" },
			}).success,
		).toBe(false);
		const count = (await db.transaction(listSessions)).length;
		await expect(prepareCreate(ctx, { name: " ", prompt: "Read", harness }, start)).rejects.toThrow("Enter a name.");
		expect((await db.transaction(listSessions)).length).toBe(count);
		const bytes = Uint8Array.from({ length: 1025 }, (_, index) => index % 251);
		const answer = await prepareCreate(
			ctx,
			{ name: "attachment-only", prompt: "", harness, files: [new File([bytes], "large.bin")] },
			start,
		);
		await drainBackground();
		const session = await db.transaction((tx) => getSession(tx, answer.id));
		const launch = launches.find((entry) => entry.run.id === session.runId)!;
		const attachment = JSON.parse(launch.run.instruction.split("\n").at(-1)!);
		expect(attachment).toStartWith(join(home, "agents", session.runId, "attachments"));
		expect(new Uint8Array(await readFile(attachment))).toEqual(bytes);
		expect((await db.transaction(listSessions)).length).toBe(count + 1);
	});

	test("unconfirmed processes block resume and failed stops retain the workspace", async () => {
		const created = await prepareCreate(ctx, { name: "unconfirmed", prompt: "Inspect", harness }, start);
		await drainBackground();
		const session = await db.transaction((tx) => getSession(tx, created.id));
		const before = await db.transaction((tx) => getRun(tx, session.runId));
		const count = launches.length;
		const recovered: string[] = [];
		const process = async () => ({ status: "unknown", controllable: false }) as RuntimeProcessStatus;
		await expect(
			prepareStart(
				ctx,
				{ id: session.id },
				{
					process,
					start,
					preset: async () => "codex",
					recover: async (_ctx, id) => {
						recovered.push(id);
						return process();
					},
				},
			),
		).rejects.toThrow("Trellis could not recover this agent. Try Resume again.");
		expect(recovered).toEqual([before.terminalId]);
		expect(launches).toHaveLength(count);
		expect(await db.transaction((tx) => getRun(tx, session.runId))).toEqual(before);
		await expect(
			prepareDelete(
				ctx,
				{ id: session.id },
				{
					process,
					stop: async () => {
						throw new Error("Stop unconfirmed");
					},
				},
			),
		).rejects.toThrow("Stop unconfirmed");
		expect((await db.transaction((tx) => getSession(tx, session.id))).id).toBe(session.id);
		expect(await db.transaction((tx) => getRun(tx, session.runId))).toEqual(before);
		expect((await stat(session.directory)).isDirectory()).toBe(true);
	});

	test("start answers before the harness confirms, and the session reads starting", async () => {
		const created = await prepareCreate(ctx, { name: "held-start", prompt: "Inspect", harness }, start);
		await drainBackground();
		const session = await db.transaction((tx) => getSession(tx, created.id));
		const before = await db.transaction((tx) => getRun(tx, session.runId));
		const entered = Promise.withResolvers<void>();
		const confirm = Promise.withResolvers<{ id: string }>();
		const held: typeof start = async (_background, input) => {
			launches.push(input);
			entered.resolve();
			return confirm.promise;
		};
		let observed: RuntimeProcessStatus[] = [];
		await withRuntime(
			() => observed,
			async (_runtime, reads) => {
				try {
					const answer = await prepareStart(
						ctx,
						{ id: session.id },
						{
							process: async () => pauseRestartFixture(before.terminalId!, ctx.now()),
							start: held,
							preset: async () => "codex",
						},
					);
					expect(answer.id).toBe(session.id);
					await entered.promise;
					const pending = await accepted(ctx, { id: session.id });
					expect(pending.run.state).toBe("starting");
					expect(pending.run.terminalId).not.toBe(before.terminalId);
					expect(reads).toEqual([]);
					const attemptId = pending.run.terminalId!;
					observed = [
						{
							...pauseRestartFixture(attemptId, ctx.now()),
							status: "running",
							controllable: true,
							endedAt: null,
							exitCode: null,
						},
					];
					confirm.resolve({ id: session.runId });
					await drainBackground();
					const active = await accepted(ctx, { id: session.id });
					expect(active.run.state).toBe("running");
					expect(active.run.terminalId).toBe(attemptId);
					expect(reads).toEqual([[attemptId]]);
				} finally {
					confirm.resolve({ id: session.runId });
					await drainBackground();
				}
			},
		);
	});

	test("a start that never confirms leaves the reason on the session", async () => {
		const reason =
			"Harness attempt attempt did not reach the awaited state within 300000 ms. Inspect its terminal and provider events. Stop the attempt before you send again.";
		const prepare = spyOn(HarnessHost.prototype, "prepare").mockImplementation(async (input) => ({
			fingerprint: "test",
			prompt: input.prompt,
			spec: { id: input.id, command: "codex", args: [], cwd: input.cwd, env: {}, mode: "pty" as const },
			harness: "codex" as const,
		}));
		const launch = spyOn(HarnessHost.prototype, "start").mockImplementation(async () => {
			throw Object.assign(new Error(reason), { code: "HARNESS_OBSERVATION_TIMEOUT" });
		});
		try {
			await withRuntime(
				() => [],
				async (runtime, reads) => {
					const answer = await prepareCreate(
						ctx,
						{ name: "failed-launch", prompt: "Inspect", harness },
						(background, input) =>
							startNative(background, input, {
								workspace: async () => input.config.directory,
								runtime: async () => runtime,
								guide: async () => "Inspect",
								env: {},
							}),
					);
					await expect(drainBackground()).rejects.toThrow(reason);
					expect(prepare).toHaveBeenCalledTimes(1);
					expect(launch).toHaveBeenCalledTimes(1);
					const session = await db.transaction((tx) => getSession(tx, answer.id));
					const run = await db.transaction((tx) => getRun(tx, session.runId));
					expect(run.error).toBe(reason);
					expect(run.closedAt).toBeNull();
					expect(run.terminalId).toBe(launch.mock.calls[0]![0].id);
					const detail = await accepted(ctx, { id: session.id });
					expect(detail.run.state).toBe("interrupted");
					expect(detail.run.error).toBe(reason);
					expect(detail.run.assigned).toBe(true);
					expect(reads).toEqual([[run.terminalId]]);
				},
			);
		} finally {
			prepare.mockRestore();
			launch.mockRestore();
		}
	});
}
