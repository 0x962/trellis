import { join } from "node:path";
import type { RuntimeCaptureIdentity } from "@trellis/runtime-protocol";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types";
import { nativeClient } from "../../../agents/native/connection";
import { readPrivateRecord } from "./privateRecord";

export type NativeCaptureIdentityResult =
	| { state: "retained"; identity: RuntimeCaptureIdentity; workspaceId: string }
	| { state: "unavailable"; reason: "capture_launch_identity_missing" | "capture_provider_session_missing" };

export async function readNativeCaptureIdentity(home: string, attemptId: string): Promise<NativeCaptureIdentityResult> {
	const launch = await readPrivateRecord<HarnessDescriptor>(join(home, "harness-attempts", attemptId, "launch.json"));
	const saved = launch?.spec.capture;
	if (!launch || !saved) return { state: "unavailable" as const, reason: "capture_launch_identity_missing" };
	if (launch.spec.id !== attemptId || saved.attemptId !== attemptId || saved.harness !== launch.harness)
		throw new Error("native_capture_launch_identity_conflict");
	const observed = await nativeClient(home).inspect(attemptId);
	if (observed.id !== attemptId || observed.launch?.cwd !== launch.spec.cwd)
		throw new Error("native_capture_observation_conflict");
	const providerSessionId = observed.agent?.sessionId;
	if (!providerSessionId) return { state: "unavailable" as const, reason: "capture_provider_session_missing" };
	const identity: RuntimeCaptureIdentity = {
		harness: saved.harness, accountId: saved.accountId, profileId: saved.profileId,
		agentRunId: saved.agentRunId, attemptId, providerSessionId,
	};
	return { state: "retained" as const, identity, workspaceId: launch.spec.cwd };
}
