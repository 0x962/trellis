import { describe, expect, test } from "bun:test";
import { parseSearch, serializeSearch, toListQuery, type View } from "./grammar";

const now = new Date("2026-09-09T12:00:00.000Z");

const dayMs = 24 * 60 * 60 * 1000;

// The defaults of the view fields. `parseSearch` fills them, and
// `serializeSearch` writes none of them.
const defaults: View = { sort: "-updatedAt", group: "status", scope: "subprojects", density: "comfortable", limit: 50 };

describe("features/filters/grammar", () => {
	// WS-42. The URL grammar is the API grammar: comma lists become arrays
	// and single values pass through.
	test("parseSearch reads comma lists and single values of the shared grammar", () => {
		const view = parseSearch({ status: "in-progress,agent-review", parent: "none", ci: "fail", sort: "-updatedAt" });
		expect(view).toEqual({
			...defaults,
			status: ["in-progress", "agent-review"],
			parent: "none",
			ci: ["fail"],
		});
		for (const field of [
			"priority",
			"category",
			"reviewer",
			"pr",
			"actor",
			"q",
			"updated",
			"created",
			"completed",
			"peek",
		]) {
			expect(view, field).not.toHaveProperty(field);
		}
	});

	// WS-43. The plan example is identical on the three surfaces. The
	// params serialize in the grammar's own order, with commas unescaped.
	test("the codec round-trips the plan example and omits the default sort", () => {
		const params = { status: "in-progress,agent-review", parent: "none", ci: "fail", sort: "-updatedAt" };
		const view = parseSearch(params);
		expect(serializeSearch(view)).toBe("status=in-progress,agent-review&parent=none&ci=fail");
		expect(toListQuery(view, { now })).toEqual({
			status: ["in-progress", "agent-review"],
			parent: "none",
			ci: ["fail"],
			sort: "-updatedAt",
		});
		expect(parseSearch(Object.fromEntries(new URLSearchParams(serializeSearch(view))))).toEqual(view);
	});

	// WS-44
	test("every default serializes to nothing", () => {
		expect(serializeSearch(parseSearch({}))).toBe("");
		expect(
			serializeSearch(
				parseSearch({ sort: "-updatedAt", group: "status", scope: "subprojects", density: "comfortable", limit: "50" }),
			),
		).toBe("");
	});

	// WS-45. `scope=self` narrows the API query to the project itself.
	// `peek` is a ticket ref and takes its canonical spelling.
	test("group, scope, peek, and density round-trip and scope=self narrows the query", () => {
		const view = parseSearch({ group: "priority", scope: "self", peek: "cde-42", density: "compact" });
		expect(view.group).toBe("priority");
		expect(view.scope).toBe("self");
		expect(view.peek).toBe("CDE-42");
		expect(view.density).toBe("compact");
		expect(toListQuery(view, { now }).subprojects).toBe(false);
		expect(serializeSearch(view)).toBe("group=priority&scope=self&peek=CDE-42&density=compact");
	});

	// WS-46. The URL keeps the short form a person types; the API takes an
	// ISO instant, so the bound is computed from `now` at query time.
	test("relative time bounds stay short in the URL and become ISO in the query", () => {
		const week = parseSearch({ updated: "7d" });
		expect(week.updated).toBe("7d");
		expect(serializeSearch(week)).toBe("updated=7d");
		expect(toListQuery(week, { now }).updated).toBe(new Date(now.getTime() - 7 * dayMs).toISOString());
		expect(toListQuery(parseSearch({ updated: "24h" }), { now }).updated).toBe(
			new Date(now.getTime() - dayMs).toISOString(),
		);
		expect(toListQuery(parseSearch({ created: "30d" }), { now }).created).toBe(
			new Date(now.getTime() - 30 * dayMs).toISOString(),
		);
		const iso = "2026-09-01T00:00:00.000Z";
		expect(toListQuery(parseSearch({ completed: iso }), { now }).completed).toBe(iso);
	});

	// WS-47. A hand-edited URL never crashes the route: an unknown value is
	// dropped and the field takes its default.
	test("an invalid search value falls back to the default", () => {
		const view = parseSearch({ priority: "urgent,bogus", sort: "-title", density: "wide" });
		expect(view.priority).toEqual(["urgent"]);
		expect(view.sort).toBe("-updatedAt");
		expect(view.density).toBe("comfortable");
		expect(parseSearch({ status: "", limit: "abc", group: "nope" })).toEqual(defaults);
	});
});
