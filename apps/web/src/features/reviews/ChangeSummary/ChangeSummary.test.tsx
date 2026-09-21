import { describe, expect, test } from "bun:test";
import type { PullRequestSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { createMarkdownParser } from "../../../lib/markdown";
import { ChangeSummary } from "./ChangeSummary";

// The test runtime has no DOM for the sanitizer, so the raw parser stands in.
const render = createMarkdownParser();

const headSha = "9bf82d2a1c0f4e6b8d3a57c9e21b4a6d05f83e17";
const summary: PullRequestSummary = {
	pullRequestId: "01M2ZWN8R3YRYK14SQD0YHV5TG",
	headSha,
	headline: "Give the Operator message post a timeout.",
	why: "postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed.",
	watch: "ChatPage.vue. The end of the wait reads the thread, not the dialog.",
};

describe("ChangeSummary", () => {
	test("prints the headline and plain explanation", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={summary} headSha={headSha} render={render} />);

		expect(html).toContain("Give the Operator message post a timeout.");
		expect(html).toContain("postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed.");
		expect(html).not.toContain("Watch this: ");
		expect(html).not.toContain("one revision behind");
	});

	test("reads a summary of an earlier head SHA as one revision behind", () => {
		const html = renderToStaticMarkup(
			<ChangeSummary summary={summary} headSha="db837a0155e1c8f47a0b2d6e39c15b8a7f420d3c" render={render} />,
		);

		expect(html).toContain("The summary is one revision behind.");
	});

	test("reads a short head SHA as one revision behind", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={summary} headSha="9bf82d2a" render={render} />);

		expect(html).toContain("The summary is one revision behind.");
	});

	test("prints one faint line when the pull request carries no summary", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={null} headSha={headSha} />);

		expect(html).toContain("The agent has not written a summary yet.");
		expect(html).not.toContain("Watch this: ");
	});

	test("renders the explanation as Markdown with its image and its mermaid block", () => {
		const why = [
			"The Overview tab now opens with the explanation.",
			"",
			"![the Overview tab after the change](/api/evidence/01M3362000000000000000000A/file)",
			"",
			"```mermaid",
			"flowchart LR",
			"  agent --> summary --> overview",
			"```",
		].join("\n");
		const html = renderToStaticMarkup(
			<ChangeSummary summary={{ ...summary, why }} headSha={headSha} render={render} />,
		);

		expect(html).toContain("<p>The Overview tab now opens with the explanation.</p>");
		expect(html).toContain(
			'<img src="/api/evidence/01M3362000000000000000000A/file" alt="the Overview tab after the change">',
		);
		expect(html).toContain('<code class="language-mermaid">flowchart LR');
	});
});
