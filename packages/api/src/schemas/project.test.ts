import { expect, test } from "bun:test";
import { ProjectManagerConfigSchema } from "./project.ts";

const base = { personaId: null, concurrency: 3, directory: "" };

test("legacy agent commands become harness settings without changing the ADE", () => {
	const config = ProjectManagerConfigSchema.parse({
		...base,
		ade: "superset",
		agentCommand: "codex {{prompt}}",
		agentResumeCommand: "codex resume --last {{resumeText}}",
	});
	expect(config.harness).toEqual({
		preset: "codex",
		startCommand: "codex {{prompt}}",
		resumeCommand: "codex resume --last {{resumeText}}",
	});
	expect(config.ade).toBe("superset");
	expect(config).not.toHaveProperty("agentCommand");
	expect(config).not.toHaveProperty("harnessCommands");
});

test("each harness preset fills its own commands independently of the ADE", () => {
	for (const preset of ["claude", "codex", "agy", "opencode", "pi"] as const) {
		const config = ProjectManagerConfigSchema.parse({ ...base, ade: "tmux", harness: { preset } });
		expect(config.harness.preset).toBe(preset);
		expect(config.harness.startCommand).toStartWith(`${preset} `);
		expect(config.harness.resumeCommand).toStartWith(`${preset} `);
		expect(config.ade).toBe("tmux");
	}
});

test("terminal and tmux ADEs accept a custom harness without replacing its commands", () => {
	for (const ade of ["terminal", "tmux"] as const) {
		const config = ProjectManagerConfigSchema.parse({
			...base,
			ade,
			harness: {
				preset: "custom",
				startCommand: "my-agent {{prompt}}",
				resumeCommand: "my-agent resume {{sessionId}}",
			},
		});
		expect(config.ade).toBe(ade);
		expect(config.harness.startCommand).toBe("my-agent {{prompt}}");
	}
});

test("legacy Superset defaults migrate workspace flags without replacing custom interaction commands", async () => {
	const { SUPERSET_ADE_COMMANDS } = await import("../adeCommands/presets.ts");
	const legacy = {
		...SUPERSET_ADE_COMMANDS,
		start: SUPERSET_ADE_COMMANDS.start.replace("{{createTarget}}", "{{target}}"),
		send: "my-send {{text}}",
	};
	const config = ProjectManagerConfigSchema.parse({ ...base, harnessCommands: legacy });
	expect(config.adeCommands?.start).toBe(SUPERSET_ADE_COMMANDS.start);
	expect(config.adeCommands?.send).toBe("my-send {{text}}");
});

test("a native project uses the Trellis runtime without ADE command templates", () => {
	const config = ProjectManagerConfigSchema.parse({
		personaId: null,
		concurrency: 3,
		directory: "/tmp/project",
		ade: "native",
	});
	expect(config.ade).toBe("native");
	expect(config.adeCommands).toBeNull();
});

test("directory trust requires an explicit project choice", () => {
	expect(ProjectManagerConfigSchema.parse(base).trustedDirectory).toBe(false);
	expect(ProjectManagerConfigSchema.parse({ ...base, trustedDirectory: true }).trustedDirectory).toBe(true);
});
