import { describe, expect, test } from "bun:test";
import { ulid } from "../test/fixtures.ts";
import { ActorHeaderSchema, ProjectRefSchema, StatusRefSchema, TicketRefSchema } from "./refs.ts";

const lowerUlid = ulid.toLowerCase();

describe("TicketRefSchema", () => {
	test("TicketRef accepts KEY-n and ULID and folds case", () => {
		const identifier = { kind: "identifier", key: "CDE", number: 42 };
		expect(TicketRefSchema.parse("CDE-42")).toEqual(identifier);
		expect(TicketRefSchema.parse("cde-42")).toEqual(identifier);
		expect(TicketRefSchema.canonicalize("cde-42")).toBe("CDE-42");
		expect(TicketRefSchema.canonicalize("CDE-42")).toBe("CDE-42");
		expect(TicketRefSchema.parse(lowerUlid)).toEqual({ kind: "ulid", id: ulid });
		expect(TicketRefSchema.canonicalize(lowerUlid)).toBe(ulid);
	});

	test("TicketRef rejects a bare key, a zero number, a short key, and a bad ULID", () => {
		for (const input of ["CDE", "CDE-0", "CDE-", "C-1", "1CDE-1", "CDE-1-2", ulid.slice(0, 25), ""]) {
			expect(TicketRefSchema.safeParse(input).success, input).toBe(false);
		}
	});

	// A number above 2^53 loses digits in a JavaScript number, so the
	// canonical spelling would name another ticket. Ten digits always fit.
	test("TicketRef keeps every digit of a 10-digit number and rejects a longer one", () => {
		expect(TicketRefSchema.parse("CDE-9999999999")).toEqual({ kind: "identifier", key: "CDE", number: 9999999999 });
		expect(TicketRefSchema.canonicalize("cde-9999999999")).toBe("CDE-9999999999");
		for (const input of ["CDE-9007199254740993", `CDE-${"9".repeat(309)}`]) {
			expect(TicketRefSchema.safeParse(input).success, input).toBe(false);
		}
	});
});

describe("ProjectRefSchema", () => {
	test("ProjectRef accepts KEY, KEY.slug.slug, and ULID with canonical output", () => {
		expect(ProjectRefSchema.parse("cde")).toEqual({ kind: "identifier", key: "CDE", slugs: [] });
		expect(ProjectRefSchema.canonicalize("cde")).toBe("CDE");
		expect(ProjectRefSchema.parse("cde.Web.Auth")).toEqual({ kind: "identifier", key: "CDE", slugs: ["web", "auth"] });
		expect(ProjectRefSchema.canonicalize("cde.Web.Auth")).toBe("CDE.web.auth");
		expect(ProjectRefSchema.parse(lowerUlid)).toEqual({ kind: "ulid", id: ulid });
		expect(ProjectRefSchema.canonicalize(lowerUlid)).toBe(ulid);
	});

	// `board`, `table`, and `settings` are reserved: `/p/CDE/board`,
	// `/p/CDE/table`, and `/p/CDE/settings` are web routes, so no sub-project
	// may take those slugs. A key has at most 10 characters.
	test("ProjectRef rejects empty slugs, bad slug characters, reserved slugs, a ticket ref, and a long key", () => {
		for (const input of [
			"CDE.",
			"CDE..web",
			"CDE.web.",
			"CDE.Web_Auth",
			"CDE-42",
			"CDE.board",
			"CDE.table",
			"CDE.settings",
			"ABCDEFGHIJK",
		]) {
			expect(ProjectRefSchema.safeParse(input).success, input).toBe(false);
		}
	});
});

describe("StatusRefSchema", () => {
	test("StatusRef accepts slug, name, category:<category>, and ULID with canonical output", () => {
		expect(StatusRefSchema.parse("in-progress")).toEqual({ kind: "identifier", value: "in-progress" });
		expect(StatusRefSchema.canonicalize("in-progress")).toBe("in-progress");
		expect(StatusRefSchema.parse("In Progress")).toEqual({ kind: "identifier", value: "In Progress" });
		expect(StatusRefSchema.canonicalize("In Progress")).toBe("in progress");
		expect(StatusRefSchema.parse("category:review")).toEqual({ kind: "category", category: "review" });
		expect(StatusRefSchema.parse("CATEGORY:Review")).toEqual({ kind: "category", category: "review" });
		expect(StatusRefSchema.canonicalize("CATEGORY:Review")).toBe("category:review");
		expect(StatusRefSchema.parse(lowerUlid)).toEqual({ kind: "ulid", id: ulid });
		expect(StatusRefSchema.canonicalize(lowerUlid)).toBe(ulid);
	});

	// The only colon form is `category:<todo|started|review|done|canceled>`.
	test("StatusRef rejects an unknown category, an empty ref, a long name, and a stray colon", () => {
		for (const input of ["category:bogus", "category:", "", "a".repeat(41), "a:b"]) {
			expect(StatusRefSchema.safeParse(input).success, input).toBe(false);
		}
	});
});

describe("ActorHeaderSchema", () => {
	test("ActorHeader accepts human and agent names up to 64 chars", () => {
		const longName = "x".repeat(64);
		expect(ActorHeaderSchema.parse("human:Dana")).toEqual({ kind: "human", name: "Dana" });
		expect(ActorHeaderSchema.parse("agent:claude-code")).toEqual({ kind: "agent", name: "claude-code" });
		expect(ActorHeaderSchema.parse(`agent:${longName}`)).toEqual({ kind: "agent", name: longName });
		for (const input of ["human:Dana", "agent:claude-code", `agent:${longName}`]) {
			expect(ActorHeaderSchema.canonicalize(input)).toBe(input);
		}
	});

	// `system` is the poller's own actor and never comes from a client.
	test("ActorHeader rejects system, a colon in the name, an empty name, an upper-case kind, 65 chars, and non-printable or non-ASCII chars", () => {
		for (const input of [
			"system:x",
			"human:a:b",
			"human:",
			"Human:dana",
			`agent:${"x".repeat(65)}`,
			"agent:na\tme",
			"agent:ñ",
		]) {
			expect(ActorHeaderSchema.safeParse(input).success, JSON.stringify(input)).toBe(false);
		}
	});
});
