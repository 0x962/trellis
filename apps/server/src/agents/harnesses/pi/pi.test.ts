import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePi } from "./pi.ts";

test("Pi manager launches replace the coding system prompt on start and resume", async () => {
	const managerSystemPrompt = `Database persona ${crypto.randomUUID()}`;
	const directory = await mkdtemp(join(tmpdir(), "trellis-pi-system-"));
	try {
		const input = {
			cwd: directory,
			configDirectory: directory,
			prompt: "Task",
			hookCommand: "true",
			sessionId: "session",
		};
		for (const resume of [false, true] as const) {
			const launch = await preparePi({
				...input,
				resume,
				managerSystemPrompt,
				managerTools: { command: "bun", args: ["manager.ts"] },
			});
			expect(launch.args[launch.args.indexOf("--system-prompt") + 1]).toBe(managerSystemPrompt);
			expect(launch.args[launch.args.indexOf("--append-system-prompt") + 1]).toBe("");
			const worker = await preparePi(resume ? { ...input, resume: true } : { ...input, resume: false });
			expect(worker.args).not.toContain("--system-prompt");
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
