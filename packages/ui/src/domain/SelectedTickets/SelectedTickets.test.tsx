import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectedTickets, type SelectedTicketsProps } from "./SelectedTickets";

const props: SelectedTicketsProps = {
	items: Array.from({ length: 1_000 }, (_, index) => ({
		identifier: `EXT-${index + 1}`,
		title: `Related ticket ${index + 1}`,
		status: "done",
	})),
	onRemove: async () => {},
	pending: false,
	removing: null,
	loading: false,
	error: null,
	retry: () => {},
};

test("bounds rows while retaining the complete list size and removal names", () => {
	const html = renderToStaticMarkup(<SelectedTickets {...props} />);
	expect(html.match(/<li /g)!.length).toBeLessThan(20);
	expect(html).toContain('aria-setsize="1000"');
	expect(html).toContain('aria-posinset="1"');
	expect(html).toContain('aria-label="Remove EXT-1"');
	expect(html).toContain("height:44000px");
	expect(html.match(/tabindex="0"/g)).toHaveLength(1);
});

test("keeps the pending relationship and disables every mounted removal", () => {
	const html = renderToStaticMarkup(<SelectedTickets {...props} pending removing="EXT-1" />);
	expect(html).toContain('aria-label="Remove EXT-1"');
	const buttons = html.match(/<button[^>]+>/g)!;
	expect(buttons.length).toBeGreaterThan(0);
	expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
	expect(html).toContain('aria-busy="true"');
});

test("shows shared empty and failure states without discarding saved relationships", () => {
	const empty = renderToStaticMarkup(<SelectedTickets {...props} items={[]} />);
	expect(empty).toContain("No relationships.");
	expect(empty).not.toContain("Remove EXT-");
	const failed = renderToStaticMarkup(<SelectedTickets {...props} error={new Error("Offline")} />);
	expect(failed).toContain("The relationships did not load.");
	expect(failed).toContain("Retry");
	expect(failed).toContain('aria-label="Remove EXT-1"');
});
