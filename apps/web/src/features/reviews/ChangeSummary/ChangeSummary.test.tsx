import { describe, expect, test } from "bun:test";
import type { PullRequestSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeSummary } from "./ChangeSummary";

const summary: PullRequestSummary = {
	pullRequestId: "01M2ZWN8R3YRYK14SQD0YHV5TG",
	headSha: "9bf82d2a",
	headline: "Give the Operator message post a timeout.",
	why: "postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed.",
	watch: "ChatPage.vue. The end of the wait reads the thread, not the dialog.",
};

describe("ChangeSummary", () => {
	test("prints the three fields of the summary", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={summary} headSha="9bf82d2a" />);

		expect(html).toContain("Give the Operator message post a timeout.");
		expect(html).toContain("Watch this: ");
		expect(html).toContain("ChatPage.vue. The end of the wait reads the thread, not the dialog.");
		expect(html).not.toContain("one revision behind");
	});

	test("reads a summary of an earlier head SHA as one revision behind", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={summary} headSha="db837a01" />);

		expect(html).toContain("the summary is one revision behind");
	});

	test("prints one faint line when the pull request carries no summary", () => {
		const html = renderToStaticMarkup(<ChangeSummary summary={null} headSha="9bf82d2a" />);

		expect(html).toContain("The agent has not written the summary.");
		expect(html).not.toContain("Watch this: ");
	});
});
