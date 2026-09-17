import { expect, test } from "bun:test";

const liveAgentVariables = [
	"TRELLIS_ACTOR",
	"TRELLIS_ATTEMPT_ID",
	"TRELLIS_ATTEMPT_TOKEN",
	"TRELLIS_AUTH_TOKEN",
	"TRELLIS_EXECUTION_BIN",
	"TRELLIS_EXECUTION_SHELL",
	"TRELLIS_RUN_ID",
	"TRELLIS_RUNTIME_HOME",
	"TRELLIS_RUNTIME_NODE",
	"TRELLIS_RUNTIME_SCRIPT",
	"TRELLIS_URL",
] as const;

test("the test process has no live Trellis agent state", () => {
	for (const key of liveAgentVariables) expect(process.env[key], key).toBeUndefined();
});
