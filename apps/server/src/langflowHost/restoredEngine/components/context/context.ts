import { join } from "node:path";
import { LangflowHostControl } from "../../../hostControl";
import { ReceiptObjectStore } from "../../../objectStore";
import { type IsolatedRestoreScope, withIsolatedRestore } from "../../../restoreExclusion";
import type { RestoredEngineInput } from "../../contracts";

export function withInstallContext<T>(input: RestoredEngineInput, action: (ctx: InstallContext) => Promise<T>) {
	return withIsolatedRestore(input, async (scope) => {
		const objects = new ReceiptObjectStore(join(LangflowHostControl.directory(scope.identity.home), "restored-engine"));
		return action({ ...scope, objects });
	});
}

export type InstallContext = IsolatedRestoreScope & { objects: ReceiptObjectStore };
