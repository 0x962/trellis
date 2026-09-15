import { expect, test } from "bun:test";
import { prepareCodex } from "./prepareCodex.ts";

const input = {
	cwd: "/tmp/project",
	prompt: "a 'quoted' prompt",
	model: "gpt-6",
	sessionId: "vendor-session",
	resume: false as const,
	hookCommand: "/bin/bun '/tmp/hook file.ts'",
	configDirectory: "/tmp/attempt",
};

test("Codex owns an isolated engine and resumes the exact native thread", async () => {
	const launch = await prepareCodex(input);
	expect(launch.executable).toContain("node");
	expect(launch.args[0]).toEndWith("codex-bridge.js");
	expect(JSON.parse(launch.args[1]!)).toMatchObject({ model: "gpt-6", prompt: input.prompt });
	expect(launch.env.TRELLIS_CODEX_ENGINE_SOCKET).toStartWith("/tmp/trl-codex-");
	const resumed = await prepareCodex({ ...input, resume: true });
	expect(JSON.parse(resumed.args[1]!).sessionId).toBe(input.sessionId);
});
