import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeSummary } from "./ChangeSummary";

const summary = {
	headline: "Give the Operator message post a timeout.",
	why: "postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed.",
	watch: "ChatPage.vue. The end of the wait reads the thread, not the dialog.",
};

test("prints the headline and the plain explanation", () => {
	const html = renderToStaticMarkup(<ChangeSummary summary={summary} headShaMoved={false} />);

	expect(html).toContain("Give the Operator message post a timeout.");
	expect(html).toContain("postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed.");
	expect(html).not.toContain("Watch this: ");
	expect(html).not.toContain("one revision behind");
});

test("prints the warning line when the head SHA moved after the summary", () => {
	const html = renderToStaticMarkup(<ChangeSummary summary={summary} headShaMoved={true} />);

	expect(html).toContain("The summary is one revision behind.");
	expect(html).toContain("text-warning");
});

test("prints one faint line when no agent wrote the summary", () => {
	const html = renderToStaticMarkup(<ChangeSummary summary={null} headShaMoved={false} />);

	expect(html).toContain("The agent has not written a summary yet.");
	expect(html).not.toContain("Watch this: ");
	expect(html).not.toContain("one revision behind");
});

test("prints no field name and no markdown mark", () => {
	const html = renderToStaticMarkup(<ChangeSummary summary={summary} headShaMoved={false} />);

	expect(html).not.toContain("headline");
	expect(html).not.toContain("<strong>");
	expect(html).not.toContain("<em>");
});
