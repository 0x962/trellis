import type { LaunchSpec, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { BuiltInHarness } from "../harnesses/types.ts";

export type HarnessHostOptions = {
	runtime: RuntimeClient;
	directory: string;
	env: Record<string, string | undefined>;
	bun: string;
	observationTimeoutMs?: number;
};
export type HarnessStartInput = {
	id: string;
	harness: BuiltInHarness;
	cwd: string;
	prompt: string;
	model?: string;
	token?: string;
	timeoutMs?: number;
};
export type HarnessDescriptor = {
	fingerprint: string;
	spec: LaunchSpec;
	harness: BuiltInHarness;
};
export type HarnessStarted = { process: RuntimeProcessStatus };
