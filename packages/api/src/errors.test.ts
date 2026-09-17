import { describe, expect, test } from "bun:test";
import { statusSummary, ticket } from "../test/fixtures.ts";
import { errors } from "./errors.ts";

describe("errors", () => {
	test("every error code from the plan exists with its HTTP status", () => {
		const pairs = Object.entries(errors)
			.map(([code, definition]) => [code, definition.status])
			.sort(([a], [b]) => String(a).localeCompare(String(b)));
		expect(pairs).toEqual([
			["ACTOR_INVALID", 400],
			["ACTOR_REQUIRED", 400],
			["AGENT_CANNOT_DELETE", 403],
			["COMMENT_HAS_REPLIES", 409],
			["COMMENT_PARENT_MISMATCH", 409],
			["CROSS_ROOT_MOVE", 409],
			["DUPLICATE", 409],
			["FLOW_VERSION_CONFLICT", 412],
			["GH_UNAVAILABLE", 503],
			["INPUT_VALIDATION_FAILED", 400],
			["INVALID_ANCHOR", 409],
			["INVALID_CURSOR", 400],
			["INVALID_PR_URL", 400],
			["KEY_LOCKED", 409],
			["LAST_STATUS", 409],
			["NOT_FOUND", 404],
			["PARENT_CYCLE", 409],
			["PAYLOAD_TOO_LARGE", 413],
			["PROJECT_ARCHIVED", 409],
			["PROJECT_NOT_EMPTY", 409],
			["RESTART_FAILED", 503],
			["REVIEW_VERSION_CONFLICT", 412],
			["ROOT_STATUSES", 409],
			["RUNNER_UNAVAILABLE", 503],
			["STATUS_CATEGORY_IMMUTABLE", 409],
			["STATUS_FULL", 409],
			["STATUS_IN_USE", 409],
			["STATUS_NOT_IN_PROJECT", 409],
			["VERSION_CONFLICT", 412],
		]);
	});

	// `data` is what a client reads to recover: the valid statuses, the current
	// row, the field that collides. An empty object carries none of it.
	test("error data schemas accept the plan's payloads and reject an empty object", () => {
		const cases: Array<[keyof typeof errors, unknown]> = [
			["NOT_FOUND", { kind: "ticket", ref: "CDE-9" }],
			["DUPLICATE", { field: "key" }],
			["STATUS_IN_USE", { count: 3 }],
			["VERSION_CONFLICT", { current: ticket() }],
			["STATUS_NOT_IN_PROJECT", { valid: [statusSummary()] }],
			["GH_UNAVAILABLE", { reason: "missing" }],
			["INPUT_VALIDATION_FAILED", { issues: [{ message: "Required", path: ["title"] }] }],
		];
		for (const [code, payload] of cases) {
			const schema = errors[code].data;
			expect(schema.safeParse(payload).success, code).toBe(true);
			expect(schema.safeParse({}).success, code).toBe(false);
		}
	});

	// STATUS_FULL reports the destination status and its ticket count.
	test("runner errors identify the failure and status limits report the ticket count", () => {
		for (const reason of ["missing", "disabled", "unmapped", "outdated", "error"]) {
			expect(errors.RUNNER_UNAVAILABLE.data.safeParse({ reason }).success, reason).toBe(true);
		}
		expect(errors.RUNNER_UNAVAILABLE.data.safeParse({ reason: "busy" }).success).toBe(false);
		expect(errors.RUNNER_UNAVAILABLE.data.safeParse({}).success).toBe(false);
		expect(errors.STATUS_FULL.data.safeParse({ statusId: "s1", limit: 9, count: 9 }).success).toBe(true);
		expect(errors.STATUS_FULL.data.safeParse({ statusId: "s1", limit: 0, count: 0 }).success).toBe(false);
		expect(errors.STATUS_FULL.data.safeParse({ statusId: "s1", limit: 9 }).success).toBe(false);
	});

	// Two services throw INVALID_ANCHOR: a ticket move, and a project
	// reorder. A project reorder holds no ticket and no column, so the
	// sentence names an item and a list.
	test("the invalid anchor sentence fits a ticket move and a project reorder", () => {
		expect(errors.INVALID_ANCHOR.message).toBe("The after or before item is not in the target list.");
	});
});
