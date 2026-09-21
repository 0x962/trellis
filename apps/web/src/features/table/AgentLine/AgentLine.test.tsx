import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { agentLineHeight } from "../rowHeights";
import { AgentLine } from "./AgentLine";

// `renderToStaticMarkup` writes the text of each element with no separator,
// so the words of one line run together. The test reads the words, not the
// gaps.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

describe("AgentLine", () => {
	test("prints the words of a message in the muted color and draws no dot", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={0} last />,
		);

		expect(textOf(html)).toContain("crisp-fjord: I rebased.");
		expect(html).toContain("text-fg-muted");
		expect(html).not.toContain("bg-warning");
	});

	test("draws the dot and the warning color when the run asks", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord asks: Which cap?", asks: true, working: false }} top={0} last />,
		);

		expect(textOf(html)).toContain("crisp-fjord asks: Which cap?");
		expect(html).toContain("bg-warning");
		expect(html).toContain("text-warning");
	});

	test("says no label of its own", () => {
		const html = textOf(
			renderToStaticMarkup(
				<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={0} last />,
			),
		);

		expect(html).not.toContain("said:");
	});

	test("as the last child, closes the group with the same border as a ticket row", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={0} last />,
		);

		expect(html).toContain("border-b border-border");
	});

	test("takes at least the height the virtual list reserves, at the offset it names", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={288} last />,
		);

		expect(html).toContain(`min-height:${agentLineHeight}px`);
		expect(html).toContain("translateY(288px)");
	});

	test("wraps a long message and never truncates it", () => {
		const words = `crisp-fjord: ${"I rebased the branch on main and ran the tests again. ".repeat(6)}`;
		const html = renderToStaticMarkup(<AgentLine line={{ words, asks: false, working: false }} top={0} last />);

		expect(textOf(html)).toContain(words);
		expect(html).toContain("wrap-anywhere");
		expect(html).not.toContain("truncate");
	});

	test("shimmers the words of a run that works and keeps them on one line", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: Edit apps/web/src/app.css", asks: false, working: true }} top={0} last />,
		);

		expect(textOf(html)).toContain("crisp-fjord: Edit apps/web/src/app.css");
		expect(html).toContain("text-glimmer");
		expect(html).toContain("truncate");
		expect(html).toContain('data-agent-line="working"');
	});

	test("drops the shimmer when the run ends its turn", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={0} last />,
		);

		expect(html).not.toContain("text-glimmer");
		expect(html).toContain('data-agent-line="message"');
	});

	test("carries the index the virtualizer reads when it measures the line", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={0} last index={7} />,
		);

		expect(html).toContain('data-index="7"');
	});

	test("points its elbow at the middle of its first text line", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={0} last />,
		);

		expect(html).toContain(`top:${agentLineHeight / 2}px`);
		expect(html).toContain(`height:${agentLineHeight / 2}px`);
	});

	test("starts under the id column of the ticket row", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false, working: false }} top={0} last />,
		);

		expect(html).toContain("pl-19");
	});
});
