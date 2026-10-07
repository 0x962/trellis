import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewOverview } from "./ReviewOverview";

const render = (ready: boolean, error: Error | null) =>
	renderToStaticMarkup(
		<ReviewOverview
			ready={ready}
			error={error}
			onRetry={() => {}}
			linked={false}
			summary={null}
			evidence={null}
			threads={[]}
			revision={null}
			onOpen={() => {}}
		/>,
	);

test("a pending overview announces its load", () => {
	const html = render(false, null);
	expect(html).toContain('aria-busy="true"');
	expect(html).toContain("The overview is loading.");
	expect(html).not.toContain('role="alert"');
});

test("a failed overview shows one failure and its retry without a load announcement", () => {
	for (const ready of [false, true]) {
		const html = render(ready, new Error("The request failed."));
		expect(html.match(/role="alert"/g)).toHaveLength(1);
		expect(html).toContain("The overview did not load");
		expect(html).toContain('aria-label="Retry overview"');
		expect(html).toContain("The request failed.");
		expect(html).not.toContain('aria-busy="true"');
		expect(html).not.toContain("The overview is loading.");
		expect(html).not.toContain("skeleton");
	}
});

test("a completed overview does not announce a load", () => {
	const html = render(true, null);
	expect(html).not.toContain('aria-busy="true"');
	expect(html).not.toContain('role="alert"');
});
