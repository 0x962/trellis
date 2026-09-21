import { describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Ticket, TicketAnswerDelivery } from "@trellis/api";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { answerResult } from "./answerResult";

// `Link` reads the router of the page it renders in, and this test renders
// no router. The stand-in writes the path the real `Link` writes, so the
// test still proves which ticket each release line opens. The rest of the
// module stays real, because `mock.module` replaces the whole module, and
// other test files in the same run import `notFound` and the route helpers
// from it.
const router = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
	...router,
	Link: ({
		params,
		className,
		children,
	}: {
		params: { identifier: string };
		className?: string;
		children?: ReactNode;
	}) => (
		<a href={`/t/${params.identifier}`} className={className}>
			{children}
		</a>
	),
}));

const { QuestionBlock } = await import("./QuestionBlock");

// Before a click on `Answer`, the block reads only the query client from the
// app context. The test gives that one field.
const app = { queryClient: new QueryClient() } as AppContext;

// OP-52 of section 2, screen 7 in
// docs/research/trellis-for-one-human-and-many-agents.md. A question opens
// its description with the option list, which is the rule
// apps/server/src/db/queries/chainRows.ts runs in SQL.
const description = [
	"Options:",
	"1. Leave it missed. Write a RoutineRun with a missed state so the person sees the gap.",
	"2. Run it late. The sweep starts every due moment it finds, however old.",
	"",
	"Recommendation: option 1. A night audit that runs at 09:00 reads a different day than the one it",
	"was written for.",
].join("\n");

const ticket = {
	identifier: "OP-52",
	title: "Decision: a missed window, run it late or leave it missed",
	description,
	version: 3,
	lastActor: { name: "crisp-fjord", kind: "agent", displayName: "Agent", at: "2026-09-19T08:00:00.000Z" },
	releases: [{ identifier: "OP-33", title: "Service: One routine's failure does not end the sweep pass" }],
} as Ticket;

const render = (overrides: Partial<Ticket> = {}) =>
	renderToStaticMarkup(
		<QueryClientProvider client={app.queryClient}>
			<AppProvider value={app}>
				<QuestionBlock ticket={{ ...ticket, ...overrides }} />
			</AppProvider>
		</QueryClientProvider>,
	);

const delivery = (ticketIdentifier: string, agentName: string) =>
	({ ticket: ticketIdentifier, runId: "01M30E5QKBJ8HGSA9TQGTPMHTW", agentName }) as TicketAnswerDelivery;

describe("QuestionBlock", () => {
	test("reads the numbered options out of the description", () => {
		const html = render();

		expect(html).toContain("1. Leave it missed.");
		expect(html).toContain("2. Run it late.");
		expect(html).not.toContain("Options:");
	});

	test("reads the numbered options after prose and a blank line", () => {
		const html = render({
			description: `The run needs a bound.\n\n${description.replace("Options:\n", "Options:\n\n")}`,
		});

		expect(html).toContain("1. Leave it missed.");
		expect(html).toContain("2. Run it late.");
	});

	test("prints the recommendation and names nobody as its author", () => {
		const html = render();

		expect(html).toContain("Recommended.");
		expect(html).toContain("Why option 1 is recommended");
		expect(html).toContain("A night audit that runs at 09:00 reads a different day than the one it was written for.");
	});

	test("names no author even when an agent touched the ticket last", () => {
		const html = render();

		expect(html).not.toContain("crisp-fjord");
		expect(html).not.toContain("recommends this one");
	});

	test("reads no option from the paragraph under the recommendation", () => {
		const html = render({
			description: [
				"Options:",
				"1. Leave it missed.",
				"2. Run it late.",
				"",
				"Recommendation: option 1. Two reasons:",
				"1. A late run reads the wrong day.",
				"2. A backlog holds the next tick.",
			].join("\n"),
		});

		// The numbered lines under the recommendation stay in its paragraph.
		// Two radios means two options, and the reason keeps its own words.
		expect(html.split('role="radio"').length - 1).toBe(2);
		expect(html).toContain("Two reasons: 1. A late run reads the wrong day. 2. A backlog holds the next tick.");
	});

	test("opens each released ticket on its own page", () => {
		const html = render();

		expect(html).toContain('href="/t/OP-33"');
		expect(html).toContain("Service: One routine&#x27;s failure does not end the sweep pass");
	});

	test("offers one Answer and writes the word decide nowhere", () => {
		const html = render();

		expect(html.split("Answer</").length - 1).toBe(1);
		expect(html.toLowerCase()).not.toContain("decide");
	});

	test("names the question, the run and the ticket that got the answer", () => {
		expect(answerResult("OP-52", [delivery("OP-33", "crisp-fjord")])).toBe(
			"OP-52 is done. crisp-fjord on OP-33 has the answer.",
		);
	});

	test("names every run that got the answer", () => {
		expect(answerResult("OP-52", [delivery("OP-33", "crisp-fjord"), delivery("OP-40", "warm-brook")])).toBe(
			"OP-52 is done. crisp-fjord on OP-33, and warm-brook on OP-40 have the answer.",
		);
	});

	test("says so when the answer reached no run", () => {
		expect(answerResult("OP-52", [])).toBe("OP-52 is done. No agent was running on a ticket this answer releases.");
	});
});
