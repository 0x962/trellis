import { expect, test } from "bun:test";
import { waitingTicket, waveTicket } from "../waveFixture";
import { unfinishedDependencies, waveTree } from "./waveTree";

test("nests dependents even when the table puts them before their prerequisites", () => {
	const [root] = waveTree([waitingTicket("TRL-3", "TRL-2"), waveTicket("TRL-1"), waitingTicket("TRL-2", "TRL-1")]);
	expect(root?.ticket.identifier).toBe("TRL-1");
	expect(root?.children[0]?.ticket.identifier).toBe("TRL-2");
	expect(root?.children[0]?.children[0]?.ticket.identifier).toBe("TRL-3");
});

test("shows a shared dependent once and retains all of its blockers", () => {
	const tree = waveTree([waveTicket("TRL-1"), waveTicket("TRL-2"), waitingTicket("TRL-3", "TRL-1", "TRL-2", "EXT-4")]);
	expect(tree).toHaveLength(2);
	expect(tree[0]?.children).toHaveLength(1);
	expect(tree[1]?.children).toHaveLength(0);
	expect(unfinishedDependencies(tree[0]!.children[0]!.ticket).map((ticket) => ticket.identifier)).toEqual([
		"TRL-1",
		"TRL-2",
		"EXT-4",
	]);
});

test("keeps a ticket with only external prerequisites visible at the root", () => {
	const [root] = waveTree([waitingTicket("TRL-1", "EXT-2")]);
	expect(root?.ticket.identifier).toBe("TRL-1");
	expect(root?.ticket.waitsOn[0]?.identifier).toBe("EXT-2");
});

test("completed and canceled prerequisites do not block or indent ready tickets", () => {
	const ready = waveTicket("TRL-3", {
		waitsOn: [
			{ identifier: "TRL-1", title: "Done", status: "done" },
			{ identifier: "TRL-2", title: "Canceled", status: "canceled" },
		],
	});
	expect(unfinishedDependencies(ready)).toEqual([]);
	expect(waveTree([waveTicket("TRL-1"), waveTicket("TRL-2"), ready])).toHaveLength(3);
});
