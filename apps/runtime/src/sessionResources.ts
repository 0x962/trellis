import { join } from "node:path";
import { CompletionStore } from "./completionStore.ts";
import { HarnessObservations } from "./harnessObservations.ts";
import { InputLedger } from "./inputLedger.ts";
import { SessionLog } from "./sessionLog.ts";

export function sessionResources(home: string, id: string) {
	return {
		log: new SessionLog(join(home, `${id}.output.json`)),
		stderr: new SessionLog(join(home, `${id}.stderr.json`)),
		ledger: new InputLedger(join(home, `${id}.input.json`)),
		completion: new CompletionStore(join(home, `${id}.results.jsonl`)),
		observations: new HarnessObservations(join(home, `${id}.events.json`)),
	};
}
