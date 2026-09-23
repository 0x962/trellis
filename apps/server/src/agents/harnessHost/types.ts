import type { HarnessEffort } from "@trellis/api";
import type { LaunchSpec, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import type { JobsLog } from "../../jobs.ts";
import type { BuiltInHarness } from "../harnesses/types.ts";

export type HarnessHostOptions = {
	runtime: RuntimeClient;
	directory: string;
	agentsDirectory: string;
	env: Record<string, string | undefined>;
	bun: string;
	log?: JobsLog;
	observationTimeoutMs?: number;
};
export type HarnessStartInput = {
	id: string;
	harness: BuiltInHarness;
	cwd: string;
	prompt: string;
	model?: string;
	effort?: HarnessEffort;
	token?: string;
	timeoutMs?: number;
	kind?: "builder" | "reviewer";
};
export type HarnessDescriptor = {
	fingerprint: string;
	effort?: HarnessEffort;
	prompt: string;
	sessionId?: string;
	spec: LaunchSpec;
	harness: BuiltInHarness;
};
export type HarnessStarted = { process: RuntimeProcessStatus };
