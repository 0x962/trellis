import { expect, test } from "bun:test";
import { DEFAULT_PROJECT_MANAGER_CONFIG, ProjectCreateInputSchema, ProjectManagerConfigSchema } from "./project.ts";

const base = { personaId: null, concurrency: 3, directory: "" };

test("new projects use the local runtime without a repository approval flag", () => {
	expect(DEFAULT_PROJECT_MANAGER_CONFIG.ade).toBe("native");
	expect(DEFAULT_PROJECT_MANAGER_CONFIG).not.toHaveProperty("trustedDirectory");
	expect(DEFAULT_PROJECT_MANAGER_CONFIG.harness.preset).toBe("claude");
});

test("each harness preset keeps its commands within the local runtime", () => {
	for (const preset of ["claude", "codex", "opencode", "pi"] as const) {
		const config = ProjectManagerConfigSchema.parse({ ...base, harness: { preset } });
		expect(config.ade).toBe("native");
		expect(config.harness.startCommand).toMatch(new RegExp(`(^| )${preset} `));
		expect(config.harness.resumeCommand).toMatch(new RegExp(`(^| )${preset} `));
	}
});

test("a custom harness preserves its start and resume commands", () => {
	const harness = {
		preset: "custom",
		startCommand: "my-agent {{prompt}}",
		resumeCommand: "my-agent resume {{sessionId}}",
	};
	expect(ProjectManagerConfigSchema.parse({ ...base, harness }).harness).toEqual(harness);
});

test("the project schema rejects the removed repository approval field", () => {
	expect(ProjectManagerConfigSchema.safeParse({ ...base, trustedDirectory: true }).success).toBe(false);
});

test("project settings contain no tool permission approval field", () => {
	expect(DEFAULT_PROJECT_MANAGER_CONFIG).not.toHaveProperty("allowAllPermissions");
	expect(ProjectManagerConfigSchema.safeParse({ ...base, allowAllPermissions: false }).success).toBe(false);
});

// A person types the name in the project dialog and the concurrency in the
// manager settings, so each bound reads as a sentence.
test("a project name out of bounds reads as a sentence", () => {
	const message = (name: string) => ProjectCreateInputSchema.safeParse({ key: "CDE", name }).error!.issues[0]!.message;
	expect(message("")).toBe("Enter a project name of 1 to 120 characters.");
	expect(message("n".repeat(121))).toBe("Enter a project name of 1 to 120 characters.");
});

test("a concurrency out of bounds reads as a sentence", () => {
	const message = (concurrency: number) =>
		ProjectManagerConfigSchema.safeParse({ ...base, concurrency }).error!.issues[0]!.message;
	expect(message(0)).toBe("Enter a concurrency of 1 to 64.");
	expect(message(65)).toBe("Enter a concurrency of 1 to 64.");
	expect(message(2.5)).toBe("Enter a whole number for the concurrency.");
});
