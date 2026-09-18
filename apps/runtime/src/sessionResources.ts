import { CompletionStore } from "./completionStore.ts";
import { HarnessObservations } from "./harnessObservations.ts";
import { InputLedger } from "./inputLedger.ts";
import { sessionFiles } from "./sessionFiles.ts";
import { SessionLog } from "./sessionLog.ts";

export function sessionResources(home: string, id: string) {
	const files = sessionFiles(home, id);
	return {
		log: new SessionLog(files.output, true),
		stderr: new SessionLog(files.stderr, true),
		ledger: new InputLedger(files.input),
		completion: new CompletionStore(files.results),
		observations: new HarnessObservations(files.events),
	};
}
