import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { ListQuery } from "@trellis/api";
import { type BrowseData, seedBrowse } from "../../../../test/browse";
import { connect } from "../../../../test/connect";
import type { Recorder } from "../../../../test/record";
import { renderWithClient } from "../../../../test/renderWithClient";
import { pageLimit } from "./listQuery";
import { ProjectTicketList } from "./ProjectTicketList";

let data: BrowseData;
let net: Recorder;

beforeEach(async () => {
	data = await seedBrowse();
	net = connect();
});

afterEach(() => net.restore());

const listInputs = () => net.inputsTo("tickets.list") as Partial<ListQuery>[];

const lastInput = () => listInputs()[listInputs().length - 1]!;

// The rows of the page that is on screen.
const rows = () => screen.queryAllByTestId(/^ticket-row-/);

const waitForRows = () => waitFor(() => expect(rows().length).toBeGreaterThan(0));

const endOfList = async () => {
	await fireEvent(screen.getByTestId("ticket-list"), "endReached");
	await act(async () => {});
};

describe("the ticket list requests", () => {
	test("the first request asks for the active categories sorted by -updatedAt", async () => {
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		expect(listInputs()).toEqual([
			{ project: data.root, category: ["todo", "started"], sort: "-updatedAt", limit: pageLimit },
		]);
	});

	test("the Review segment sends category review with no cursor", async () => {
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		await fireEvent.press(screen.getByLabelText("Review"));
		await waitFor(() => expect(listInputs()).toHaveLength(2));
		expect(lastInput().category).toEqual(["review"]);
		expect(lastInput().cursor).toBeUndefined();
	});

	test("the Done segment sends the done and canceled categories", async () => {
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		await fireEvent.press(screen.getByLabelText("Done"));
		await waitFor(() => expect(listInputs()).toHaveLength(2));
		expect(lastInput().category).toEqual(["done", "canceled"]);
	});

	test("the sort toggle sends sort priority and restarts the paging", async () => {
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		await fireEvent.press(screen.getByLabelText("Priority"));
		await waitFor(() => expect(listInputs()).toHaveLength(2));
		expect(lastInput().sort).toBe("priority");
		expect(lastInput().cursor).toBeUndefined();
	});

	test("the end of the list asks for the next page by cursor", async () => {
		// The root holds 28 active tickets, so the first page of 25 leaves a
		// cursor.
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		await endOfList();
		await waitFor(() => expect(listInputs()).toHaveLength(2));
		expect(lastInput().cursor).toEqual(expect.any(String));
		expect(lastInput().category).toEqual(["todo", "started"]);
		expect(lastInput().sort).toBe("-updatedAt");
		expect(lastInput().project).toBe(data.root);
	});

	test("a null cursor stops the paging", async () => {
		// The small root holds 3 active tickets, so its first page is the whole
		// list.
		renderWithClient(<ProjectTicketList project={data.small} />);
		await waitForRows();

		await endOfList();
		await endOfList();
		expect(listInputs()).toHaveLength(1);
	});

	test("a filter change drops the cursor of the old filter", async () => {
		renderWithClient(<ProjectTicketList project={data.root} />);
		await waitForRows();

		await endOfList();
		await waitFor(() => expect(listInputs()).toHaveLength(2));

		await fireEvent.press(screen.getByLabelText("Review"));
		await waitFor(() => expect(listInputs()).toHaveLength(3));
		expect(lastInput().cursor).toBeUndefined();
	});

	test("a lower-case project ref reaches the server in canonical spelling", async () => {
		renderWithClient(<ProjectTicketList project={data.web.toLowerCase()} />);
		await waitForRows();

		expect(lastInput().project).toBe(data.web);
	});
});
