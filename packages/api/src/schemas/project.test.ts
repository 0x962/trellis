import { expect, test } from "bun:test";
import { DEFAULT_PROJECT_MANAGER_CONFIG, ProjectManagerConfigSchema } from "./project.ts";

const base = { personaId: null, concurrency: 3, directory: "" };

test("new projects use the local runtime and require repository trust", () => {
	expect(DEFAULT_PROJECT_MANAGER_CONFIG.ade).toBe("native");
	expect(DEFAULT_PROJECT_MANAGER_CONFIG.trustedDirectory).toBe(false);
	expect(DEFAULT_PROJECT_MANAGER_CONFIG.harness.preset).toBe("claude");
});

test("each harness preset keeps its commands within the local runtime", () => {
	for (const preset of ["claude", "codex", "agy", "opencode", "pi"] as const) {
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

test("directory trust requires an explicit project choice", () => {
	expect(ProjectManagerConfigSchema.parse(base).trustedDirectory).toBe(false);
	expect(ProjectManagerConfigSchema.parse({ ...base, trustedDirectory: true }).trustedDirectory).toBe(true);
});

test("tool permissions default to allowed and preserve an explicit opt out", () => {
	expect(DEFAULT_PROJECT_MANAGER_CONFIG.allowAllPermissions).toBe(true);
	expect(ProjectManagerConfigSchema.parse(base).allowAllPermissions).toBe(true);
	expect(ProjectManagerConfigSchema.parse({ ...base, allowAllPermissions: false }).allowAllPermissions).toBe(false);
});
