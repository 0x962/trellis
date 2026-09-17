import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { LaunchSpec, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { type RestartSession, readRestartPlan, writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";

const execute = promisify(execFile);
type Observed = Pick<RuntimeProcessStatus, "id" | "status" | "controllable"> & {
	process: Pick<NonNullable<RuntimeProcessStatus["process"]>, "identity"> | null;
	agent: Pick<NonNullable<RuntimeProcessStatus["agent"]>, "sessionId" | "model"> | null;
};
type Descriptor = { harness: RestartSession["harness"]; spec: LaunchSpec; fingerprint: string; effort?: string };

// An agent the update cannot save gets a plan entry that is already done
// and failed, with the reason in plain words. The resume skips it, and the
// restart status shows the reason beside the agent. The update goes on.
const unsaved = (observed: Observed, descriptor: Descriptor | null, error: string): RestartSession => ({
	runId: descriptor?.spec.env?.TRELLIS_RUN_ID || observed.id,
	previousAttemptId: observed.id,
	providerSessionId: observed.agent?.sessionId ?? "",
	harness: descriptor?.harness ?? "custom",
	workspace: descriptor?.spec.cwd ?? "",
	processIdentity: observed.process?.identity ?? "",
	attempt: { id: randomUUID(), token: "" },
	done: true,
	outcome: "failed",
	error,
});

// Saves every live agent of the running runtime into `restart-plan.json`.
// A plan that an earlier update left behind is merged, not replaced: its
// entries that never resumed keep their identities, so the same process is
// never resumed twice, and its failed entries stay listed with their
// reasons. A stopped runtime leaves the previous plan untouched.
export const captureRestartPlan = async (home: string, source: PinnedRelease, target: PinnedRelease) => {
	const previous = await readRestartPlan(home);
	const ownerPath = join(home, "runtime/manifest.json");
	if (!existsSync(ownerPath)) {
		if (previous) return;
		if (existsSync(join(home, "runtime/runtime.sock"))) throw new Error("The execution service has no owner record.");
		return;
	}
	const { pid, version } = JSON.parse(await readFile(ownerPath, "utf8"));
	if (!Number.isInteger(pid) || pid <= 0 || version !== source.manifest.protocol)
		throw new Error("The previous release cannot inspect the execution service owner.");
	try {
		process.kill(pid, 0);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
		throw error;
	}
	const client = join(source.root, "packages/runtime-protocol/src/client.ts");
	const socket = join(home, "runtime/runtime.sock");
	const { stdout } = await execute(
		join(source.root, "bin/bun"),
		[
			"--eval",
			`const { RuntimeClient } = await import(${JSON.stringify(client)});
const sessions = await new RuntimeClient(${JSON.stringify(socket)}).list();
console.log(JSON.stringify(sessions.filter(({status}) => status !== "exited").map(({id,status,controllable,process,agent}) => ({
 id, status, controllable,
 process: process && {identity: process.identity},
 agent: agent && {sessionId: agent.sessionId, model: agent.model},
}))));`,
		],
		{ timeout: 60000 },
	);
	const carried = (previous?.sessions ?? []).filter((entry) => !entry.done || entry.outcome === "failed");
	// A carried entry whose previous process still runs stays resumable
	// under its saved identity. Every other carried entry that never
	// resumed loses its process when this runtime stops, so it is closed
	// as failed with its last reason.
	const alive = new Set<string>();
	const sessions: RestartSession[] = [];
	for (const observed of JSON.parse(stdout) as Observed[]) {
		if (carried.some((entry) => !entry.done && entry.previousAttemptId === observed.id)) {
			alive.add(observed.id);
			continue;
		}
		const path = join(home, "harness-attempts", observed.id, "launch.json");
		const descriptor = existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as Descriptor) : null;
		if (observed.status !== "running" || !observed.controllable || !observed.process) {
			sessions.push(
				unsaved(
					observed,
					descriptor,
					`Trellis cannot confirm which process owns terminal ${observed.id} (status ${observed.status}). It was not saved for resume.`,
				),
			);
			continue;
		}
		if (descriptor === null) {
			if (observed.agent)
				sessions.push(
					unsaved(
						observed,
						null,
						`Terminal ${observed.id} has no saved launch record. Its agent was not saved for resume.`,
					),
				);
			continue;
		}
		const runId = descriptor.spec.env?.TRELLIS_RUN_ID;
		if (!runId) {
			sessions.push(
				unsaved(
					observed,
					descriptor,
					`Terminal ${observed.id} has no saved agent assignment. It was not saved for resume.`,
				),
			);
			continue;
		}
		if (descriptor.harness === "custom") {
			sessions.push(
				unsaved(
					observed,
					descriptor,
					`Agent ${runId} runs a custom harness, which cannot resume a conversation. It was not saved for resume.`,
				),
			);
			continue;
		}
		if (!observed.agent?.sessionId) {
			sessions.push(
				unsaved(
					observed,
					descriptor,
					`Agent ${runId} has no confirmed provider session yet. It was not saved for resume.`,
				),
			);
			continue;
		}
		sessions.push({
			runId,
			previousAttemptId: observed.id,
			providerSessionId: observed.agent.sessionId,
			harness: descriptor.harness,
			model: observed.agent.model ?? JSON.parse(descriptor.fingerprint)[3] ?? undefined,
			effort: descriptor.effort,
			workspace: descriptor.spec.cwd,
			processIdentity: observed.process.identity,
			attempt: { id: randomUUID(), token: randomBytes(32).toString("hex") },
		});
	}
	if (previous && sessions.length === 0) return;
	const fresh = new Set(sessions.map((entry) => entry.runId));
	const closed = carried
		.filter((entry) => !fresh.has(entry.runId))
		.map((entry) =>
			entry.done || alive.has(entry.previousAttemptId)
				? entry
				: {
						...entry,
						done: true,
						outcome: "failed" as const,
						error: entry.error ?? "Not resumed before the next restart stopped its runtime.",
					},
		);
	await writeRestartPlan(home, {
		version: 1,
		id: randomUUID(),
		sourceReleaseId: source.manifest.id,
		targetReleaseId: target.manifest.id,
		createdAt: new Date().toISOString(),
		sessions: [...closed, ...sessions],
	});
};
