import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MUSE_MANAGER_RULES_FILE, prepareMuse } from "./prepareMuse.ts";

const input = {
	cwd: "/tmp/project",
	prompt: "a 'quoted' prompt",
	model: "muse-spark-1.3",
	sessionId: "01a0ac27-a5a9-728c-bf93-9254b04c110f",
	resume: false as const,
	hookCommand: "/bin/bun '/tmp/hook file.ts'",
	configDirectory: "/tmp/attempt",
};

test("Muse owns one session host through the bridge and resumes the exact native session", async () => {
	const launch = await prepareMuse(input);
	expect(launch.executable).toContain("node");
	expect(launch.args[0]).toEndWith("muse-bridge.js");
	expect(JSON.parse(launch.args[1]!)).toEqual({ cwd: input.cwd, prompt: input.prompt, model: "muse-spark-1.3" });
	expect(launch.env.TRELLIS_MUSE_CONTROL_SOCKET).toStartWith("/tmp/trl-muse-");
	expect(launch.env.TRELLIS_MUSE_CONTROL_TOKEN).toHaveLength(36);
	expect(launch.env.MUSE_NO_AUTO_UPDATE).toBe("1");
	const resumed = await prepareMuse({ ...input, resume: true });
	expect(JSON.parse(resumed.args[1]!).sessionId).toBe(input.sessionId);
	const saved = await prepareMuse({ ...input, model: undefined, resume: true });
	expect(JSON.parse(saved.args[1]!)).not.toHaveProperty("model");
});

test("Muse managers place the exact persona in the workspace rules and pass the Trellis tool server", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-muse-manager-"));
	try {
		const managerSystemPrompt = "Database persona\nKeep exact spacing. ";
		const managerTools = { command: "/bin/bun", args: ["/app/manager.ts"] };
		for (const resume of [false, true] as const) {
			const launch = await prepareMuse({ ...input, cwd: directory, resume, managerSystemPrompt, managerTools });
			expect(JSON.parse(launch.args[1]!)).toMatchObject({ managerTools, cwd: directory, prompt: input.prompt });
			expect(await readFile(join(directory, MUSE_MANAGER_RULES_FILE), "utf8")).toBe(managerSystemPrompt);
		}
		const worker = await prepareMuse({ ...input, cwd: directory, resume: false });
		expect(JSON.parse(worker.args[1]!)).not.toHaveProperty("managerTools");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
