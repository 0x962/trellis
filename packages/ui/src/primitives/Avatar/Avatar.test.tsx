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

test("a paused agent uses the neutral status dot", () => {
	const html = renderToStaticMarkup(<Avatar kind="agent" name="crisp-fjord" status="paused" />);

	expect(html).toContain('data-agent-status="paused"');
	expect(html).toContain('aria-label="crisp-fjord · agent · paused"');
	expect(html).toContain("bg-fg-faint");
	expect(html).not.toContain("animate-pulse");
});

test.each(["human", "agent"] as const)("the %s avatar has the shared keyboard focus outline", (kind) => {
	const html = renderToStaticMarkup(<Avatar kind={kind} name="Dana Lee" />);

	expect(html).toContain('tabindex="0"');
	expect(html).toContain("focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2");
});

test("a non-focusable avatar stays outside the tab order", () => {
	const html = renderToStaticMarkup(<Avatar kind="human" name="Dana Lee" focusable={false} />);

	expect(html).not.toContain("tabindex");
});
