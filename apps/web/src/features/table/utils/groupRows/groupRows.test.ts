import { describe, expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import { groupRows } from "./groupRows";

const ticket = (id: string, epic: TicketSummary["epic"], wave: TicketSummary["wave"] = null) =>
	({
		id,
		epic,
		wave,
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

const phase1 = { id: "01WAVEPHASE1000000000", ref: "OP/routine-runtime/phase-1", name: "Phase 1" };
const phase2 = { id: "01WAVEPHASE2000000000", ref: "OP/routine-runtime/phase-2", name: "Phase 2" };
const alpha = { id: "01WAVEALPHA0000000000", ref: "OP/routine-runtime/alpha", name: "Alpha" };

describe("groupRows by wave", () => {
	test("follows the wave order, not the names, No wave last", () => {
		const rows = [
			ticket("a", runtime),
			ticket("b", runtime, alpha),
			ticket("c", runtime, phase2),
			ticket("d", runtime, phase1),
			ticket("e", runtime, phase2),
		];

		const groups = groupRows(rows, {
			group: "wave",
			sort: "-updatedAt",
			statuses: [],
			waveOrder: [phase1.id, phase2.id, alpha.id],
		});

		expect(groups.map((group) => group.label)).toEqual(["Phase 1", "Phase 2", "Alpha", "No wave"]);
		expect(groups.map((group) => group.key)).toEqual([phase1.id, phase2.id, alpha.id, "none"]);
		expect(groups[1]!.rows.map((row) => row.id).sort()).toEqual(["c", "e"]);
	});

	test("puts a wave outside the order after the list and before No wave", () => {
		const rows = [ticket("a", null), ticket("b", runtime, alpha), ticket("c", runtime, phase1)];

		const groups = groupRows(rows, {
			group: "wave",
			sort: "-updatedAt",
			statuses: [],
			waveOrder: [phase1.id],
		});

		expect(groups.map((group) => group.label)).toEqual(["Phase 1", "Alpha", "No wave"]);
	});

	test("puts every row without a wave in one group", () => {
		const rows = [ticket("a", null), ticket("b", runtime)];

		const groups = groupRows(rows, { group: "wave", sort: "-updatedAt", statuses: [] });

		expect(groups).toHaveLength(1);
		expect(groups[0]!.key).toBe("none");
		expect(groups[0]!.rows).toHaveLength(2);
	});

	test("keeps a wave whose rows are all closed, with the wave link, and puts closed rows last", () => {
		const closed = (id: string, category: "done" | "canceled", wave: TicketSummary["wave"]) =>
			({ ...ticket(id, runtime, wave), status: { category } }) as TicketSummary;
		const rows = [
			closed("a", "done", phase2),
			ticket("b", runtime, phase2),
			closed("c", "canceled", phase2),
			closed("d", "done", phase1),
		];

		const groups = groupRows(rows, {
			group: "wave",
			sort: "-updatedAt",
			statuses: [],
			waveOrder: [phase1.id, phase2.id],
		});

		expect(groups.map((group) => group.label)).toEqual(["Phase 1", "Phase 2"]);
		expect(groups[0]!.wave).toEqual(phase1);
		expect(groups[1]!.rows[0]!.id).toBe("b");
		expect(
			groups[1]!.rows
				.slice(1)
				.map((row) => row.id)
				.sort(),
		).toEqual(["a", "c"]);
	});
});

describe("groupRows with a row rank", () => {
	const at = (id: string, updatedAt: string) => ({ ...ticket(id, runtime, phase1), updatedAt }) as TicketSummary;
	const rows = [
		at("old", "2026-09-01T00:00:00.000Z"),
		at("new", "2026-09-03T00:00:00.000Z"),
		at("mid", "2026-09-02T00:00:00.000Z"),
	];

	test("the rank orders the rows of a group, and the view sort orders one rank", () => {
		const rowRank = (row: TicketSummary) => (row.id === "old" ? 0 : 1);

		const groups = groupRows(rows, { group: "wave", sort: "-updatedAt", statuses: [], rowRank });

		expect(groups[0]!.rows.map((row) => row.id)).toEqual(["old", "new", "mid"]);
	});

	test("the rank never moves a row to another group", () => {
		const other = ticket("other", runtime, phase2);
		const rowRank = (row: TicketSummary) => (row.id === "other" ? 0 : 1);

		const groups = groupRows([...rows, other], {
			group: "wave",
			sort: "-updatedAt",
			statuses: [],
			waveOrder: [phase1.id, phase2.id],
			rowRank,
		});

		expect(groups.map((group) => group.rows.map((row) => row.id))).toEqual([["new", "mid", "old"], ["other"]]);
	});

	test("no rank keeps the view sort alone", () => {
		const groups = groupRows(rows, { group: "wave", sort: "-updatedAt", statuses: [] });

		expect(groups[0]!.rows.map((row) => row.id)).toEqual(["new", "mid", "old"]);
	});
});

describe("groupRows by turn", () => {
	const turnRow = (id: string, fields: Partial<TicketSummary>) =>
		({ ...ticket(id, runtime, phase1), waitsOn: [], prRows: [], ready: false, ...fields }) as TicketSummary;
	const open = { number: 7, state: "open", isDraft: false, fail: 0, pending: 0, openThreads: 0 } as TicketPr;
	const humanReview = turnRow("human-review", {
		status: { category: "started", reviewer: "human" } as TicketSummary["status"],
	});
	const review = turnRow("review", { prRows: [open] });
	const draft = turnRow("draft", { prRows: [{ ...open, localState: "draft" }] });
	const blocked = turnRow("blocked", {
		status: { category: "todo" } as TicketSummary["status"],
		waitsOn: [{ identifier: "OP-32" } as TicketSummary["waitsOn"][number]],
	});

	test("draws the groups in the fixed order and renders no empty group", () => {
		const groups = groupRows([blocked, draft, review], { group: "turn", sort: "-updatedAt", statuses: [] });

		expect(groups.map((group) => group.label)).toEqual(["Your turn", "With an agent", "Waits on a merge"]);
		expect(groups.map((group) => group.key)).toEqual(["you", "agent", "waits-on-a-merge"]);
	});

	test("puts every row of one turn in one group", () => {
		const groups = groupRows([humanReview, review], { group: "turn", sort: "-updatedAt", statuses: [] });

		expect(groups).toHaveLength(1);
		expect(groups[0]!.rows.map((row) => row.id).sort()).toEqual(["human-review", "review"]);
	});

	test("a working agent run moves a row to the agent group", () => {
		const groups = groupRows([review], {
			group: "turn",
			sort: "-updatedAt",
			statuses: [],
			workingTicketIds: new Set(["review"]),
		});

		expect(groups.map((group) => group.label)).toEqual(["With an agent"]);
	});
});

describe("groupRows by pull request state", () => {
	test("puts a queued pull request in the queued group", () => {
		const queued = {
			...ticket("queued", runtime),
			pr: { state: "open", isDraft: false, isQueued: true },
		} as TicketSummary;
		const open = {
			...ticket("open", runtime),
			pr: { state: "open", isDraft: false, isQueued: false },
		} as TicketSummary;

		const groups = groupRows([queued, open], { group: "pr", sort: "-updatedAt", statuses: [] });

		expect(groups.map((group) => group.label)).toEqual(["Open PR", "Queued PR"]);
	});
});
