import { describe, expect, test } from "bun:test";
import type { EpicCounts } from "../schemas/epicCounts.ts";
import type { MilestoneSummary } from "../schemas/milestone.ts";
import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";
import {
	epicBandLine,
	epicCountLine,
	epicWaveHeading,
	pullRequestRowText,
	ticketReleasesText,
	ticketWaitsText,
} from "./epicText.ts";

const counts = (fields: Partial<EpicCounts> = {}): EpicCounts => ({
	total: 0,
	todo: 0,
	started: 0,
	review: 0,
	done: 0,
	canceled: 0,
	...fields,
});

const wave = (fields: Partial<MilestoneSummary> = {}): MilestoneSummary =>
	({
		name: "The run settles, and its state reaches the page",
		ref: "OP/routines-e2e/run-settles",
		counts: counts({ total: 6, todo: 6 }),
		toStart: 0,
		waitsForYou: 0,
		...fields,
	}) as MilestoneSummary;

const dependency = (identifier: string, isQuestion = false): TicketSummary["waitsOn"][number] => ({
	identifier,
	title: "A routine run opens a chat and queues the turn",
	status: "review",
	isQuestion,
});

const ticket = (fields: Partial<TicketSummary> = {}): TicketSummary =>
	({ ready: false, releases: [], waitsOn: [], ...fields }) as TicketSummary;

const pullRequest = (fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number: 57080,
		state: "open",
		isDraft: false,
		additions: 311,
		deletions: 12,
		changedFiles: 6,
		pass: 47,
		fail: 1,
		pending: 6,
		skipped: 0,
		openThreads: 0,
		flowRuns: [],
		stackedOn: null,
		...fields,
	}) as TicketPr;

describe("epicBandLine", () => {
	test("prints the progress of the bar and the legend under it", () => {
		expect(epicBandLine(counts({ total: 27, todo: 15, review: 9, done: 3 }))).toBe(
			"3 of 27 done · done 3 · review 9 · started 0 · todo 15 · canceled 0",
		);
	});

	test("leaves a canceled ticket out of the total", () => {
		expect(epicBandLine(counts({ total: 4, done: 1, canceled: 1, todo: 2 }))).toBe(
			"1 of 3 done · done 1 · review 0 · started 0 · todo 2 · canceled 1",
		);
	});
});

describe("epicCountLine", () => {
	test("counts what starts and what waits for the person", () => {
		expect(epicCountLine({ toStart: 0, waitsForYou: 4 })).toBe("0 to start · 4 wait for you");
	});

	test("says waits for one ticket", () => {
		expect(epicCountLine({ toStart: 2, waitsForYou: 1 })).toBe("2 to start · 1 waits for you");
	});
});

describe("epicWaveHeading", () => {
	test("marks the current wave and counts the tickets that wait for the person", () => {
		expect(epicWaveHeading(wave({ waitsForYou: 1 }), true)).toBe(
			"The run settles, and its state reaches the page (OP/routines-e2e/run-settles)  current  0 of 6 · 1 for you",
		);
	});

	test("prints the done count alone for a wave that waits for nobody", () => {
		expect(epicWaveHeading(wave({ counts: counts({ total: 3, done: 3 }) }), false)).toBe(
			"The run settles, and its state reaches the page (OP/routines-e2e/run-settles)  3 of 3",
		);
	});
});

describe("ticketWaitsText", () => {
	test("prints no text for a ticket that waits for nothing and is not Todo", () => {
		expect(ticketWaitsText(ticket())).toBe("");
	});

	test("prints ready for a Todo ticket that waits for nothing", () => {
		expect(ticketWaitsText(ticket({ ready: true }))).toBe("ready");
	});

	test("prints two identifiers and counts the rest", () => {
		const waitsOn = [dependency("OP-32"), dependency("OP-52"), dependency("OP-40")];
		expect(ticketWaitsText(ticket({ waitsOn }))).toBe("OP-32 · OP-52 +1");
	});

	test("says asks for a ticket that only a person can finish", () => {
		expect(ticketWaitsText(ticket({ waitsOn: [dependency("OP-32"), dependency("OP-52", true)] }))).toBe(
			"OP-32 · OP-52 asks",
		);
	});
});

describe("ticketReleasesText", () => {
	test("prints no text for a ticket that releases nothing", () => {
		expect(ticketReleasesText(ticket())).toBe("");
	});

	test("counts the tickets that wait for this one", () => {
		expect(
			ticketReleasesText(
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

describe("pullRequestRowText", () => {
	test("prints the state, the size, the checks and the turn", () => {
		expect(pullRequestRowText(pullRequest())).toBe(
			"#57080  open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · agent",
		);
	});

	test("names the pull request this one merges after", () => {
		const pr = pullRequest({
			isDraft: true,
			stackedOn: { number: 55569, headRef: "nk/operator-routine-execution", ticketIdentifier: "OP-32" },
			additions: 73,
			deletions: 9,
			changedFiles: 3,
			pass: 9,
			fail: 0,
			pending: 0,
		});
		expect(pullRequestRowText(pr)).toBe("#57080  draft · stacked on #55569 · +73 −9 · 3 files · 9 passed · agent");
	});

	test("gives the turn to the person when every check passed and no thread is open", () => {
		expect(
			pullRequestRowText(pullRequest({ fail: 0, pending: 0, changedFiles: 7, additions: 186, deletions: 44 })),
		).toBe("#57080  open · +186 −44 · 7 files · 47 passed · you");
	});

	test("gives the turn to GitHub while a check is pending", () => {
		expect(pullRequestRowText(pullRequest({ fail: 0 }))).toBe(
			"#57080  open · +311 −12 · 6 files · 6 pending · 47 passed · github",
		);
	});

	test("prints the open threads and the newest flow run", () => {
		const pr = pullRequest({ openThreads: 1, flowRuns: [{ status: "succeeded" }, { status: "failed" }] });
		expect(pullRequestRowText(pr)).toBe(
			"#57080  open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · 1 thread · flow: passed · agent",
		);
	});

	test("prints no turn for a merged pull request", () => {
		const pr = pullRequest({ state: "merged", fail: 0, pending: 0, additions: 0, deletions: 0, changedFiles: 0 });
		expect(pullRequestRowText(pr)).toBe("#57080  merged · 47 passed");
	});
});
