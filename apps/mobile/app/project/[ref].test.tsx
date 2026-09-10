import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { appContext } from "../../test/appContext";
import { callsTo, type FakeServer, inputsTo, startFakeServer, stopFakeServer } from "../../test/fakeServer";

// `renderRouter` returns a thenable. Await it once, and the route tree is
// mounted; the object itself carries `getPathname`.
const openRoute = (url: string) => renderRouter(appContext(), { initialUrl: url });

let server: FakeServer;

beforeEach(() => {
	server = startFakeServer();
});

afterEach(() => stopFakeServer(server));

describe("the project route", () => {
	test("the project route titles the header with the project name", async () => {
		const view = openRoute("/project/CDE.web");
		await view;

		await waitFor(() => expect(screen.getByRole("header", { name: "web" })).toBeOnTheScreen());
		const projects = inputsTo(server, "tickets.list").map((input) => (input as { project: string }).project);
		expect(projects).toContain("CDE.web");
	});

	test("a tap on a ticket row pushes the ticket route", async () => {
		const view = openRoute("/project/CDE");
		await view;

		// CDE-42 waits in Human Review, so the Review segment holds it.
		await waitFor(() => expect(screen.getByLabelText("Review")).toBeOnTheScreen());
		await fireEvent.press(screen.getByLabelText("Review"));
		await waitFor(() => expect(screen.getByTestId("ticket-row-CDE-42")).toBeOnTheScreen());

		await fireEvent.press(screen.getByTestId("ticket-row-CDE-42"));
		await waitFor(() => expect(view.getPathname()).toBe("/ticket/CDE-42"));
		expect(screen.getByRole("header", { name: "CDE-42" })).toBeOnTheScreen();
	});

	test("the project screen offers no board", async () => {
		const view = openRoute("/project/CDE");
		await view;

		await waitFor(() => expect(screen.getByLabelText("Active")).toBeOnTheScreen());
		expect(screen.queryByLabelText("Board")).toBeNull();
		expect(screen.queryByText("Board")).toBeNull();
		expect(callsTo(server, "tickets.board")).toEqual([]);
	});
});
