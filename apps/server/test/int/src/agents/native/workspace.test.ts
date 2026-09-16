import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun } from "@trellis/api";
import { nativeWorkspace } from "../../../../../src/agents/native/workspace.ts";
import { loginEnvironment } from "../../../../../src/executionEnvironment/loginEnvironment/loginEnvironment.ts";

test("a shell-removed NODE_ENV stays absent from the git worktree environment", async () => {
	const home = await mkdtemp(join(process.env.TRELLIS_TEST_ROOT!, "native-workspace-"));
	const source = join(home, "source");
	const shell = join(home, "shell");
	const originalNodeEnv = process.env.NODE_ENV;
	try {
		await mkdir(source);
		await writeFile(shell, "#!/bin/sh\nunset NODE_ENV\n/usr/bin/env -0\n", { mode: 0o700 });
		process.env.NODE_ENV = "ambient";
		const environment = await loginEnvironment(shell, "/bundled/bin", {
			HOME: home,
			NODE_ENV: "selected",
			PATH: "/usr/bin:/bin",
		});
		let childEnvironment: Record<string, string | undefined> | undefined;
		const run: Omit<AgentRun, "state" | "processStatus" | "observation"> = {
			id: "01M2NJNEHM69326A40DVTPBJV4",
			name: "Builder",
			runtime: "native",
			personaId: null,
			personaName: "Builder",
			kind: "builder",
			instruction: "Build.",
			projectId: null,
			projectPath: "TRL",
			ticketId: null,
			ticketIdentifier: "TRL-75",
			workspaceId: null,
			terminalId: null,
			url: null,
			error: null,
			sessionId: null,
			sessionLost: false,
			createdAt: "2026-09-16T17:00:00.000Z",
			updatedAt: "2026-09-16T17:00:00.000Z",
		};
		await nativeWorkspace(home, run, source, {
			environment: async () => environment,
			exec: async (_file, _args, options) => {
				childEnvironment = options.env;
			},
		});
		expect(environment.NODE_ENV).toBeUndefined();
		expect(childEnvironment).toBe(environment);
		expect(childEnvironment?.NODE_ENV).toBeUndefined();
	} finally {
		if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalNodeEnv;
		await rm(home, { recursive: true, force: true });
	}
});
