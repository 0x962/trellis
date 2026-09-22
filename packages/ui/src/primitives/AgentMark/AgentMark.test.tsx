import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentMark } from "./AgentMark";

test("a working agent mark uses the glimmer without a dot", () => {
	const html = renderToStaticMarkup(<AgentMark name="crisp-fjord" state="working" />);

	expect(html).toContain('data-state="working"');
	expect(html).toContain("agent-glimmer");
	expect(html).not.toContain("agent-work-dot");
});

test("a still agent mark has no glimmer", () => {
	const html = renderToStaticMarkup(<AgentMark name="crisp-fjord" state="static" />);

	expect(html).not.toContain("agent-glimmer");
});
