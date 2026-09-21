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
};

const op52: TicketSummary["waitsOn"][number] = {
	identifier: "OP-52",
	title: "Service: A missed window runs late",
	status: "started",
};

const waitsOn: TicketSummary["waitsOn"] = [op32, op52];

const releases: TicketSummary["releases"] = [
	{ identifier: "OP-35", title: "Service: A run whose webhook never came is closed" },
];

describe("ChainBlock", () => {
	test("prints each ticket it waits on with the title and the status", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={waitsOn} releases={releases} />);

		expect(html).toContain("Waits on");
		expect(html).toContain("OP-32");
		expect(html).toContain("Service: A routine run opens a chat and queues the turn");
		expect(html).toContain('data-category="review"');
		expect(html).toContain("Releases");
		expect(html).toContain("Service: A run whose webhook never came is closed");
	});

	test("derives the ready sentence and offers no control", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={waitsOn} releases={releases} />);

		expect(html).toContain("no. OP-32 is not merged, and OP-52 is not merged.");
		expect(html).not.toContain("<button");
	});

	test("prints nothing for a clause the chain leaves empty", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={[]} releases={releases} />);

		expect(html).toContain("nothing");
		expect(html).toContain("yes. No ticket holds this one back.");
	});

	test("prints one line when the ticket has no chain", () => {
		const html = renderToStaticMarkup(<ChainBlock waitsOn={[]} releases={[]} />);

		expect(html).toContain("The ticket waits for nothing, and no ticket waits for it.");
		expect(html).not.toContain("Ready");
	});
});
