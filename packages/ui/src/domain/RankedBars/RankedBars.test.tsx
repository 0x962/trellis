import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type RankedBarRow, RankedBars } from "./RankedBars";

const rows: readonly RankedBarRow[] = [
	{
		key: "long",
		label: "TRL-663 A long ticket title that needs its full value",
		detail: "A detailed project name that also needs room",
		value: 987_654,
		valueLabel: "$987,654.32",
		share: 0.75,
		tone: "agent",
		icon: <span data-icon="provider" />,
		spark: [0, 3, 8],
		action: <button type="button">Open ticket</button>,
	},
	{
		key: "zero",
		label: "No usage",
		value: 0,
		valueLabel: "$0.00",
		share: 0,
		tone: "success",
	},
];

const render = (overrides: Partial<Parameters<typeof RankedBars>[0]> = {}) =>
	renderToStaticMarkup(
		<RankedBars label="Usage by ticket" rows={rows} selected="long" onSelect={() => {}} {...overrides} />,
	);

test("keeps the full row content and selection semantics", () => {
	const html = render();

	expect(html).toContain('aria-label="Usage by ticket"');
	expect(html).toContain('aria-pressed="true"');
	expect(html).not.toContain("title=");
	expect(html).toContain("A detailed project name that also needs room");
	expect(html).toContain("$987,654.32");
	expect(html).toContain("75%");
	expect(html).toContain("$0.00");
	expect(html).toContain("0%");
	expect(html).toContain("Open ticket");
});

test("uses a readable narrow row", () => {
	const html = render();

	expect(html).toContain("max-md:col-span-2 max-md:items-start");
	expect(html).toContain("max-md:flex-col max-md:items-start");
	expect(html).toContain("max-md:[overflow-wrap:anywhere]");
	expect(html).toContain("max-md:col-span-2 max-md:row-start-2");
	expect(html).not.toContain("max-md:hidden");
	expect(html).toContain("max-md:row-start-3");
	expect(html).toContain("pointer-coarse:w-11");
});

test("keeps rows dense and values aligned on desktop", () => {
	const html = render();

	expect(html).toContain("grid-cols-[minmax(0,1fr)_auto]");
	expect(html).toContain("w-20 text-right text-sm text-fg tabular");
	expect(html).toContain("w-10 text-right text-xs text-fg-faint tabular");
	expect(html).toContain("bg-accent-soft");
});

test("limits the initial rows and keeps the expansion control", () => {
	const html = render({ limit: 1 });

	expect(html).toContain("Show all 2");
	expect(html).not.toContain("No usage");
});
