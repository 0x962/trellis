import { join } from "node:path";
import { workspaceOperation } from "../../../agents/native/workspaceOperation";

export function withNativeSnapshotRetention<T>(home: string, action: () => Promise<T>) {
	return workspaceOperation(join(home, "harness-attempts"), action);
}
