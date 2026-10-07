import { afterEach, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { BoardColumnModel } from "../../types";
import { BoardColumn, type BoardColumnProps } from "./BoardColumn";

const domTest = test.skipIf(typeof document === "undefined");
let dispose = async () => {};
afterEach(async () => dispose());

async function mount(category: BoardColumnModel["category"] = "done", options: Partial<BoardColumnProps> = {}) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	let updates!: (value: Partial<BoardColumnProps>) => void;
	function Fixture() {
		const [collapsed, setCollapsed] = useState(true);
		const [extra, setExtra] = useState(options);
		updates = setExtra;
		return (
			<BoardColumn
				column={{ id: category, name: category, category, statuses: [], items: [], count: 205 }}
				collapsed={collapsed}
				showAllDone={false}
				hasMore
				loadingMore={false}
				categoryMode={false}
				width="248px"
				well={false}
				workingTicketIds={new Set()}
				bottomRoom={false}
				isSelected={() => false}
				onToggle={() => setCollapsed((value) => !value)}
				onShowAllDone={() => {}}
				onShowMore={async () => {}}
				onFocusTicket={() => {}}
				onCardClick={() => {}}
				onCardKeyDown={() => {}}
				onAnnounce={() => {}}
				{...extra}
			/>
		);
	}
	await act(async () => root.render(<Fixture />));
	dispose = async () => {
		await act(async () => root.unmount());
		container.remove();
	};
	return { container, update: (value: Partial<BoardColumnProps>) => act(async () => updates(value)) };
}

domTest("uses the canonical disclosure, total count, controlled list, and focus return", async () => {
	const { container } = await mount();
	const rail = container.querySelector<HTMLButtonElement>('button[aria-label="Expand done"]')!;
	expect(container.textContent).toContain("205");
	await act(async () => rail.click());
	const disclosure = container.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
	expect(disclosure.getAttribute("aria-expanded")).toBe("true");
	expect(document.activeElement).toBe(disclosure);
	expect(document.getElementById(disclosure.getAttribute("aria-controls")!)?.tagName).toBe("UL");
	expect(container.querySelector("h2")?.textContent).toBe("done");
	expect(container.querySelector("[data-count]")?.textContent).toBe("205");
	await act(async () => disclosure.click());
	expect(document.activeElement?.getAttribute("aria-label")).toBe("Expand done");
});

domTest("keeps Show all available without recent tickets and gates continuation on Show all", async () => {
	const fixture = await mount("done", {
		column: {
			id: "done",
			name: "done",
			category: "done",
			statuses: [],
			count: 205,
			items: [{ id: "old", completedAt: "2020-01-01T00:00:00Z" }] as TicketSummary[],
		},
	});
	await act(async () => fixture.container.querySelector<HTMLButtonElement>("button")!.click());
	expect(fixture.container.querySelectorAll("[data-card]")).toHaveLength(0);
	expect(fixture.container.textContent).toContain("Show all done tickets");
	expect(fixture.container.textContent).not.toContain("Show more");
	await fixture.update({ showAllDone: true, loadingMore: true });
	const more = [...fixture.container.querySelectorAll<HTMLButtonElement>("button")].find(
		(button) => button.textContent === "Show more",
	)!;
	expect(more.disabled).toBeTrue();
	expect(more.getAttribute("aria-busy")).toBe("true");
	await fixture.update({ showAllDone: true, hasMore: false });
	expect(fixture.container.textContent).not.toContain("Show more");
});

for (const category of ["canceled", "started"] as const) {
	domTest(`preserves the rail and continuation of ${category}`, async () => {
		const { container } = await mount(category);
		await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
		expect(container.querySelector("button[aria-expanded]")).not.toBeNull();
		expect(container.textContent).toContain("Show more");
		expect(container.textContent).not.toContain("Show all done tickets");
	});
}
