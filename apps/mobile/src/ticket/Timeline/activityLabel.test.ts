import { describe, expect, test } from "bun:test";
import { activityActions } from "@trellis/api";
import { activity, claude, dana, id } from "../../../test/fixtures";
import { describeActivity, describeRun } from "./activityLabel";

const prUrl = "https://github.com/acme/web/pull/118";

describe("describeActivity", () => {
	// The server writes `ticket.created`, not `created`. A row it does not
	// name reads "changed null", which is what the screen showed before.
	test("names the create row by the action the server writes", () => {
		const item = activity({ action: activityActions.created, field: null, fromValue: null, toValue: null });
		expect(describeActivity(item)).toBe("created the ticket");
	});

	test("names every row that carries no field by its action and its meta", () => {
		const rows: Array<[string, Record<string, unknown>, string]> = [
			["pr.linked", { url: prUrl }, "linked PR web #118"],
			["pr.unlinked", { url: prUrl }, "unlinked PR web #118"],
			["pr.state_changed", { from: "open/pending", to: "open/fail" }, "PR open/pending → open/fail"],
			["pr.reviewed", { url: prUrl, action: "approve" }, "approved PR web #118"],
			["pr.reviewed", { url: prUrl, action: "comment" }, "commented on PR web #118"],
			["pr.reviewed", { url: prUrl, action: "request_changes" }, "requested changes on PR web #118"],
			["pr.actioned", { url: prUrl, action: "merge" }, "merged PR web #118"],
			["attachment.created", { filename: "shot.png" }, "attached shot.png"],
			["attachment.deleted", { filename: "shot.png" }, "removed shot.png"],
			["comment.updated", { resolved: true }, "resolved a comment thread"],
			["comment.updated", { resolved: false }, "reopened a comment thread"],
			["comment.updated", {}, "edited a comment"],
			["comment.deleted", {}, "deleted a comment"],
		];
		for (const [action, meta, text] of rows) {
			const item = activity({ action, field: null, fromValue: null, toValue: null, meta });
			expect(describeActivity(item)).toBe(text);
		}
	});

	test("names a field row by its field", () => {
		const cases: Array<[Parameters<typeof activity>[0], string]> = [
			[{ field: "status", fromValue: "Todo", toValue: "In Progress" }, "moved Todo → In Progress"],
			[{ field: "priority", toValue: "high" }, "set priority High"],
			[{ field: "parent", toValue: "CDE-43" }, "set parent CDE-43"],
			[{ field: "parent", toValue: null }, "cleared the parent"],
			[{ field: "title" }, "renamed the ticket"],
			[{ field: "description" }, "edited the description"],
			[{ field: "project", toValue: "CDE.web" }, "moved to CDE.web"],
			[{ field: "position" }, "moved in the column"],
		];
		for (const [overrides, text] of cases) expect(describeActivity(activity(overrides))).toBe(text);
	});

	// A field the app does not name still reads as a sentence.
	test("falls back to the field name, and to the ticket when there is none", () => {
		expect(describeActivity(activity({ field: "completedAt" }))).toBe("changed completedAt");
		expect(describeActivity(activity({ action: "status.remapped", field: null }))).toBe("changed the ticket");
	});
});

describe("describeRun", () => {
	test("lists the changed fields once", () => {
		const run = [activity({ id: 1, field: "priority" }), activity({ id: 2, field: "parent" })];
		expect(describeRun(run)).toBe("changed priority and parent");
	});

	// A file name and a PR say nothing as a field name, so each keeps its
	// own phrase.
	test("keeps the phrase of every row the action names", () => {
		const run = [
			activity({ id: 1, field: "priority" }),
			activity({ id: 2, action: "attachment.created", field: null, meta: { filename: "shot.png" } }),
			activity({ id: 3, action: "pr.linked", field: null, meta: { url: prUrl } }),
		];
		expect(describeRun(run)).toBe("changed priority, attached shot.png, and linked PR web #118");
	});

	test("joins two phrases with and", () => {
		const run = [
			activity({ id: 1, actor: dana, action: "attachment.created", field: null, meta: { filename: "a.png" } }),
			activity({ id: 2, actor: claude, action: "comment.deleted", field: null, meta: { commentId: id("C1") } }),
		];
		expect(describeRun(run)).toBe("attached a.png and deleted a comment");
	});
});
