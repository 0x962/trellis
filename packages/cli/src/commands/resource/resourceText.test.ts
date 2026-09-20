import { expect, test } from "bun:test";
import type { Resource } from "@trellis/api";
import type { CliContext } from "../../context.ts";
import { renderTable } from "../../output.ts";
import { resourceInput } from "./resource.ts";
import { resourceList } from "./resourceText.ts";

const context = (stdin = "standard input"): CliContext =>
	({ deps: { stdin: () => Promise.resolve(stdin) } }) as CliContext;

const resource = (fields: Partial<Resource> & Pick<Resource, "kind" | "name">): Resource =>
	({
		id: `${fields.kind}-id`,
		epicId: "epic-id",
		body: null,
		url: null,
		blob: null,
		ticketId: null,
		pullRequestNumber: null,
		actor: { kind: "agent", name: "test" },
		createdAt: "2026-09-20T20:32:08.114Z",
		updatedAt: "2026-09-20T20:32:08.114Z",
		...fields,
	}) as Resource;

test("builds each resource kind from its source flag", async () => {
	const readPaths: string[] = [];
	const readFile = (path: string) => {
		readPaths.push(path);
		return new File([path], path, { type: path.endsWith(".png") ? "image/png" : "text/plain" });
	};

	await expect(
		resourceInput(
			context("The plan"),
			{
				epic: "OP/routines-e2e",
				kind: "doc",
				name: "Runtime plan",
				body: "-",
				ticket: "OP-34",
			},
			readFile,
		),
	).resolves.toMatchObject({ kind: "doc", body: "The plan", ticket: "OP-34" });
	await expect(
		resourceInput(
			context(),
			{
				epic: "OP/routines-e2e",
				kind: "link",
				name: "Pull request",
				url: "https://github.com/0x962/trellis/pull/207",
			},
			readFile,
		),
	).resolves.toMatchObject({ kind: "link", url: "https://github.com/0x962/trellis/pull/207" });
	await expect(
		resourceInput(
			context(),
			{
				epic: "OP/routines-e2e",
				kind: "image",
				name: "proof.png",
				file: "proof.png",
			},
			readFile,
		),
	).resolves.toMatchObject({ kind: "image", file: expect.any(File) });
	await expect(
		resourceInput(
			context(),
			{
				epic: "OP/routines-e2e",
				kind: "file",
				name: "sequence.mmd",
				file: "sequence.mmd",
			},
			readFile,
		),
	).resolves.toMatchObject({ kind: "file", file: expect.any(File) });
	expect(readPaths).toEqual(["proof.png", "sequence.mmd"]);
});

test("refuses a missing or unrelated source flag before a file read", async () => {
	let reads = 0;
	const readFile = () => {
		reads++;
		return new File(["file"], "file.txt");
	};
	await expect(
		resourceInput(context(), { epic: "OP/routines-e2e", kind: "link", name: "Site", file: "site.txt" }, readFile),
	).rejects.toThrow("link resource does not take --file");
	await expect(
		resourceInput(
			context(),
			{
				epic: "OP/routines-e2e",
				kind: "link",
				name: "Site",
				url: "https://example.com",
				file: "site.txt",
			},
			readFile,
		),
	).rejects.toThrow("link resource does not take --file");
	await expect(
		resourceInput(context(), { epic: "OP/routines-e2e", kind: "file", name: "Plan" }, readFile),
	).rejects.toThrow("file resource needs --file");
	expect(reads).toBe(0);
});

test("prints the kind, name, source, and evidence pull request", () => {
	const resources = [
		resource({ kind: "doc", name: "Runtime plan", body: "The plan" }),
		resource({ kind: "link", name: "Pull request", url: "https://github.com/0x962/trellis/pull/207" }),
		resource({
			kind: "image",
			name: "proof.png",
			blob: { sha256: "a".repeat(64), url: "/api/resources/image-id/blob", size: 1024 },
			pullRequestNumber: 207,
		}),
		resource({
			kind: "file",
			name: "sequence.mmd",
			blob: { sha256: "b".repeat(64), url: "/api/resources/file-id/blob", size: 512 },
		}),
	];

	expect(
		renderTable(resources, resourceList.columns),
	).toBe(`kind   name          source                                     pullRequest
doc    Runtime plan  The plan                                   -
link   Pull request  https://github.com/0x962/trellis/pull/207  -
image  proof.png     /api/resources/image-id/blob               #207
file   sequence.mmd  /api/resources/file-id/blob                -
`);
});

test("prints the empty list marker", () => {
	expect(renderTable([], resourceList.columns)).toBe("(none)\n");
});
