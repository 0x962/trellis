import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { type BrowseData, seedBrowse } from "../../../test/browse";
import { connect } from "../../../test/connect";
import type { Recorder } from "../../../test/record";
import { renderRoute } from "../../../test/renderRoute";

let data: BrowseData;
let net: Recorder;

beforeEach(async () => {
	data = await seedBrowse();
	net = connect();
});

afterEach(() => net.restore());

describe("the project route", () => {
	test("the project route titles the header with the project name", async () => {
		await renderRoute(`/project/${data.web}`);

		await waitFor(() => expect(screen.getByRole("header", { name: "web" })).toBeOnTheScreen());
		const projects = net.inputsTo("tickets.list").map((input) => (input as { project: string }).project);
		expect(projects).toContain(data.web);
	});

	test("a tap on a ticket row pushes the ticket route", async () => {
		const view = await renderRoute(`/project/${data.root}`);

		// The one review ticket waits in Human Review, so the Review segment
		// holds it.
		await waitFor(() => expect(screen.getByLabelText("Review")).toBeOnTheScreen());
		await fireEvent.press(screen.getByLabelText("Review"));
		await waitFor(() => expect(screen.getByTestId(`ticket-row-${data.review}`)).toBeOnTheScreen());

		await fireEvent.press(screen.getByTestId(`ticket-row-${data.review}`));
		await waitFor(() => expect(view.getPathname()).toBe(`/ticket/${data.review}`));
		expect(screen.getByRole("header", { name: data.review })).toBeOnTheScreen();
	});

	test("the project screen offers no board", async () => {
		await renderRoute(`/project/${data.root}`);

		await waitFor(() => expect(screen.getByLabelText("Active")).toBeOnTheScreen());
		expect(screen.queryByLabelText("Board")).toBeNull();
		expect(screen.queryByText("Board")).toBeNull();
		expect(net.callsTo("tickets.board")).toEqual([]);
	});
});
