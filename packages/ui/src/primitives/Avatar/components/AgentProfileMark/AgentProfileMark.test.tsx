import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentProfileMark } from "./AgentProfileMark";

const profile = { provider: "anthropic", model: "Claude Opus 5", effort: "Max" } as const;

test("the card of a run that works carries the band of light", () => {
	const html = renderToStaticMarkup(<AgentProfileMark profile={profile} state="working" />);

	expect(html).toContain('class="agent-profile-sweep"');
});

test("the card of a still run carries no band of light", () => {
	const html = renderToStaticMarkup(<AgentProfileMark profile={profile} state="static" />);

	expect(html).not.toContain("agent-profile-sweep");
	expect(html).toContain("Claude Opus 5");
});

test("two cards of one row start their band at different points", () => {
	const html = renderToStaticMarkup(
		<>
			<AgentProfileMark profile={profile} state="working" />
			<AgentProfileMark profile={profile} state="working" />
		</>,
	);
	const delays = [...html.matchAll(/animation-delay:([^"]+)"/g)].map((match) => match[1]);

	expect(delays).toHaveLength(2);
	expect(delays[0]).not.toBe(delays[1]);
});
