import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { prOf } from "../../../PrRow/prOf";
import type { TicketAgentLine } from "../../../utils/agentLines";
import type { TicketDisclosure } from "../../../utils/flattenGroups";
import { PhoneRow } from "./PhoneRow";

// `renderToStaticMarkup` writes the text of each span with no separator, so
// the words of one line run together. The test reads the words, not the gaps.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

const ticket = (fields: Partial<TicketSummary> = {}) =>
	({
		id: "t1",
		identifier: "OP-35",
		title: "Service: A run whose webhook fails retries three times",
		status: {
			id: "s1",
			slug: "human-review",
			name: "Human Review",
			category: "review",
			reviewer: "human",
			color: "warning",
		},
		updatedAt: "2026-09-20T12:00:00.000Z",
		prRows: [],
		waitsOn: [],
		releases: [],
		ready: false,
		...fields,
	}) as TicketSummary;

const render = (
	row: TicketSummary,
	layout: "epic" | "list",
	agentLine: TicketAgentLine | null = null,
	disclosure: TicketDisclosure = null,
) =>
	renderToStaticMarkup(
		<PhoneRow
			ref={null}
			ticket={row}
			priority={<span>priority</span>}
			actor={<span>actor</span>}
			layout={layout}
			agentLine={agentLine}
			disclosure={disclosure}
			focused={false}
			selected={false}
		/>,
	);

describe("PhoneRow on the epic table", () => {
	test("puts the ID, the title and the actor on line 1, and leaves the priority mark out", () => {
		const html = render(ticket(), "epic");

		expect(textOf(html)).toBe("OP-35Service: A run whose webhook fails retries three timesactor");
		expect(html).not.toContain('data-column="priority"');
	});

	test("prints the pull request number and title on line 2", () => {
		const pr = prOf({
			number: 57057,
			title: "Show the pull request title",
			additions: 311,
			deletions: 12,
			changedFiles: 6,
			pass: 42,
		});
		const line2 = textOf(render(ticket({ prRows: [pr] }), "epic").split('data-line="pr"')[1]!);

		expect(line2).toContain("#57057Show the pull request title");
		expect(line2).not.toContain("42 passed");
	});

	test("prints what the run says on line 2", () => {
		const html = render(ticket(), "epic", { words: "crisp-fjord: I rebased.", asks: false, working: false });

		expect(html).toContain('data-line="agent"');
		expect(textOf(html)).toContain("crisp-fjord: I rebased.");
	});

	test("draws no line 2 for a ticket that holds none of the four facts", () => {
		expect(render(ticket({ ready: true }), "epic")).not.toContain("data-line");
	});

	test("hides line 2 while a done ticket is collapsed", () => {
		const pr = prOf({ number: 57057, pass: 42 });
		const html = render(
			ticket({ prRows: [pr] }),
			"epic",
			{ words: "crisp-fjord: Done.", asks: false, working: false },
			"collapsed",
		);

		expect(html).not.toContain("data-line");
		expect(html).toContain("Show details for OP-35");
	});

	test("shows line 2 while a done ticket is expanded", () => {
		const html = render(ticket(), "epic", { words: "crisp-fjord: Done.", asks: false, working: false }, "expanded");

		expect(html).toContain('data-line="agent"');
		expect(html).toContain("Hide details for OP-35");
	});
});

describe("PhoneRow on another list", () => {
	test("keeps the priority mark, and the title on line 2", () => {
		const html = render(ticket(), "list");

		expect(html).toContain('data-column="priority"');
		expect(html).toContain('data-line="title"');
	});
});
