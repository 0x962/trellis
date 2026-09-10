import { describe, expect, test } from "bun:test";
import { parseSearch, serializeSearch, toListQuery, type View } from "./grammar";

const now = new Date("2026-09-09T12:00:00.000Z");

const dayMs = 24 * 60 * 60 * 1000;

// The defaults of the view fields. `parseSearch` fills them, and
// `serializeSearch` writes none of them.
const defaults = {
	sort: "-updatedAt",
	group: "status",
	scope: "subprojects",
	density: "comfortable",
	limit: 50,
} satisfies Partial<View>;

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

	// FL-1. Show completed off writes closed=hide; any other value is dropped.
	test("closed=hide round-trips, and any other value is dropped", () => {
		const view = parseSearch({ closed: "hide", group: "priority" });
		expect(view.closed).toBe("hide");
		expect(serializeSearch(view)).toBe("group=priority&closed=hide");
		expect(parseSearch({ closed: "show" })).not.toHaveProperty("closed");
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

// The plan's example URL: identical on the API, the web, and the CLI.
const exampleParams = { status: "in-progress,agent-review", parent: "none", ci: "fail", sort: "-updatedAt" };

// Serializes a view and parses the result, as a shared link would.
const roundTrip = (view: View) => parseSearch(Object.fromEntries(new URLSearchParams(serializeSearch(view))));

describe("features/filters/grammar: the table's filter grammar", () => {
	// Outcome 68
	test("parses the plan's example URL into the tickets.list query", () => {
		const view = parseSearch(exampleParams);
		expect(view.status).toEqual(["in-progress", "agent-review"]);
		expect(view.parent).toBe("none");
		expect(view.ci).toEqual(["fail"]);
		expect(view.sort).toBe("-updatedAt");
		expect(toListQuery(view, { now })).toEqual({
			status: ["in-progress", "agent-review"],
			parent: "none",
			ci: ["fail"],
			sort: "-updatedAt",
		});
	});

	// Outcome 69. `sort=-updatedAt` is the default, so the URL never carries it.
	test("serializes the query back to the same URL without defaults", () => {
		const url = serializeSearch(parseSearch(exampleParams));
		expect(url).toBe("status=in-progress,agent-review&parent=none&ci=fail");
		expect(url).not.toContain("sort=");
		expect(url).not.toContain("group=");
		expect(url).not.toContain("scope=");
	});

	// Outcome 70. `project` is a chip that narrows /all; `scope` says whether
	// its sub-projects count.
	test("round trips every filter field through the URL", () => {
		const view: View = {
			project: "CDE.web",
			status: ["in-progress", "agent-review"],
			priority: ["high", "urgent"],
			parent: "none",
			pr: "open",
			ci: ["fail", "pending"],
			updated: "7d",
			created: "24h",
			actor: "agent:claude-code",
			q: "oauth",
			sort: "-createdAt",
			group: "priority",
			scope: "subprojects",
			peek: "CDE-42",
			density: "compact",
			limit: 100,
		};
		expect(roundTrip(view)).toEqual(view);
		expect(roundTrip({ ...view, scope: "self" })).toEqual({ ...view, scope: "self" });
		expect(serializeSearch(view)).toContain("project=CDE.web");
	});

	// Outcome 71. `not` names the fields whose set carries the leading `!`.
	test("keeps the is not negation through a round trip", () => {
		const view = parseSearch({ priority: "!none" });
		expect(view.priority).toEqual(["none"]);
		expect(view.not).toEqual(["priority"]);
		expect(serializeSearch(view)).toBe("priority=!none");
		expect(roundTrip(view)).toEqual(view);
		const plain = parseSearch({ priority: "none" });
		expect(plain.not).toBeUndefined();
		expect(serializeSearch(plain)).toBe("priority=none");
	});

	// The router validates a typed search again on every redirect and
	// navigate. A second parse must keep the negation of each field.
	test("parseSearch of a parsed negated view returns the same view", () => {
		for (const raw of [
			{ status: "!todo" },
			{ status: "!todo,done", priority: "!none" },
			{ project: "!CDE.web" },
			{ project: "!CDE.web", status: "!in-progress", priority: "high" },
		]) {
			const once = parseSearch(raw);
			expect(parseSearch(once as unknown as Record<string, unknown>), JSON.stringify(raw)).toEqual(once);
		}
	});

	// Outcome 72
	test("translates the relative time windows to ISO bounds and back", () => {
		const view = parseSearch({ updated: "7d", created: "24h" });
		const query = toListQuery(view, { now });
		expect(query.updated).toBe(new Date(now.getTime() - 7 * dayMs).toISOString());
		expect(query.created).toBe(new Date(now.getTime() - dayMs).toISOString());
		expect(serializeSearch(view)).toBe("updated=7d&created=24h");
		expect(roundTrip(view)).toEqual(view);
	});
});
