import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { groupRows } from "./groupRows";

const ticket = (id: string, epic: TicketSummary["epic"], milestone: TicketSummary["milestone"] = null) =>
	({
		id,
		epic,
		milestone,
		priority: "none",
		status: { category: "todo" },
		updatedAt: "2026-09-18T00:00:00.000Z",
	}) as TicketSummary;

const runtime = { id: "01EPICRUNTIME0000000000000", ref: "OP/routine-runtime", name: "Routine runtime" };
const billing = { id: "01EPICBILLING0000000000000", ref: "OP/billing", name: "Billing" };

describe("groupRows by epic", () => {
	test("labels each group with the epic name, No epic last", () => {
		const rows = [ticket("a", null), ticket("b", runtime), ticket("c", billing), ticket("d", runtime)];

		const groups = groupRows(rows, { group: "epic", sort: "-updatedAt", statuses: [] });

		expect(groups.map((group) => group.label)).toEqual(["Billing", "Routine runtime", "No epic"]);
		expect(groups.map((group) => group.key)).toEqual([billing.id, runtime.id, "none"]);
		expect(groups[1]!.rows.map((row) => row.id).sort()).toEqual(["b", "d"]);
	});

	test("No epic follows a name that starts with a non-ASCII letter", () => {
		const uebersicht = { id: "01EPICUEBERSICHT00000000000", ref: "OP/ubersicht", name: "Übersicht" };
		const rows = [ticket("a", null), ticket("b", uebersicht), ticket("c", billing)];

		const groups = groupRows(rows, { group: "epic", sort: "-updatedAt", statuses: [] });

		expect(groups.map((group) => group.label)).toEqual(["Billing", "Übersicht", "No epic"]);
	});

	test("orders names without regard to case", () => {
		const auth = { id: "01EPICAUTH0000000000000000", ref: "OP/auth", name: "auth" };
		const zoning = { id: "01EPICZONING00000000000000", ref: "OP/zoning", name: "Zoning" };
		const rows = [ticket("a", zoning), ticket("b", billing), ticket("c", auth)];

		const groups = groupRows(rows, { group: "epic", sort: "-updatedAt", statuses: [] });

		expect(groups.map((group) => group.label)).toEqual(["auth", "Billing", "Zoning"]);
	});

	test("puts every row without an epic in one group", () => {
		const rows = [ticket("a", null), ticket("b", null)];

		const groups = groupRows(rows, { group: "epic", sort: "-updatedAt", statuses: [] });

		expect(groups).toHaveLength(1);
		expect(groups[0]!.key).toBe("none");
		expect(groups[0]!.rows).toHaveLength(2);
	});
});

const phase1 = { id: "01MILESTONEPHASE1000000000", ref: "OP/routine-runtime/phase-1", name: "Phase 1" };
const phase2 = { id: "01MILESTONEPHASE2000000000", ref: "OP/routine-runtime/phase-2", name: "Phase 2" };
const alpha = { id: "01MILESTONEALPHA0000000000", ref: "OP/routine-runtime/alpha", name: "Alpha" };

describe("groupRows by milestone", () => {
	test("follows the milestone order, not the names, No milestone last", () => {
		const rows = [
			ticket("a", runtime),
			ticket("b", runtime, alpha),
			ticket("c", runtime, phase2),
			ticket("d", runtime, phase1),
			ticket("e", runtime, phase2),
		];

		const groups = groupRows(rows, {
			group: "milestone",
			sort: "-updatedAt",
			statuses: [],
			milestoneOrder: [phase1.id, phase2.id, alpha.id],
		});

		expect(groups.map((group) => group.label)).toEqual(["Phase 1", "Phase 2", "Alpha", "No milestone"]);
		expect(groups.map((group) => group.key)).toEqual([phase1.id, phase2.id, alpha.id, "none"]);
		expect(groups[1]!.rows.map((row) => row.id).sort()).toEqual(["c", "e"]);
	});

	test("puts a milestone outside the order after the list and before No milestone", () => {
		const rows = [ticket("a", null), ticket("b", runtime, alpha), ticket("c", runtime, phase1)];

		const groups = groupRows(rows, {
			group: "milestone",
			sort: "-updatedAt",
			statuses: [],
			milestoneOrder: [phase1.id],
		});

		expect(groups.map((group) => group.label)).toEqual(["Phase 1", "Alpha", "No milestone"]);
	});

	test("puts every row without a milestone in one group", () => {
		const rows = [ticket("a", null), ticket("b", runtime)];

		const groups = groupRows(rows, { group: "milestone", sort: "-updatedAt", statuses: [] });

		expect(groups).toHaveLength(1);
		expect(groups[0]!.key).toBe("none");
		expect(groups[0]!.rows).toHaveLength(2);
	});

	test("keeps a milestone whose rows are all closed, with the milestone link, and puts closed rows last", () => {
		const closed = (id: string, category: "done" | "canceled", milestone: TicketSummary["milestone"]) =>
			({ ...ticket(id, runtime, milestone), status: { category } }) as TicketSummary;
		const rows = [
			closed("a", "done", phase2),
			ticket("b", runtime, phase2),
			closed("c", "canceled", phase2),
			closed("d", "done", phase1),
		];

		const groups = groupRows(rows, {
			group: "milestone",
			sort: "-updatedAt",
			statuses: [],
			milestoneOrder: [phase1.id, phase2.id],
		});

		expect(groups.map((group) => group.label)).toEqual(["Phase 1", "Phase 2"]);
		expect(groups[0]!.milestone).toEqual(phase1);
		expect(groups[1]!.rows[0]!.id).toBe("b");
		expect(
			groups[1]!.rows
				.slice(1)
				.map((row) => row.id)
				.sort(),
		).toEqual(["a", "c"]);
	});
});
