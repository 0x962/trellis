import { describe, expect, test } from "@jest/globals";
import { render, screen, within } from "@testing-library/react-native";
import type { Check } from "@trellis/api";
import { StyleSheet } from "react-native";
import { ticketSummary } from "../../../../../test/fixtures";
import { paintedColors } from "../../../../../test/paint";
import { ribbonWidths } from "../../../../components/CheckRibbon/segments";
import { layout } from "../../../../theme/layout";
import { tokens } from "../../../../theme/tokens";
import { InboxRow } from "./InboxRow";

const hour = 60 * 60 * 1000;
const palette = tokens.dark;

const humanReview = {
	id: "01J8Z6X4Q3M2K1H0G9F8E7D6S4",
	slug: "human-review",
	name: "Human Review",
	category: "review",
	reviewer: "human",
	color: "accent",
} as const;

// CDE-42 as the seeded inbox lists it: in Human Review, four passing
// checks, last touched by the agent claude two hours ago.
const review = (overrides: Record<string, unknown> = {}) =>
	ticketSummary({
		status: humanReview,
		pr: { state: "open", ciState: "pass", pass: 4, fail: 0, pending: 0 },
		lastActor: { kind: "agent", name: "claude", at: new Date(Date.now() - 2 * hour).toISOString() },
		updatedAt: new Date(Date.now() - 2 * hour).toISOString(),
		...overrides,
	}) as never;

const flat = (element: { props: { style?: unknown } }) =>
	StyleSheet.flatten(element.props.style as never) as { fontFamily?: string; fontVariant?: string[]; height?: number };

const row = (identifier = "CDE-42") => screen.getByTestId(`inbox-row-${identifier}`);

describe("InboxRow", () => {
	// MI-04
	test("a review row shows the status mark, the id, the title, the mini ribbon, the actor, and the time", async () => {
		await render(<InboxRow ticket={review()} />);
		expect(screen.getByLabelText("Human Review")).toBeOnTheScreen();
		expect(paintedColors(screen.toJSON())).toContain(palette.accent);
		expect(paintedColors(screen.toJSON())).not.toContain(palette.agent);
		expect(flat(screen.getByText("CDE-42")).fontFamily).toBe(tokens.font.mono);
		const title = screen.getByText("Restore the fork pages after the upstream 1.27 merge");
		expect(title.props.numberOfLines).toBe(1);
		expect(screen.getByTestId("check-ribbon")).toHaveStyle({ width: ribbonWidths.mini });
		expect(screen.getAllByTestId("ribbon-segment")).toHaveLength(4);
		expect(screen.getByLabelText("claude · agent")).toBeOnTheScreen();
		expect(screen.getByText("claude")).toBeOnTheScreen();
		const time = screen.getByText("2h");
		expect(flat(time).fontVariant).toContain("tabular-nums");
	});

	// MI-05
	test("a row without a pull request draws no ribbon and keeps the row height", async () => {
		const withRibbon = await render(<InboxRow ticket={review()} />);
		const height = flat(row()).height;
		expect(height).toBeGreaterThanOrEqual(layout.hit);
		await withRibbon.unmount();

		await render(<InboxRow ticket={review({ pr: null })} />);
		expect(screen.queryByTestId("check-ribbon")).toBeNull();
		expect(flat(row()).height).toBe(height);
	});

	// MI-06
	test("the mini ribbon segments follow the pass, fail, and pending counts of the badge", async () => {
		await render(
			<InboxRow ticket={review({ pr: { state: "open", ciState: "fail", pass: 2, fail: 1, pending: 1 } })} />,
		);
		const segments = screen.getAllByTestId("ribbon-segment");
		expect(segments).toHaveLength(4);
		const expected = [palette.success, palette.success, palette.danger, palette.borderStrong];
		segments.forEach((segment, index) => {
			expect(segment).toHaveStyle({ backgroundColor: expected[index] });
		});
		expect(screen.getByTestId("check-ribbon")).toHaveStyle({ width: ribbonWidths.mini });
	});

	// MI-07. `system` is the poller and never shows as an actor.
	test("the system actor never renders a mark", async () => {
		await render(
			<InboxRow ticket={review({ lastActor: { kind: "system", name: "trellis", at: new Date().toISOString() } })} />,
		);
		expect(screen.queryByText("trellis")).toBeNull();
		expect(screen.queryByLabelText(/trellis/)).toBeNull();
		expect(screen.getAllByRole("image")).toHaveLength(1);
		expect(screen.getByLabelText("Human Review")).toBeOnTheScreen();
	});

	// MI-08
	test("a sub-ticket row shows the parent identifier", async () => {
		await render(<InboxRow ticket={review({ parent: { id: "01J8Z6X4Q3M2K1H0G9F8E7D6T3", identifier: "CDE-43" } })} />);
		expect(within(row()).getByText("CDE-43")).toBeOnTheScreen();
		expect(flat(within(row()).getByText("CDE-43")).fontFamily).toBe(tokens.font.mono);
	});

	// MI-11. A Failing CI row names the failing checks and none of the passing ones.
	test("a failing CI row names every failing check and no passing check", async () => {
		const passing = ["lint", "test (host-service)", "build (macos-arm64)", "e2e (web)", "docs", "size-budget"];
		const checks: Check[] = [
			{ name: "typecheck (desktop)", workflow: "ci", bucket: "fail", link: null },
			...passing.map((name) => ({ name, workflow: "ci", bucket: "pass" as const, link: null })),
			{ name: "test (cli)", workflow: "ci", bucket: "fail", link: null },
		];
		const ticket = review({
			status: { ...humanReview, slug: "in-progress", name: "In Progress", category: "started", reviewer: null },
			pr: { state: "open", ciState: "fail", pass: 6, fail: 2, pending: 0 },
		});
		await render(<InboxRow ticket={ticket} checks={checks} />);
		expect(within(row()).getByText(/typecheck \(desktop\)/)).toBeOnTheScreen();
		expect(within(row()).getByText(/test \(cli\)/)).toBeOnTheScreen();
		for (const name of passing) expect(within(row()).queryByText(new RegExp(name.replace(/[()]/g, "\\$&")))).toBeNull();
		expect(paintedColors(screen.toJSON())).toContain(palette.danger);
	});
});
