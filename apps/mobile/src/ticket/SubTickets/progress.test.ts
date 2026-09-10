import { describe, expect, test } from "bun:test";
import { id, ticketSummary } from "../../../test/fixtures";
import { subTicketProgress } from "./progress";

const done = { id: id("S5"), slug: "done", name: "Done", category: "done", reviewer: null, color: "success" } as const;
const todo = { id: id("S1"), slug: "todo", name: "Todo", category: "todo", reviewer: null, color: "fg-faint" } as const;

describe("subTicketProgress", () => {
	// O6. The three children of CDE-42: two done, one todo.
	test("counts the done children and gives the share for the bar", () => {
		const children = [
			ticketSummary({ id: id("T8"), identifier: "CDE-48", number: 48, status: done }),
			ticketSummary({ id: id("T9"), identifier: "CDE-49", number: 49, status: done }),
			ticketSummary({ id: id("TA"), identifier: "CDE-50", number: 50, status: todo }),
		];
		expect(subTicketProgress(children)).toEqual({ done: 2, total: 3, share: 2 / 3 });
	});

	// O7.
	test("a ticket without children has no progress", () => {
		expect(subTicketProgress([])).toBeNull();
	});
});
