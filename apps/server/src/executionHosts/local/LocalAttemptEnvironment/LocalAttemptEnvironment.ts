import { join } from "node:path";
import type { AttemptEnvironment, ExecutionTarget } from "@trellis/runtime-protocol/execution";

// The six values that identify one attempt to this server. The local host
// merges them over its login environment and the account profile before a
// launch; they are the only values of that environment a contract names.
export const localAttemptEnvironment = (
	host: { home: string; localUrl: string },
	target: ExecutionTarget,
	token: string,
): AttemptEnvironment => ({
	TRELLIS_URL: host.localUrl,
	TRELLIS_ACTOR: `agent:${target.runId}`,
	TRELLIS_RUN_ID: target.runId,
	TRELLIS_ATTEMPT_ID: target.attemptId,
	TRELLIS_RUNTIME_HOME: join(host.home, "runtime"),
	TRELLIS_ATTEMPT_TOKEN: token,
});
