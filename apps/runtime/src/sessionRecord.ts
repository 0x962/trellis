import type { RuntimeProcessStatus, RuntimeSession } from "@trellis/runtime-protocol";
import type { CompletionStore } from "./completionStore.ts";
import type { InputLedger } from "./inputLedger.ts";
import type { ProcessHandle } from "./processHandle.ts";
import type { SessionLog } from "./sessionLog.ts";

export type SessionRecord = {
	session: RuntimeSession;
	fingerprint: string | null;
	identity: string | null;
	launch: RuntimeProcessStatus["launch"];
	listeners: Set<() => void>;
	watchedPids: Set<number>;
	tokenHash: Buffer | null;
	activity: RuntimeProcessStatus["activity"];
	inputPending: boolean;
	log: SessionLog;
	stderr: SessionLog;
	ledger: InputLedger;
	completion: CompletionStore;
	process?: ProcessHandle;
	timer?: ReturnType<typeof setTimeout>;
	stopped: Promise<void>;
	resolveStop: () => void;
};
