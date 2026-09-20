import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "../schemas/ticket.ts";
import { ticketReleasesCell, ticketWaitsCell } from "./ticketCells.ts";

const dependency = (identifier: string, isQuestion = false): TicketSummary["waitsOn"][number] => ({
	identifier,
	title: "A routine run opens a chat and queues the turn",
	status: "review",
	isQuestion,
});

const ticket = (fields: Partial<TicketSummary> = {}): TicketSummary =>
	({ ready: false, releases: [], waitsOn: [], ...fields }) as TicketSummary;

describe("ticketWaitsCell", () => {
	test("prints no text for a ticket that waits for nothing and is not Todo", () => {
		expect(ticketWaitsCell(ticket())).toBe("");
	});

	test("prints ready for a Todo ticket that waits for nothing", () => {
		expect(ticketWaitsCell(ticket({ ready: true }))).toBe("ready");
	});

	test("prints two identifiers and counts the rest", () => {
		const waitsOn = [dependency("OP-32"), dependency("OP-52"), dependency("OP-40")];
		expect(ticketWaitsCell(ticket({ waitsOn }))).toBe("OP-32 · OP-52 +1");
	});

	test("says asks for a ticket that only a person can finish", () => {
		expect(ticketWaitsCell(ticket({ waitsOn: [dependency("OP-32"), dependency("OP-52", true)] }))).toBe(
			"OP-32 · OP-52 asks",
		);
	});
});

describe("ticketReleasesCell", () => {
	test("prints no text for a ticket that releases nothing", () => {
		expect(ticketReleasesCell(ticket())).toBe("");
	});

	test("counts the tickets that wait for this one", () => {
		expect(
			ticketReleasesCell(
				ticket({
					releases: [
						{ identifier: "OP-33", title: "One routine's failure does not end the sweep pass" },
						{ identifier: "OP-34", title: "The webhook settles the routine run" },
					],
				}),
			),
		).toBe("2");
	});
});
