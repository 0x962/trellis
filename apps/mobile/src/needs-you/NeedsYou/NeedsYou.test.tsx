import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { connect } from "../../../test/connect";
import { type InboxData, padReview, seeder, seedInbox } from "../../../test/inbox";
import { lastFlashListProps, resetFlashListRenders } from "../../../test/mocks/flash-list";
import type { Recorder } from "../../../test/record";
import { renderNeedsYou, rowIdentifiers, sectionHeader } from "../../../test/renderNeedsYou";
import { setStalledHours } from "../../../test/seed";
import { human } from "../../../test/server";
import type { InboxItem } from "./utils/inboxRows";

jest.mock("@shopify/flash-list", () => require("../../../test/mocks/flash-list"));

const sectionNames = ["Review", "Failing CI", "Stalled", "Done by agents today"];
const headerPattern = /^(Review|Failing CI|Stalled|Done by agents today)$/;

let data: InboxData;
let net: Recorder;

// The FlashList items of one section, from the list's own data.
const dataRows = (key: string) => {
	const items = (lastFlashListProps<InboxItem>()?.data ?? []) as InboxItem[];
	return items.filter((item) => item.type === "row" && item.key === key);
};

const renderSeeded = async () => {
	const view = await renderNeedsYou();
	await screen.findByTestId(`inbox-row-${data.review[0]}`);
	return view;
};

describe("NeedsYou sections", () => {
	beforeEach(async () => {
		data = await seedInbox();
		net = connect();
		resetFlashListRenders();
	});

	afterEach(() => net.restore());

	// MI-01
	test("the four sections render in order with the seeded totals", async () => {
		await renderSeeded();
		const headers = screen.getAllByRole("button", { name: headerPattern });
		expect(headers.map((header) => header.props.accessibilityLabel)).toEqual(sectionNames);
		const counts = ["3", "1", "1", "3"];
		sectionNames.forEach((name, index) => {
			expect(within(sectionHeader(name)).getByText(counts[index]!)).toBeOnTheScreen();
		});
	});

	// MI-02. The server orders each section; the screen never re-sorts one.
	test("each section keeps the server's row order", async () => {
		await renderSeeded();
		expect(rowIdentifiers()).toEqual([...data.review, data.failingCi, data.stalled]);
		const inbox = await human.inbox.get({});
		for (const key of ["review", "failingCi", "stalled"] as const) {
			expect(dataRows(key).map((item) => (item.type === "row" ? item.ticket.identifier : ""))).toEqual(
				inbox[key].items.map((item) => item.identifier),
			);
		}
	});

	// MI-03
	test("a capped section shows the total in the header and 100 rows", async () => {
		await padReview(`${data.project}.web`, 102);
		const inbox = await human.inbox.get({});
		expect(inbox.review.total).toBe(105);
		expect(inbox.review.items).toHaveLength(100);
		await renderSeeded();
		expect(within(sectionHeader("Review")).getByText("105")).toBeOnTheScreen();
		expect(dataRows("review")).toHaveLength(100);
	});

	// MI-10. The check names come from the linked pull request.
	test("a failing CI row names the failing checks", async () => {
		await renderSeeded();
		const row = screen.getByTestId(`inbox-row-${data.failingCi}`);
		expect(await within(row).findByText(/typecheck \(desktop\)/)).toBeOnTheScreen();
		expect(within(row).queryByText(/lint/)).toBeNull();
		expect(within(row).queryByText(/test \(host-service\)/)).toBeNull();
	});

	// MI-12
	test("the stalled header hint carries the stalled hours from settings", async () => {
		await setStalledHours(seeder, 24);
		const first = await renderSeeded();
		expect(await within(sectionHeader("Stalled")).findByText("no activity for 24h")).toBeOnTheScreen();
		await first.unmount();

		await setStalledHours(seeder, 48);
		await renderSeeded();
		expect(await within(sectionHeader("Stalled")).findByText("no activity for 48h")).toBeOnTheScreen();
	});

	// MI-14
	test("done by agents today starts collapsed", async () => {
		await renderSeeded();
		const header = sectionHeader("Done by agents today");
		expect(header).toBeCollapsed();
		expect(within(header).getByText("3")).toBeOnTheScreen();
		expect(within(header).getByText("Show 3")).toBeOnTheScreen();
		expect(dataRows("doneByAgentsToday")).toHaveLength(0);
		for (const identifier of data.done) expect(rowIdentifiers()).not.toContain(identifier);
	});

	// MI-15
	test("a tap on the done header expands the section", async () => {
		await renderSeeded();
		await fireEvent.press(sectionHeader("Done by agents today"));
		await waitFor(() => expect(sectionHeader("Done by agents today")).toBeExpanded());
		expect(within(sectionHeader("Done by agents today")).getByText("Hide")).toBeOnTheScreen();
		expect(dataRows("doneByAgentsToday")).toHaveLength(3);
		for (const identifier of data.done) expect(await screen.findByTestId(`inbox-row-${identifier}`)).toBeOnTheScreen();
	});

	// MI-56
	test("the sections render in one FlashList with fixed-height rows", async () => {
		await renderSeeded();
		const props = lastFlashListProps<InboxItem>();
		expect(props).toBeDefined();
		const items = props!.data as InboxItem[];
		const header = items.find((item) => item.type === "header")!;
		const row = items.find((item) => item.type === "row")!;
		expect(props!.getItemType?.(header, 0, undefined)).toBe("header");
		expect(props!.getItemType?.(row, 1, undefined)).toBe("row");
		const heights = screen
			.getAllByTestId(/^inbox-row-/)
			.map((element) => (StyleSheet.flatten(element.props.style) as { height?: number }).height);
		expect(heights.length).toBeGreaterThan(1);
		expect(typeof heights[0]).toBe("number");
		expect(new Set(heights).size).toBe(1);
	});
});
