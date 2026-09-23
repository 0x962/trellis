import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PaneBoundary } from "./PaneBoundary";

// apps/web has no DOM, and server rendering never calls an error boundary,
// so these tests drive the two steps React takes after a throw by hand.
const caught = (error: Error) => {
	const boundary = new PaneBoundary({ tab: "diff", children: <p>diff</p> });
	boundary.state = PaneBoundary.getDerivedStateFromError(error);
	return renderToStaticMarkup(boundary.render());
};

test("a tab that draws without an error shows its own content", () => {
	expect(renderToStaticMarkup(<PaneBoundary tab="diff">{<p>diff</p>}</PaneBoundary>)).toBe("<p>diff</p>");
});

test("a tab that throws says so in plain words and offers a retry", () => {
	const html = caught(new Error("Invalid hunk line counts in values.yaml"));
	expect(html).toContain("This tab did not draw");
	expect(html).toContain("Retry");
	expect(html).not.toContain("<p>diff</p>");
});

test("a tab that throws keeps the thrown message behind the disclosure", () => {
	const html = caught(new Error("Invalid hunk line counts in values.yaml"));
	const message = html.indexOf("Invalid hunk line counts in values.yaml");

	expect(message).toBeGreaterThan(html.indexOf("</h3>"));
	expect(html).toContain("Details</summary>");
});
