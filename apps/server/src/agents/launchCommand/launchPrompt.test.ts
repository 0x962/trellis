import { expect, test } from "bun:test";
import { type AgentRunKind, HarnessSchema } from "@trellis/api";
import { launchPrompt } from "./launchPrompt";

const run: Parameters<typeof launchPrompt>[0]["run"] = {
	id: "01M2S1BZFYJW83WQWYTVQ7R35P",
	name: "Agent",
	accountId: null,
	runtime: "native",
	harness: HarnessSchema.parse({ preset: "claude" }),
	kind: "agent",
	instruction: "Do the work.",
	projectId: "01M24QC2CGYW30994FKSNMTEVP",
	projectPath: "OP",
	ticketId: "01M24QC2CGYW30994FKSNMTEVQ",
	ticketIdentifier: "OP-1",
	ticketTitle: "Task",
	ticketStatusCategory: "todo",
	ticketEpicId: null,
	ticketEpicProjectId: null,
	workspaceId: null,
	terminalId: null,
	url: null,
	error: null,
	sessionId: null,
	sessionLost: false,
	createdAt: "2026-09-17T00:00:00.000Z",
	updatedAt: "2026-09-17T00:00:00.000Z",
};

for (const kind of ["agent", "flow", "session"] satisfies AgentRunKind[]) {
	test(`${kind} receives only its saved instruction`, () => {
		expect(launchPrompt({ run: { ...run, kind } })).toBe("Do the work.");
	});
}

test("a custom harness keeps the message receipt before the instruction", () => {
	expect(launchPrompt({ run, messageId: "attempt-1" })).toBe("trellis-message:attempt-1\nDo the work.");
});
