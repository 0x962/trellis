import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentProfileMark } from "./AgentProfileMark";

const profile = { provider: "anthropic", model: "Claude Opus 5", effort: "Max" } as const;

test("the card of a run that works carries the band of light", () => {
	const html = renderToStaticMarkup(<AgentProfileMark profile={profile} state="working-mild" />);

	expect(html).toContain('class="agent-card-sweep"');
});

test("the card of a run that works hard carries the band of light", () => {
	const html = renderToStaticMarkup(<AgentProfileMark profile={profile} state="working" />);

	expect(html).toContain('class="agent-card-sweep"');
});

test("the card of a still run carries no band of light", () => {
	const html = renderToStaticMarkup(<AgentProfileMark profile={profile} state="static" />);

	expect(html).not.toContain("agent-card-sweep");
	expect(html).toContain("Claude Opus 5");
});

test("a card with no state carries no band of light", () => {
	const html = renderToStaticMarkup(<AgentProfileMark profile={profile} />);

	expect(html).not.toContain("agent-card-sweep");
});
