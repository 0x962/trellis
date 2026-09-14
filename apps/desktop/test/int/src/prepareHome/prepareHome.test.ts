import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MessageBoxOptions } from "electron";
import type { HomeImportPreview, MaintenanceRequest } from "../../../../src/homeImportClient/homeImportClient.ts";
import { prepareHome } from "../../../../src/prepareHome/prepareHome.ts";

const preview = (source: string, target: string): HomeImportPreview => ({
	source,
	target,
	version: "reviewed-version",
	files: 10,
	bytes: 1024,
	counts: { projects: 1, tickets: 3, agents: 0, attachments: 0, artifacts: 1, checks: 2 },
	blockers: [],
	workspaceReferences: [{ id: "worker", workspaceId: "/original/worktree" }],
});

test("import confirms concrete paths before any host token exists", async () => {
	const directory = await mkdtemp("/tmp/trl-import-ui-");
	const home = join(directory, "host");
	const source = join(directory, "original data");
	const messages: MessageBoxOptions[] = [];
	const requests: MaintenanceRequest[] = [];
	try {
		const accepted = await prepareHome(
			{ home, resources: join(directory, "resources") },
			{
				message: async (options) => {
					messages.push(options);
					return { response: messages.length < 3 ? 1 : 0 };
				},
				chooseSource: async () => source,
				maintenance: async (_resources, request) => {
					expect(existsSync(home)).toBe(false);
					requests.push(request);
					return preview(source, home);
				},
			},
		);
		expect(accepted).toBe(true);
		expect(requests.map((request) => request.operation)).toEqual(["preview", "import"]);
		expect(requests[1]!.expectedVersion).toBe("reviewed-version");
		expect(messages[1]!.detail).toContain(source);
		expect(messages[1]!.detail).toContain(home);
		expect(messages[1]!.detail).toContain("Workspace paths still point to their original folders.");
		expect(existsSync(home)).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("active work blocks import and never starts a copy", async () => {
	const directory = await mkdtemp("/tmp/trl-import-block-");
	const messages: MessageBoxOptions[] = [];
	const calls: string[] = [];
	try {
		const accepted = await prepareHome(
			{ home: join(directory, "host"), resources: directory },
			{
				message: async (options) => {
					messages.push(options);
					return { response: messages.length === 1 ? 1 : 0 };
				},
				chooseSource: async () => join(directory, "source"),
				maintenance: async (_resources, request) => {
					calls.push(request.operation);
					return {
						...preview(request.source, request.target),
						blockers: ["Agent ABC is active.", "Two manager messages are queued."],
					};
				},
			},
		);
		expect(accepted).toBe(false);
		expect(calls).toEqual(["preview"]);
		expect(messages[1]!.buttons).toEqual(["Cancel"]);
		expect(messages[1]!.detail).toContain("Agent ABC is active.");
		expect(messages[1]!.detail).toContain("Two manager messages are queued.");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a failed import retains its target and shows an archive rollback command", async () => {
	const directory = await mkdtemp("/tmp/trl-import-failure-");
	const home = join(directory, "host");
	const messages: MessageBoxOptions[] = [];
	try {
		const accepted = await prepareHome(
			{ home, resources: directory },
			{
				message: async (options) => {
					messages.push(options);
					return { response: 1 };
				},
				chooseSource: async () => join(directory, "source"),
				maintenance: async (_resources, request) => {
					if (request.operation === "import") {
						await mkdir(home);
						await writeFile(join(home, "import-in-progress.json"), "retained");
						throw new Error("The copy failed.");
					}
					return preview(request.source, request.target);
				},
			},
		);
		expect(accepted).toBe(false);
		expect(await readFile(join(home, "import-in-progress.json"), "utf8")).toBe("retained");
		expect(messages.at(-1)!.detail).toContain("The copy failed.");
		expect(messages.at(-1)!.detail).toContain("'rollback' '--target'");
		expect(messages.at(-1)!.detail).toContain(`'${home}' '--archive'`);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Cancel leaves first launch without data or maintenance work", async () => {
	const directory = await mkdtemp("/tmp/trl-import-cancel-");
	const home = join(directory, "host");
	try {
		const accepted = await prepareHome(
			{ home, resources: directory },
			{
				message: async () => ({ response: 2 }),
				chooseSource: async () => {
					throw new Error("Cancel must not open the source picker.");
				},
				maintenance: async () => {
					throw new Error("Cancel must not start maintenance.");
				},
			},
		);
		expect(accepted).toBe(false);
		expect(existsSync(home)).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
