import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { claudeCapabilities } from "../nativeHarness/claudeCapabilities.ts";
import { claudeInitialize } from "../nativeHarness/claudeInitialize.ts";
import { claudeLaunchSpec } from "../nativeHarness/claudeLaunchSpec.ts";
import { sendClaude } from "../nativeHarness/sendClaude.ts";
import type { HarnessSnapshot } from "../nativeHarness/types.ts";

export const startClaude = async (
	client: RuntimeClient,
	input: {
		attemptId: string;
		sessionId: string;
		cwd: string;
		env: Record<string, string>;
		resume: boolean;
		prompt: string;
		deadlineAt?: number;
		wait: (
			predicate: (snapshot: HarnessSnapshot) => boolean,
			options: { messageId?: string; timeoutMs: number },
		) => Promise<HarnessSnapshot>;
	},
) => {
	const executable = process.env.TRELLIS_CLAUDE_BIN ?? "claude";
	const { stdout } = await promisify(execFile)(executable, ["--version"], { timeout: 10000 });
	if (stdout.trim().split(" ")[0] !== claudeCapabilities.certifiedVersion)
		throw new Error(
			`The structured adapter requires Claude ${claudeCapabilities.certifiedVersion}. Installed version: ${stdout.trim()}. Select a custom interactive harness or certify this version.`,
		);
	const timeoutMs = input.deadlineAt === undefined ? undefined : input.deadlineAt - Date.now();
	if (timeoutMs !== undefined && timeoutMs <= 0) throw new Error("The flow group deadline elapsed before launch");
	const session = await client.start(claudeLaunchSpec({ ...input, executable, timeoutMs }));
	if (session.status !== "running") return session;
	const initializeId = `initialize-${input.attemptId}`;
	const initialized = await client.deliver(input.attemptId, initializeId, claudeInitialize(initializeId));
	if (initialized.status === "unknown")
		throw new Error("Claude initialization delivery is unknown. Inspect the attempt before another start.");
	await input.wait((snapshot) => snapshot.state === "ready", {
		timeoutMs: 10000,
	});
	const delivered = await sendClaude(client, input.attemptId, input.sessionId, input.attemptId, input.prompt);
	if (delivered.status === "unknown")
		throw new Error("The first assignment delivery is unknown. Inspect the attempt before another start.");
	await input.wait((snapshot) => snapshot.acknowledgedMessageIds.includes(input.attemptId), {
		messageId: input.attemptId,
		timeoutMs: 10000,
	});
	return session;
};
