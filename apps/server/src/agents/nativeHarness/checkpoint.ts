import type { HarnessState } from "./types.ts";
export interface ClaudeCheckpoint {
	offset: number;
	processExited?: boolean;
	pendingBytes: string;
	invalid: boolean;
	state: HarnessState;
	error: string | null;
}
