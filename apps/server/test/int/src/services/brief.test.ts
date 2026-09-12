import { describe, expect, test } from "bun:test";
import { IsoDateTimeSchema } from "@trellis/api";
import * as brief from "../../../../src/services/brief.ts";
import {
	claude,
	count,
	dana,
	linkPr,
	seedAttachment,
	seedChild,
	seedComment,
	seedPr,
	seedProject,
	seedTicket,
} from "../../../fixtures";
import { expectErrorData, ticketHarness } from "../../../helpers/services.ts";

const h = ticketHarness();

const get = (ticket: string) => h.as(dana)((ctx, tx) => brief.get(ctx, tx, { ticket }));

// Every markdown heading line, in order.
const headings = (markdown: string) => markdown.split("\n").filter((line) => /^#{1,6} /.test(line));

const lineWith = (markdown: string, text: string) => markdown.split("\n").find((line) => line.includes(text));

// A root with its six statuses, a sub-project `web`, parent CDE-41 "Auth
// epic" in the root, and CDE-42 "Fix login" in `web`, In Progress, high.
const seed = async (description = "Users get a 500 on login.") => {
	const { rootId, statuses } = await seedProject(h.db);
	const webId = await seedChild(h.db, rootId, rootId, "web");
	const parentId = await seedTicket(h.db, {
		projectId: rootId,
		rootId,
		statusId: statuses.todo,
		number: 41,
		title: "Auth epic",
	});
	const id = await seedTicket(h.db, {
		projectId: webId,
		rootId,
		statusId: statuses.started,
		number: 42,
		title: "Fix login",
		priority: "high",
		parentId,
		description,
	});
	return { rootId, statuses, webId, parentId, id };
};

describe("brief.get", () => {
	test("the brief header names the ticket, the parent, the branch, and the URL", async () => {
		await seed();
		const { result } = await get("CDE-42");
		const lines = result.markdown.split("\n");
		expect(lines[0]).toMatch(/^# CDE-42\b.*Fix login$/);
		const header = lines
			.slice(
				0,
				lines.findIndex((line, i) => i > 0 && /^#{1,6} /.test(line)),
			)
			.join("\n");
		for (const text of ["CDE.web", "In Progress", "high", "CDE-41", "Auth epic", "cde-42-fix-login", "/t/CDE-42"]) {
			expect(header).toContain(text);
		}
	});

	test("the brief carries the description verbatim", async () => {
		const description = "## Steps\n\n- open `/login`\n- submit\n\n```sh\nbun test\n```\n\n**Expected:** 200";
		await seed(description);
		const { result } = await get("CDE-42");
		expect(result.markdown).toContain(description);
	});

	test("the brief lists the sub-tickets with their statuses", async () => {
		const { rootId, webId, statuses, id } = await seed();
		const base = { projectId: webId, rootId, parentId: id };
		await seedTicket(h.db, { ...base, statusId: statuses.done, number: 44, title: "Add the test" });
		await seedTicket(h.db, { ...base, statusId: statuses.todo, number: 43, title: "Trace the error" });
		const { result } = await get("CDE-42");
		const first = lineWith(result.markdown, "CDE-43");
		const second = lineWith(result.markdown, "CDE-44");
		expect(first).toContain("Trace the error");
		expect(first).toContain("Todo");
		expect(second).toContain("Add the test");
		expect(second).toContain("Done");
		expect(result.markdown.indexOf("CDE-43")).toBeLessThan(result.markdown.indexOf("CDE-44"));
	});

	test("the brief lists the pull requests with the failing check names", async () => {
		const { id } = await seed();
		const checks = [
			{ name: "lint-strict", workflow: "ci", bucket: "fail", link: null },
			{ name: "typecheck-strict", workflow: "ci", bucket: "fail", link: null },
			{ name: "unit-green", workflow: "ci", bucket: "pass", link: null },
		];
		await linkPr(h.db, id, await seedPr(h.db, { number: 7, state: "open", ciState: "fail", checks }));
		const { result } = await get("CDE-42");
		for (const text of ["https://github.com/acme/web/pull/7", "open", "lint-strict", "typecheck-strict"]) {
			expect(result.markdown).toContain(text);
		}
		expect(result.markdown).not.toContain("unit-green");
	});

	test("the brief lists the attachments as URLs", async () => {
		const { id } = await seed();
		const a = await seedAttachment(h.db, id, { filename: "trace.log" });
		const b = await seedAttachment(h.db, id, { filename: "screen.png", mime: "image/png", sha256: "b".repeat(64) });
		const { result } = await get("CDE-42");
		expect(lineWith(result.markdown, "trace.log")).toContain(`/api/attachments/${a}/file`);
		expect(lineWith(result.markdown, "screen.png")).toContain(`/api/attachments/${b}/file`);
	});

	test("the brief holds the last 10 comments newest last", async () => {
		const { id } = await seed();
		for (let i = 1; i <= 12; i += 1) {
			const actor = i % 2 === 0 ? claude : dana;
			await seedComment(
				h.db,
				id,
				`note-${String(i).padStart(2, "0")}`,
				actor,
				new Date(Date.now() - (13 - i) * 60_000),
			);
		}
		const { result } = await get("CDE-42");
		expect(result.markdown).not.toContain("note-01");
		expect(result.markdown).not.toContain("note-02");
		for (let i = 3; i <= 12; i += 1) expect(result.markdown).toContain(`note-${String(i).padStart(2, "0")}`);
		expect(result.markdown.indexOf("note-03")).toBeLessThan(result.markdown.indexOf("note-12"));
		for (const text of ["dana", "human", "claude", "agent"]) expect(result.markdown).toContain(text);
	});

	test("the brief omits the empty sections", async () => {
		await seed();
		const { result } = await get("CDE-42");
		const found = headings(result.markdown);
		expect(found).toHaveLength(3);
		for (const heading of found) expect(heading).not.toMatch(/sub-ticket|pull request|attachment|comment/i);
	});

	test("the brief ends with the fixed protocol section", async () => {
		await seed();
		const { result } = await get("CDE-42");
		const protocol = result.markdown.slice(result.markdown.lastIndexOf("\n#"));
		for (const text of [
			"trellis move CDE-42",
			"trellis comment CDE-42",
			"trellis pr add CDE-42",
			"trellis sub CDE-42",
		]) {
			expect(protocol).toContain(text);
		}
		expect(protocol).toContain("agent-review");
		expect(protocol).toMatch(/(never|do not)[^.\n]*\bdone\b/i);
	});

	test("the brief output is byte-stable for the same state", async () => {
		const { id } = await seed();
		await seedComment(h.db, id, "one");
		await linkPr(h.db, id, await seedPr(h.db, { number: 7 }));
		const { result: first } = await get("CDE-42");
		const { result: second } = await get("CDE-42");
		expect(second.markdown).toBe(first.markdown);
		expect(IsoDateTimeSchema.safeParse(first.generatedAt).success).toBe(true);
		expect(IsoDateTimeSchema.safeParse(second.generatedAt).success).toBe(true);
	});

	test("the brief writes nothing and emits nothing", async () => {
		await seed();
		const { events } = await get("CDE-42");
		expect(events).toEqual([]);
		expect(await count(h.db, "activity")).toBe(0);
	});

	test("the brief with an unknown ref throws NOT_FOUND", async () => {
		await seed();
		const data = await expectErrorData(get("CDE-999"), "NOT_FOUND");
		expect(data).toEqual({ kind: "ticket", ref: "CDE-999" });
	});
});
