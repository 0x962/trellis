import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "./Avatar";

test("a working agent avatar uses the glimmer without a status dot", () => {
	const html = renderToStaticMarkup(<Avatar kind="agent" name="crisp-fjord" state="working" status="working" />);

	expect(html).toContain("agent-glimmer");
	expect(html).not.toContain("data-agent-status");
});

test("an agent avatar keeps non-working status dots", () => {
	const html = renderToStaticMarkup(<Avatar kind="agent" name="crisp-fjord" status="needs-input" />);

	expect(html).toContain('data-agent-status="needs-input"');
});
