import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { RuntimeLaunchCaptureIdentity } from "@trellis/runtime-protocol";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types";
import type { BuiltInHarness } from "../../../agents/harnesses/types";
import { createPrivateRecord, readPrivateRecord } from "./privateRecord";
import type { providerRoots } from "./providerRoots";

type Input = {
	home: string;
	harness: BuiltInHarness;
	accountId: string | null;
	agentRunId: string;
	attemptId: string;
	provider: Awaited<ReturnType<typeof providerRoots>>;
	priorScopePaths: string[];
};

export async function retainLaunchCapture(input: Input): Promise<RuntimeLaunchCaptureIdentity | undefined> {
	const directory = join(input.home, "harness-attempts", input.attemptId);
	const launch = await readPrivateRecord<HarnessDescriptor>(join(directory, "launch.json"));
	const selection = {
		harness: input.harness,
		accountId: input.accountId,
		agentRunId: input.agentRunId,
		attemptId: input.attemptId,
		providerScopePaths: [...new Set([...input.provider.paths, ...input.priorScopePaths])].sort(),
		providerRoots: input.provider.roots,
	};
	const path = join(directory, "capture.json");
	if (launch && !launch.spec.capture) return undefined;
	const saved = launch?.spec.capture ?? await readPrivateRecord<RuntimeLaunchCaptureIdentity>(path);
	if (saved) {
		if (!isDeepStrictEqual({ ...selection, profileId: saved.profileId }, saved))
			throw new Error("native_capture_selection_conflict");
		return saved;
	}
	let profileId: string | null = null;
	if (input.provider.profilePath !== null) {
		const profile = { harness: input.harness, path: input.provider.profilePath };
		const key = createHash("sha256").update(JSON.stringify(profile)).digest("hex");
		const record = await createPrivateRecord(join(input.home, "capture-profiles", `${key}.json`), {
			...profile,
			id: randomUUID(),
		});
		if (record.harness !== profile.harness || record.path !== profile.path)
			throw new Error("native_capture_profile_conflict");
		profileId = record.id;
	}
	const capture = { ...selection, profileId };
	const retained = await createPrivateRecord(path, capture);
	if (!isDeepStrictEqual(capture, retained)) throw new Error("native_capture_selection_conflict");
	return retained;
}
