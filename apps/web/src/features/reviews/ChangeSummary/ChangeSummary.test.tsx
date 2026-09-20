import { describe, expect, test } from "bun:test";
import type { PullRequestSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeSummary } from "./ChangeSummary";

const headSha = "9bf82d2a1c0f4e6b8d3a57c9e21b4a6d05f83e17";
const summary: PullRequestSummary = {
	pullRequestId: "01M2ZWN8R3YRYK14SQD0YHV5TG",
	headSha,
	headline: "Give the Operator message post a timeout.",
	why: "postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed.",
	watch: "ChatPage.vue. The end of the wait reads the thread, not the dialog.",
};

describe("ChangeSummary", () => {
	test("prints the three fields of the summary", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={summary} headSha={headSha} />);

		expect(html).toContain("Give the Operator message post a timeout.");
		expect(html).toContain("Watch this: ");
		expect(html).toContain("ChatPage.vue. The end of the wait reads the thread, not the dialog.");
		expect(html).not.toContain("one revision behind");
	});

	test("reads a summary of an earlier head SHA as one revision behind", () => {
		const html = renderToStaticMarkup(
			<ChangeSummary summary={summary} headSha="db837a0155e1c8f47a0b2d6e39c15b8a7f420d3c" />,
		);

		expect(html).toContain("The summary is one revision behind.");
	});

	test("reads a short head SHA as one revision behind", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={summary} headSha="9bf82d2a" />);

		expect(html).toContain("The summary is one revision behind.");
	});

	test("prints one faint line when the pull request carries no summary", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={null} headSha={headSha} />);

		expect(html).toContain("The agent has not written the summary.");
		expect(html).not.toContain("Watch this: ");
	});
});
