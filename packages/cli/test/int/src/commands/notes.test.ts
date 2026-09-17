import { describe, expect, test } from "bun:test";
import { localDateTime } from "../../../../src/time.ts";
import { runCli } from "../../../deps.ts";
import { actor, agentRunId, projectId } from "../../../fixtures.ts";

const noteId = "01J8Z6X4Q3M2K1H0G9F8E7D6N1";

const note = (overrides: Record<string, unknown> = {}) => ({
	id: noteId,
	projectId,
	projectPath: "TRL",
	title: "Fresh worktree",
	body: "Run bun install before the first check.",
	audience: "worker",
	expiresAt: null,
	actor: { name: agentRunId, kind: "agent", displayName: "Builder" },
	createdAt: "2026-09-16T10:00:00.000Z",
	updatedAt: "2026-09-16T12:34:56.000Z",
	...overrides,
});

describe("notes", () => {
	test("notes list sends the project and the filters and prints a table on a TTY", async () => {
		const tty = await runCli(
			["notes", "list", "TRL", "--audience", "worker", "--expired"],
			{ "notes.list": [note(), note({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6N2", title: "CI is red", audience: "all" })] },
			{ tty: true },
		);
		expect(tty.code).toBe(0);
		expect(tty.calls[0]).toMatchObject({ path: "notes.list" });
		expect(tty.calls[0]!.input).toEqual({ project: "TRL", audience: "worker", includeExpired: true });
		const [header, first] = tty.stdout.split("\n");
		expect(header).toMatch(/^id\s+title\s+audience\s+project\s+updated\s+expires$/);
		expect(first).toContain(noteId);
		expect(first).toContain("Fresh worktree");
		expect(first).toContain("worker");
		expect(first).toContain("TRL");
		expect(first).toContain(localDateTime("2026-09-16T12:34:56.000Z"));
		expect(first).toMatch(/-$/);
		const bare = await runCli(["notes", "list", "TRL"], { "notes.list": [note()] });
		expect(bare.calls[0]!.input).toEqual({ project: "TRL" });
		expect(JSON.parse(bare.stdout)).toEqual([note()]);
	});

	test("notes list rejects an unknown audience", async () => {
		const result = await runCli(["notes", "list", "TRL", "--audience", "nobody"], { "notes.list": [] });
		expect(result.code).not.toBe(0);
		expect(result.calls).toHaveLength(0);
		expect(result.stderr).toContain("--audience takes one of all, manager, worker");
	});

	test("notes show prints the record with the writer and the body", async () => {
		const result = await runCli(["notes", "show", noteId], { "notes.get": note() }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "notes.get", input: { id: noteId } });
		expect(result.stdout).toContain(`id:       ${noteId}`);
		expect(result.stdout).toContain(`actor:    agent:Builder ${agentRunId}`);
		expect(result.stdout).toContain("body:     Run bun install before the first check.");
	});

	test("notes add sends the title, the body, and the optional fields", async () => {
		const result = await runCli(
			["notes", "add", "TRL", "--title", "Fresh worktree", "--body", "Run bun install.", "--audience", "worker"],
			{ "notes.create": note({ body: "Run bun install.", actor }) },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "notes.create" });
		expect(result.calls[0]!.input).toEqual({
			project: "TRL",
			title: "Fresh worktree",
			body: "Run bun install.",
			audience: "worker",
		});
		const quiet = await runCli(
			["notes", "add", "TRL", "--title", "Disk", "--body", "-", "--expires", "2026-09-17T00:00:00.000Z", "--quiet"],
			{ "notes.create": note() },
			{ stdin: "Free disk: 89 GiB." },
		);
		expect(quiet.calls[0]!.input).toEqual({
			project: "TRL",
			title: "Disk",
			body: "Free disk: 89 GiB.",
			expiresAt: "2026-09-17T00:00:00.000Z",
		});
		expect(quiet.stdout).toBe(`${noteId}\n`);
	});

	test("notes edit sends only the flags given and none clears the expiry", async () => {
		const result = await runCli(
			["notes", "edit", noteId, "--body", "-", "--expires", "none"],
			{ "notes.update": note() },
			{
				stdin: "New body",
			},
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "notes.update" });
		expect(result.calls[0]!.input).toEqual({ id: noteId, body: "New body", expiresAt: null });
		const title = await runCli(["notes", "edit", noteId, "--title", "Old worktree", "--audience", "all"], {
			"notes.update": note({ title: "Old worktree", audience: "all" }),
		});
		expect(title.calls[0]!.input).toEqual({ id: noteId, title: "Old worktree", audience: "all" });
	});

	test("notes rm deletes by id and prints the id", async () => {
		const result = await runCli(["notes", "rm", noteId], { "notes.delete": { id: noteId } }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "notes.delete", input: { id: noteId } });
		expect(result.stdout).toBe(`deleted: ${noteId}\n`);
		const quiet = await runCli(["notes", "rm", noteId, "--quiet"], { "notes.delete": { id: noteId } });
		expect(quiet.stdout).toBe(`${noteId}\n`);
	});
});
