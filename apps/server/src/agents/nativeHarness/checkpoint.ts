import type { HarnessState } from "./types.ts";
export interface ClaudeCheckpoint {
	offset: number;
	pendingBytes: string;
	invalid: boolean;
	state: HarnessState;
	error: string | null;
}
