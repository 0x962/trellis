import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createMarkdownParser } from "../../../lib/markdown";
import { agentLineHeight } from "../rowHeights";
import { elbowRadius } from "../TreeLines";
import type { TicketAgentLine } from "../utils/agentLines";
import { AgentLine } from "./AgentLine";

type RestingTicketAgentLine = Extract<TicketAgentLine, { working: false }>;

// The renderer of the app strips whatever runs with the DOM of the browser,
// and this runtime has no DOM, so every test renders the markdown with the
// parser alone.
const render = createMarkdownParser();

// `renderToStaticMarkup` writes the text of each element with no separator,
// so the words of one line run together. The test reads the words, not the
// gaps.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

const ticketAgentLine = (words: string, fields: Partial<RestingTicketAgentLine> = {}): TicketAgentLine => ({
	words,
	asks: false,
	working: false,
	runId: "run",
	...fields,
});

describe("AgentLine", () => {
	test("prints the words of a message in the muted color and draws no dot", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={1} render={render} />,
		);

		expect(textOf(html)).toContain("crisp-fjord: I rebased.");
		expect(html).toContain("text-fg-muted");
		expect(html).not.toContain("bg-warning");
	});

	test("draws the dot and the warning color when the run asks", () => {
		const html = renderToStaticMarkup(
			<AgentLine
				line={ticketAgentLine("crisp-fjord asks: Which cap?", { asks: true })}
				top={0}
				depth={1}
				render={render}
			/>,
		);

		expect(textOf(html)).toContain("crisp-fjord asks: Which cap?");
		expect(html).toContain("bg-warning");
		expect(html).toContain("text-warning");
	});

	test("says no label of its own", () => {
		const html = textOf(
			renderToStaticMarkup(
				<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={1} render={render} />,
			),
		);

		expect(html).not.toContain("said:");
	});

	test("as the last child, closes the group with the same border as a ticket row", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={1} render={render} />,
		);

		expect(html).toContain("border-b border-border");
	});

	test("takes at least the height the virtual list reserves, at the offset it names", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={288} depth={1} render={render} />,
		);

		expect(html).toContain(`min-height:${agentLineHeight}px`);
		expect(html).toContain("translateY(288px)");
	});

	test("wraps a long message and never truncates it", () => {
		const words = `crisp-fjord: ${"I rebased the branch on main and ran the tests again. ".repeat(6)}`;
		const html = renderToStaticMarkup(<AgentLine line={ticketAgentLine(words)} top={0} depth={1} render={render} />);

		expect(textOf(html)).toContain(words.trim());
		expect(html).not.toContain("truncate");
	});

	test("renders the message as markdown, so a list reads as a list", () => {
		const words = "crisp-fjord: The branch is ready.\n\n- Adds `GET /runs`.\n- Needs **one** review.";
		const html = renderToStaticMarkup(<AgentLine line={ticketAgentLine(words)} top={0} depth={1} render={render} />);

		expect(html).toContain("<li>");
		expect(html).toContain("<code>GET /runs</code>");
		expect(html).toContain("<strong>one</strong>");
	});

	test("holds the markdown to the size of the line, so a heading cannot shout", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("# crisp-fjord pushed it")} top={0} depth={1} render={render} />,
		);

		expect(html).toContain("agent-markdown");
		expect(html).toContain("<h1>crisp-fjord pushed it</h1>");
	});

	// Every pull request of the ticket stands above this line, so the rule of
	// the ticket has nothing left to reach and stops at the last pull request.
	test("hangs from the last pull request of the ticket and ends both rules there", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={2} render={render} />,
		);

		expect(html).toContain("left-[84px]");
		expect(html).toContain("pl-[102px]");
		expect(html).not.toContain("left-[60px]");
		expect(html).toContain("border-b border-border");
	});

	test("ends its own branch with a corner", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={2} render={render} />,
		);

		expect(html).toContain("rounded-bl-sm");
		expect(html).toContain(`height:${agentLineHeight / 2 - elbowRadius}px`);
	});

	test("hangs from the ticket row when the ticket links no pull request", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={1} render={render} />,
		);

		expect(html).toContain("left-[60px]");
		expect(html).toContain("pl-19");
	});

	test("shimmers the words of a run that works and keeps them on one line", () => {
		const html = renderToStaticMarkup(
			<AgentLine
				line={{
					words: "crisp-fjord: Edit apps/web/src/app.css",
					spans: [
						{ key: "agent", text: "crisp-fjord: ", kind: "text" },
						{ key: "tool-name", text: "Edit ", kind: "text" },
						{ key: "tool-target", text: "apps/web/src/app.css", kind: "code" },
					],
					asks: false,
					working: true,
					runId: "run",
				}}
				top={0}
				depth={1}
				render={render}
			/>,
		);

		expect(textOf(html)).toContain("crisp-fjord: Edit apps/web/src/app.css");
		expect(html).toContain("text-film");
		expect(html).toContain("truncate");
		expect(html).toContain('data-agent-line="working"');
	});

	test("draws the code part of a working line in the mono face", () => {
		const html = renderToStaticMarkup(
			<AgentLine
				line={{
					words: "crisp-fjord: Shell bun test apps/web/src",
					spans: [
						{ key: "agent", text: "crisp-fjord: ", kind: "text" },
						{ key: "tool-name", text: "Shell ", kind: "text" },
						{ key: "tool-target", text: "bun test apps/web/src", kind: "code" },
					],
					asks: false,
					working: true,
					runId: "run",
				}}
				top={0}
				depth={1}
				render={render}
			/>,
		);

		expect(html).toContain("<span>crisp-fjord: </span><span>Shell </span>");
		expect(html).toContain('<code class="font-mono">bun test apps/web/src</code>');
	});

	test("drops the shimmer and renders markdown when the run ends its turn", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: The branch is ready.")} top={0} depth={1} render={render} />,
		);

		expect(html).not.toContain("text-film");
		expect(html).toContain("agent-markdown");
		expect(html).toContain('data-agent-line="message"');
	});

	test("is a control that opens the session of its run, with a hover band and a focus ring", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={1} render={render} />,
		);

		expect(html).toContain('role="button"');
		expect(html).toContain('tabindex="0"');
		expect(html).toContain("hover:bg-band");
		expect(html).toContain("focus-visible:outline-accent");
	});

	test("carries the index the virtualizer reads when it measures the line", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={1} index={7} render={render} />,
		);

		expect(html).toContain('data-index="7"');
	});

	test("points its elbow at the middle of its first text line", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={ticketAgentLine("crisp-fjord: I rebased.")} top={0} depth={1} render={render} />,
		);

		expect(html).toContain(`top:${agentLineHeight / 2 - elbowRadius}px`);
		expect(html).toContain(`height:${agentLineHeight / 2 - elbowRadius}px`);
	});
});
