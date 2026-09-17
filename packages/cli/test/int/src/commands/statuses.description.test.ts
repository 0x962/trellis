import { describe, expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { status } from "../../../fixtures.ts";

const rule = "Deploy every ticket here, then move it to Done after a human approves.";

describe("statuses --description", () => {
	test("statuses add sends the description", async () => {
		const argv = ["statuses", "add", "CDE", "Deploy Queue", "--category", "started", "--description", rule];
		const result = await runCli(argv, { "statuses.create": status({ slug: "deploy-queue", description: rule }) });
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({
			project: "CDE",
			name: "Deploy Queue",
			category: "started",
			description: rule,
		});
	});

	test("statuses edit --description - reads the whole standard input", async () => {
		const text = "New work.\n\nRead it, then start a builder.\n";
		const result = await runCli(
			["statuses", "edit", "CDE", "todo", "--description", "-"],
			{
				"statuses.update": status({ slug: "todo", description: text }),
			},
			{ stdin: text },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ project: "CDE", status: "todo", description: text });
	});

	test("statuses edit --description with an empty text clears it", async () => {
		const result = await runCli(["statuses", "edit", "CDE", "todo", "--description", ""], {
			"statuses.update": status({ slug: "todo", description: "" }),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ project: "CDE", status: "todo", description: "" });
	});

	test("the status record on a TTY shows the description", async () => {
		const result = await runCli(
			["statuses", "edit", "CDE", "todo", "--description", rule],
			{ "statuses.update": status({ slug: "todo", description: rule }) },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		const line = result.stdout.split("\n").find((text) => text.startsWith("description:"));
		expect(line).toBeDefined();
		expect(line).toContain(rule);
	});
});

test("statuses edit saves column worker settings", async () => {
	const agentConfig = {
		personaId: "01J8Z6X4Q3M2K1H0G9F8E7D6C5",
		harness: { preset: "claude", model: "anthropic/claude-opus-5", effort: "high" },
		accountId: null,
	};
	const result = await runCli(
		["statuses", "edit", "CDE", "agent-review", "--agent-config", JSON.stringify(agentConfig)],
		{ "statuses.update": status() },
	);
	expect(result.code).toBe(0);
	expect(result.calls[0]!.input).toMatchObject({ project: "CDE", status: "agent-review", agentConfig });
});
test("statuses edit can make a column manual", async () => {
	const result = await runCli(["statuses", "edit", "CDE", "agent-review", "--agent-config", "null"], {
		"statuses.update": status(),
	});
	expect(result.code).toBe(0);
	expect(result.calls[0]!.input).toMatchObject({ agentConfig: null });
});
