import { describe, expect, mock, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// `Link` reads the router of the page it renders in, and this test renders
// no router. The stand-in writes the path the real `Link` writes, so the
// test still proves which ticket each chain line opens. The rest of the
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

const { ChainBlock } = await import("./ChainBlock");

// The chain of OP-33 in section 2, screen 6 of
// docs/research/trellis-for-one-human-and-many-agents.md.
const op32: TicketSummary["waitsOn"][number] = {
	identifier: "OP-32",
	title: "Service: A routine run opens a chat and queues the turn",
	status: "review",
	isQuestion: false,
};

const op52: TicketSummary["waitsOn"][number] = {
	identifier: "OP-52",
	title: "Decision: a missed window, run it late or leave it missed",
	status: "review",
	isQuestion: true,
};

const waitsOn: TicketSummary["waitsOn"] = [op32, op52];

const releases: TicketSummary["releases"] = [
	{ identifier: "OP-35", title: "Service: A run whose webhook never came is closed" },
];

// OP-52 once a person picked option 1. The server leaves a done ticket out of
// `waitsOn`, so it reaches the page in its own field.
const answeredOp52 = {
	identifier: "OP-52",
	title: "Decision: a missed window, run it late or leave it missed",
	option: 1,
};

describe("ChainBlock", () => {
	test("prints each ticket it waits on with the title and the status", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={waitsOn} releases={releases} answeredQuestion={null} />);

		expect(html).toContain("Waits on");
		expect(html).toContain("OP-32");
		expect(html).toContain("Service: A routine run opens a chat and queues the turn");
		expect(html).toContain('data-category="review"');
		expect(html).toContain("Releases");
		expect(html).toContain("Service: A run whose webhook never came is closed");
	});

	test("derives the ready sentence and offers no control", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={waitsOn} releases={releases} answeredQuestion={null} />);

		expect(html).toContain("no. OP-32 is not merged, and OP-52 is open.");
		expect(html).not.toContain("<button");
	});

	test("marks the question line with the yellow dot and the words your answer", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={waitsOn} releases={releases} answeredQuestion={null} />);
		const question = html.slice(html.indexOf("OP-52"));

		expect(question).toContain("bg-warning");
		expect(question).toContain("your answer");
	});

	test("names the open question under Applies", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={waitsOn} releases={releases} answeredQuestion={null} />);

		expect(html).toContain("Applies");
		expect(html.indexOf("Applies")).toBeGreaterThan(html.indexOf("Releases"));
	});

	test("drops the Applies line when the ticket waits on no question", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={[op32]} releases={releases} answeredQuestion={null} />);

		expect(html).toContain("no. OP-32 is not merged.");
		expect(html).not.toContain("Applies");
	});

	test("prints nothing for a clause the chain leaves empty", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={[]} releases={releases} answeredQuestion={null} />);

		expect(html).toContain("nothing");
		expect(html).toContain("yes. No ticket holds this one back.");
	});

	test("names the answered question and the option a person picked", () => {
		const html = renderToStaticMarkup(
			<ChainBlock waitsOn={[op32]} releases={releases} answeredQuestion={answeredOp52} />,
		);

		expect(html).toContain("Applies");
		expect(html).toContain("answered:");
		expect(html).toContain("OP-52");
		expect(html).toContain("chose 1.");
	});

	test("names the open question and not the answered one while both exist", () => {
		const html = renderToStaticMarkup(
			<ChainBlock waitsOn={waitsOn} releases={releases} answeredQuestion={answeredOp52} />,
		);

		expect(html).toContain("open.");
		expect(html).not.toContain("answered:");
	});

	test("prints one line when the ticket has no chain", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={[]} releases={[]} answeredQuestion={null} />);

		expect(html).toContain("The ticket waits for nothing, and no ticket waits for it.");
		expect(html).not.toContain("Ready");
	});
});
