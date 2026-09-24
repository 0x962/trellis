import { expect, test } from "bun:test";
import { type AgentRunKind, HarnessSchema } from "@trellis/api";
import { launchCommand } from "./launchCommand.ts";
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
	projectKey: "OP",
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
	closedAt: null,
	createdAt: "2026-09-17T00:00:00.000Z",
	updatedAt: "2026-09-17T00:00:00.000Z",
};

for (const kind of ["agent", "flow", "session"] satisfies AgentRunKind[]) {
	test(`the saved instruction helper preserves a ${kind} instruction`, () => {
		expect(launchPrompt({ run: { ...run, kind } })).toBe("Do the work.");
	});
}

test("a custom harness keeps the message receipt before the instruction", () => {
	expect(launchPrompt({ run, messageId: "attempt-1" })).toBe("trellis-message:attempt-1\nDo the work.");
});

for (const placeholder of ["prompt", "instruction", "resumeText"]) {
	test(`a custom resume receives the common guide through ${placeholder}`, () => {
		const result = launchCommand({
			run: { ...run, sessionId: "saved-conversation" },
			url: "http://localhost:4521",
			resume: true,
			template: `agent --resume {{sessionId}} --message {{${placeholder}}}`,
			messageId: "attempt-2",
			prompt: "# Trellis\nCurrent ticket context.",
		});
		expect(result.command).toContain("saved-conversation");
		expect(result.command).toContain("trellis-message:attempt-2\n# Trellis\nCurrent ticket context.");
		expect(result.command).not.toContain("Do the work.");
	});
}

test("a custom command must have a placeholder for the common guide", () => {
	expect(() =>
		launchCommand({
			run,
			url: "http://localhost:4521",
			template: "agent --resume {{sessionId}}",
			prompt: "# Trellis",
		}),
	).toThrow("A custom harness command must include");
});
