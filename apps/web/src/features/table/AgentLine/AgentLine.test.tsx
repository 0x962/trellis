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
		const html = renderToStaticMarkup(<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false }} top={0} />);

		expect(textOf(html)).toContain("crisp-fjord: I rebased.");
		expect(html).toContain("text-fg-muted");
		expect(html).not.toContain("bg-warning");
	});

	test("draws the dot and the warning color when the run asks", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord asks: Which cap?", asks: true }} top={0} />,
		);

		expect(textOf(html)).toContain("crisp-fjord asks: Which cap?");
		expect(html).toContain("bg-warning");
		expect(html).toContain("text-warning");
	});

	test("says no label of its own", () => {
		const html = textOf(
			renderToStaticMarkup(<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false }} top={0} />),
		);

		expect(html).not.toContain("said:");
	});

	test("closes with the same rule as every other line of the table", () => {
		const html = renderToStaticMarkup(<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false }} top={0} />);

		expect(html).toContain("border-b border-border");
	});

	test("takes the height the virtual list reserves, at the offset it names", () => {
		const html = renderToStaticMarkup(<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false }} top={288} />);

		expect(html).toContain(`height:${agentLineHeight}px`);
		expect(html).toContain("translateY(288px)");
	});
});
