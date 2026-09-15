import { expect, test } from "bun:test";
import {
	DEFAULT_AGENT_RESUME_COMMAND,
	DEFAULT_AGENT_START_COMMAND,
	unknownAgentCommandVariables,
} from "./agentLaunch.ts";

test("an agent template accepts its session variables and rejects unknown names", () => {
	expect(unknownAgentCommandVariables(DEFAULT_AGENT_START_COMMAND)).toEqual([]);
	expect(unknownAgentCommandVariables(DEFAULT_AGENT_RESUME_COMMAND)).toEqual([]);
	expect(unknownAgentCommandVariables("codex resume {{sessionId}} {{resumeText}} {{workspaceId}} {{unknown}}")).toEqual(
		["unknown"],
	);
});
