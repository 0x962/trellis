import { expect, test } from "bun:test";
import {
	DEFAULT_AGENT_RESUME_COMMAND,
	DEFAULT_AGENT_START_COMMAND,
	unknownAgentCommandVariables,
	unknownLaunchVariables,
} from "./agentLaunch.ts";

test("an ADE template takes the session and the workspace of the run", () => {
	expect(
		unknownLaunchVariables("{{superset}} terminals create --workspace {{workspaceId}} --command {{agentCommand}}"),
	).toEqual([]);
	expect(unknownLaunchVariables("run {{sessionId}} {{resumeText}}")).toEqual(["resumeText"]);
});

test("an agent template takes the session, the prompt, and the resume text, and nothing of the ADE", () => {
	expect(unknownAgentCommandVariables(DEFAULT_AGENT_START_COMMAND)).toEqual([]);
	expect(unknownAgentCommandVariables(DEFAULT_AGENT_RESUME_COMMAND)).toEqual([]);
	expect(
		unknownAgentCommandVariables("codex resume {{sessionId}} {{resumeText}} {{workspaceId}} {{superset}}"),
	).toEqual(["workspaceId", "superset"]);
});
