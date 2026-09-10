import { afterEach, describe, expect, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { appContext } from "../../test/appContext";
import { callsTo, type FakeServer, inputsTo, startFakeServer, stopFakeServer } from "../../test/fakeServer";

let server: FakeServer;

// `renderRouter` returns a thenable. Await it once, and the route tree is
// mounted; the object itself carries `getPathname`.
const openTab = () => renderRouter(appContext(), { initialUrl: "/projects" });

const rows = () => screen.queryAllByTestId(/^project-row-/);

afterEach(() => stopFakeServer(server));

describe("the Projects tab", () => {
	test("the Projects tab asks projects.list once and never asks for a board", async () => {
		server = startFakeServer();
		const view = openTab();
		await view;

		await waitFor(() => expect(screen.getByTestId("project-row-CDE")).toBeOnTheScreen());
		expect(inputsTo(server, "projects.list")).toEqual([{}]);
		expect(callsTo(server, "tickets.board")).toEqual([]);
	});

	test("an archived project has no row in the tree", async () => {
		server = startFakeServer();
		const host = [...server.state.projects.values()].find((project) => project.path === "CDE.host")!;
		host.archivedAt = "2026-09-01T00:00:00.000Z";
		const view = openTab();
		await view;

		await waitFor(() => expect(screen.getByTestId("project-row-CDE.web")).toBeOnTheScreen());
		expect(screen.queryByTestId("project-row-CDE.host")).toBeNull();
		expect(screen.queryByText("host")).toBeNull();
	});

	test("an empty server shows the no-projects state", async () => {
		server = startFakeServer({ empty: true });
		const view = openTab();
		await view;

		await waitFor(() => expect(screen.getByText("No projects yet")).toBeOnTheScreen());
		expect(inputsTo(server, "projects.list")).toEqual([{}]);
		expect(rows()).toEqual([]);
	});

	test("a tap on a project opens that project's ticket list", async () => {
		server = startFakeServer();
		const view = openTab();
		await view;

		await waitFor(() => expect(screen.getByTestId("project-row-CDE.web")).toBeOnTheScreen());
		fireEvent.press(screen.getByTestId("project-row-CDE.web"));
		await waitFor(() => expect(view.getPathname()).toBe("/project/CDE.web"));
	});
});
