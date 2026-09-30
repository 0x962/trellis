import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
	RuntimeCaptureIdentity,
	RuntimeCaptureRequest,
	RuntimeLaunchCaptureIdentity,
} from "@trellis/runtime-protocol";
import type { SessionRecord } from "../sessionRecord.ts";
import type { CaptureSnapshotDependencies } from "./captureSnapshot.ts";

const execute = promisify(execFile);

export const git = async (directory: string, ...args: string[]) => execute("git", ["-C", directory, ...args]);

export const repository = async (home: string, name: string) => {
	const directory = join(home, name);
	await mkdir(directory);
	await git(directory, "init");
	await git(directory, "config", "user.email", "capture@example.com");
	await git(directory, "config", "user.name", "Capture Fixture");
	await writeFile(join(directory, "tracked.txt"), "tracked\n");
	await git(directory, "add", "tracked.txt");
	await git(directory, "commit", "-m", "fixture");
	return directory;
};

export const launchIdentity = async (
	home: string,
	attemptId: string,
	workspace: string,
): Promise<RuntimeLaunchCaptureIdentity> => {
	const profile = join(home, "profiles", attemptId);
	const conversation = join(profile, "projects", "fixture");
	await mkdir(join(conversation, "empty"), { recursive: true });
	await writeFile(join(conversation, "session.jsonl"), `${attemptId}\n`);
	return {
		harness: "claude",
		accountId: `account-${attemptId}`,
		profileId: `00000000-0000-4000-8000-${attemptId.padStart(12, "0")}`,
		agentRunId: `run-${attemptId}`,
		attemptId,
		providerScopePaths: [profile, conversation],
		providerRoots: [
			{
				contentKind: "conversation-directory",
				sourceKind: "account-profile",
				path: conversation,
				externalLinks: [],
			},
		],
	};
};

export const captureIdentity = (launch: RuntimeLaunchCaptureIdentity): RuntimeCaptureIdentity => ({
	harness: launch.harness,
	accountId: launch.accountId,
	profileId: launch.profileId,
	agentRunId: launch.agentRunId,
	attemptId: launch.attemptId,
	providerSessionId: null,
});

export const captureRecord = (
	workspace: string,
	launch: RuntimeLaunchCaptureIdentity,
	providerSessionId = `session-${launch.attemptId}`,
): SessionRecord =>
	({
		session: {
			id: launch.attemptId,
			daemonId: "fixture",
			pid: null,
			mode: "stdio",
			status: "exited",
			startedAt: "2026-09-29T10:00:00.000Z",
			endedAt: "2026-09-29T10:01:00.000Z",
			exitCode: 0,
			error: null,
		},
		launch: { command: "fixture", args: [], cwd: workspace, capture: launch },
		observations: { agent: { sessionId: providerSessionId } },
	}) as SessionRecord;

export const captureRequest = (launches: RuntimeLaunchCaptureIdentity[]): RuntimeCaptureRequest => ({
	captureId: "capture-1",
	snapshotId: "snapshot-1",
	hostId: "host-1",
	dataHomeId: "data-home-1",
	generation: 4,
	blockId: "block-1",
	identities: launches.map(captureIdentity),
});

export const captureDependencies: CaptureSnapshotDependencies = {
	inspect: () => ({ status: "exited" }) as ReturnType<CaptureSnapshotDependencies["inspect"]>,
	processes: () => [],
	records: () => [],
};

export const captureBytes = async (source: AsyncIterable<Uint8Array>) => {
	const chunks: Uint8Array[] = [];
	for await (const chunk of source) chunks.push(chunk);
	return Buffer.concat(chunks).toString();
};
