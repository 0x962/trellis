import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { groupRows } from "./groupRows";

const ticket = (id: string, epic: TicketSummary["epic"]) =>
	({
		id,
		epic,
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
