import { expect, test } from "bun:test";
import { DEFAULT_PROJECT_MANAGER_CONFIG, ProjectManagerConfigSchema } from "./project.ts";

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
