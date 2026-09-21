import { describe, expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import { phoneLineOf } from "./phoneLine";

type Facts = Pick<TicketSummary, "prRows" | "waitsOn" | "ready" | "releases">;

const pr = (number: number, state: TicketPr["state"] = "open") => ({ number, state }) as TicketPr;

const dependency = (identifier: string, isQuestion = false) => ({
	identifier,
	title: identifier,
	status: "todo" as const,
	isQuestion,
});

const release = (identifier: string) => ({ identifier, title: identifier });

const ticket = (facts: Partial<Facts> = {}): Facts => ({
	prRows: [],
	waitsOn: [],
	ready: false,
	releases: [],
	...facts,
});

const asks = { words: "crisp-fjord asks: Which cap?", asks: true, working: false };

describe("phoneLineOf", () => {
	test("prints what the run says ahead of every other fact", () => {
		const facts = ticket({ prRows: [pr(11)], waitsOn: [dependency("OP-32")], releases: [release("OP-40")] });

		expect(phoneLineOf(facts, asks)).toEqual({ kind: "agent", line: asks });
	});

	test("prints the open pull request when the run says nothing", () => {
		const facts = ticket({ prRows: [pr(10, "closed"), pr(11)], releases: [release("OP-40")] });

		expect(phoneLineOf(facts, null)).toEqual({ kind: "pr", pr: pr(11) });
	});

	test("prints the first pull request when none is open", () => {
		const facts = ticket({ prRows: [pr(10, "merged"), pr(11, "closed")] });

		expect(phoneLineOf(facts, null)).toEqual({ kind: "pr", pr: pr(10, "merged") });
	});

	test("prints the tickets it waits on in the words of the waits cell", () => {
		const facts = ticket({ waitsOn: [dependency("OP-32"), dependency("OP-33", true), dependency("OP-34")] });

		expect(phoneLineOf(facts, null)).toEqual({ kind: "waits", words: "waits on OP-32 · OP-33 asks +1" });
	});

	test("prints how many tickets wait for it last", () => {
		const facts = ticket({ releases: [release("OP-40"), release("OP-41")] });

		expect(phoneLineOf(facts, null)).toEqual({ kind: "releases", words: "releases 2" });
	});

	test("prints no line for a ticket that holds none of the four facts", () => {
		expect(phoneLineOf(ticket({ ready: true }), null)).toBeNull();
	});
});
