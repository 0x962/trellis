import { join } from "node:path";
import { workspaceOperation } from "../../../agents/native/workspaceOperation";

export function withAttemptOperation<T>(home: string, attemptId: string, action: () => Promise<T>) {
	return workspaceOperation(join(home, "harness-attempts", attemptId), action);
}
