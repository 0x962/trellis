import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectListStatus } from "./ProjectListStatus";

test("a failed project list shows the failure and a Retry button", () => {
	const html = renderToStaticMarkup(<ProjectListStatus failed onRetry={() => {}} />);

	expect(html).toContain('role="status"');
	expect(html).toContain("Could not load projects");
	expect(html).toContain(">Retry<");
});

test("a loading project list shows placeholder rows and no failure", () => {
	const html = renderToStaticMarkup(<ProjectListStatus failed={false} onRetry={() => {}} />);

	expect(html).toContain('aria-busy="true"');
	expect(html).not.toContain("Could not load projects");
});
