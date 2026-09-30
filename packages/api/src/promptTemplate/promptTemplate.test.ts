import { expect, test } from "bun:test";
import { agentGuide, contextKeys, defaultAgentPrompt } from "../agentGuide/agentGuide";
import { promptTemplateError, promptVariables } from "./promptTemplate";

test("the default template uses supported variables", () => {
	expect(promptTemplateError(defaultAgentPrompt, contextKeys)).toBeUndefined();
	expect(contextKeys).toContain("session.request");
	expect(contextKeys).toContain("ticket.description");
});

test("empty templates and unknown variables produce useful errors", () => {
	expect(promptTemplateError(" \n\t", contextKeys)).toBe("Enter a startup prompt.");
	expect(promptTemplateError("{{ticket.typo}} {{ticket.typo}} {{Session.Request}}", contextKeys)).toBe(
		"Unknown variables: {{ticket.typo}}, {{Session.Request}}.",
	);
	expect(promptTemplateError("Follow the repository instructions.", contextKeys)).toBeUndefined();
});

test("variable positions follow UTF-16 text offsets without changing the source", () => {
	const template = "𝒜\n{{session.request}}\t{{ticket.title}}";
	const found = promptVariables(template);
	expect(found.map(({ name }) => name)).toEqual(["session.request", "ticket.title"]);
	for (const variable of found) expect(template.slice(variable.from, variable.to)).toBe(`{{${variable.name}}}`);
});

test("rendering preserves whitespace and never expands variable syntax inside context values", () => {
	const template = "  # Task\n\t{{session.request}}\n\n{{ticket.title}}  \n";
	expect(
		agentGuide({ "session.request": "Keep {{ticket.title}} literal.", "ticket.title": "Edit settings" }, template),
	).toBe("  # Task\n\tKeep {{ticket.title}} literal.\n\nEdit settings  \n");
});

test("templates have no text ceiling", () => {
	const template = `${"Full instructions.\n".repeat(20_000)}{{session.request}}`;
	expect(promptTemplateError(template, contextKeys)).toBeUndefined();
	expect(agentGuide({ "session.request": "Complete the task." }, template)).toBe(
		`${"Full instructions.\n".repeat(20_000)}Complete the task.`,
	);
});
