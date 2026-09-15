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
type Observed = Pick<RuntimeProcessStatus, "id" | "status" | "controllable" | "process" | "agent" | "launch">;
type Descriptor = { harness: RestartSession["harness"] | "custom"; spec: LaunchSpec; fingerprint: string };

export const captureRestartPlan = async (home: string, source: PinnedRelease, target: PinnedRelease) => {
	if (await readRestartPlan(home)) return;
	const ownerPath = join(home, "runtime/manifest.json");
	if (!existsSync(ownerPath)) {
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
			`const { RuntimeClient } = await import(${JSON.stringify(client)}); const sessions = await new RuntimeClient(${JSON.stringify(socket)}).list(); console.log(JSON.stringify(sessions.map(({id,status,controllable,process,agent,launch}) => ({id,status,controllable,process,agent,launch}))));`,
		],
		{ timeout: 60000 },
	);
	const sessions: RestartSession[] = [];
	for (const observed of JSON.parse(stdout) as Observed[]) {
		if (observed.status === "exited") continue;
		if (observed.status !== "running" || !observed.controllable || !observed.process)
			throw new Error(`Cannot confirm ownership of terminal ${observed.id}. Inspect its process before the update.`);
		const path = join(home, "harness-attempts", observed.id, "launch.json");
		if (!existsSync(path)) {
			if (observed.agent) throw new Error(`Agent terminal ${observed.id} has no saved launch descriptor.`);
			continue;
		}
		const descriptor = JSON.parse(await readFile(path, "utf8")) as Descriptor;
		const runId = descriptor.spec.env?.TRELLIS_RUN_ID;
		if (!runId) throw new Error(`Terminal ${observed.id} has no saved agent assignment.`);
		if (descriptor.harness === "custom")
			throw new Error(`Custom agent ${runId} cannot resume its session. Stop it before the update.`);
		if (!observed.agent?.sessionId)
			throw new Error(`Agent ${runId} has no confirmed provider session. Wait for it to start before the update.`);
		sessions.push({
			runId,
			previousAttemptId: observed.id,
			providerSessionId: observed.agent.sessionId,
			harness: descriptor.harness,
			model: observed.agent.model ?? JSON.parse(descriptor.fingerprint)[3] ?? undefined,
			workspace: descriptor.spec.cwd,
			processIdentity: observed.process.identity,
			attempt: { id: randomUUID(), token: randomBytes(32).toString("hex") },
		});
	}
	await writeRestartPlan(home, {
		version: 1,
		id: randomUUID(),
		sourceReleaseId: source.manifest.id,
		targetReleaseId: target.manifest.id,
		createdAt: new Date().toISOString(),
		sessions,
	});
};
