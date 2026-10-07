import { expect, test } from "bun:test";
import type { AssignChoice } from "../../../../agents/AssignAgent/assignChoice";
import { AgentPicker } from "./AgentPicker";

const choice: AssignChoice = { preset: "codex", model: "openai/gpt-6-astra", effort: "high", accountId: null };
const description = (value: AssignChoice | null, assignAgent: boolean) =>
	AgentPicker({ value, accounts: [], assignAgent, disabled: false, onChange: () => {} }).props.description;

test("the description promises a start only when assignment is on", () => {
	expect(description(choice, true)).toBe("The agent starts when you create the ticket.");
	expect(description(choice, false)).toBe("Assign agent is off. Create saves the ticket without an agent.");
});

test("a ticket without an agent choice offers later assignment", () => {
	expect(description(null, false)).toBe("Create the ticket now. Assign an agent later.");
	expect(description(null, true)).toBe("Create the ticket now. Assign an agent later.");
});
