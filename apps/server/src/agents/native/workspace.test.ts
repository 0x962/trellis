import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeWorkspace } from "./workspace.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const run = {
	id: "01M358W692TA2DVK2SZVHB8PDN",
	kind: "agent",
	runtime: "native",
	ticketIdentifier: "TRL-369",
	workspaceId: null,
} as const;

describe("native workspace", () => {
	test("passes a selected environment without NODE_ENV to git", async () => {
		const root = await mkdtemp(join(tmpdir(), "trellis-native-workspace-env-"));
		roots.push(root);
		const source = join(root, "source");
		await mkdir(source);
		const environment = { PATH: "/usr/bin:/bin" };
		const gitEnvironments: NodeJS.ProcessEnv[] = [];

		await nativeWorkspace(join(root, "home"), run, source, {
			environment: async () => environment,
			exec: async (_file, args, options) => {
				gitEnvironments.push(options.env);
				if (args.includes("--symbolic-full-name")) return { stdout: "refs/heads/main\n" };
				if (args.includes("HEAD")) return { stdout: "abc123\n" };
				if (args.includes("rev-parse") && args.some((arg) => arg.startsWith("refs/heads/")))
					throw new Error("branch absent");
				return { stdout: "" };
			},
		});

		expect(gitEnvironments.length).toBeGreaterThan(0);
		expect(gitEnvironments.every((env) => env === environment)).toBe(true);
		expect(gitEnvironments.every((env) => env.NODE_ENV === undefined)).toBe(true);
	});
});
