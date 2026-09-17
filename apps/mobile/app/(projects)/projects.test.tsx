import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { type BrowseData, seedBrowse, seeder } from "../../test/browse";
import { connect } from "../../test/connect";
import { failureMessage, type Recorder } from "../../test/record";
import { renderRoute } from "../../test/renderRoute";
import { reset } from "../../test/seed";
import { human } from "../../test/server";

let data: BrowseData;
let net: Recorder;

const openTab = () => renderRoute("/projects");

const rows = () => screen.queryAllByTestId(/^project-row-/);

describe("the Projects tab", () => {
	beforeEach(async () => {
		data = await seedBrowse();
		net = connect();
	});

	afterEach(() => net.restore());

	test("the Projects tab asks projects.list once and never asks for a board", async () => {
		await openTab();

		await waitFor(() => expect(screen.getByTestId(`project-row-${data.root}`)).toBeOnTheScreen());
		expect(net.inputsTo("projects.list")).toEqual([{}]);
		expect(net.callsTo("tickets.board")).toEqual([]);
	});

	test("an archived project has no row in the tree", async () => {
		await human.projects.update({ project: data.host, archived: true });
		await openTab();

		await waitFor(() => expect(screen.getByTestId(`project-row-${data.web}`)).toBeOnTheScreen());
		expect(screen.queryByTestId(`project-row-${data.host}`)).toBeNull();
		expect(screen.queryByText("host")).toBeNull();
	});

	test("an empty server shows the no-projects state", async () => {
		await reset(seeder);
		await openTab();

		await waitFor(() => expect(screen.getByText("No projects yet")).toBeOnTheScreen());
		expect(net.inputsTo("projects.list")).toEqual([{}]);
		expect(rows()).toEqual([]);
	});

	test("a refused list shows the reason the server sent", async () => {
		const restore = net.fail("projects.list");
		await openTab();

		expect(await screen.findByText("Can't load projects")).toBeOnTheScreen();
		expect(screen.getByText(failureMessage)).toBeOnTheScreen();
		expect(rows()).toEqual([]);
		restore();
	});

	test("a tap on a project opens that project's ticket list", async () => {
		const view = await openTab();

		await waitFor(() => expect(screen.getByTestId(`project-row-${data.web}`)).toBeOnTheScreen());
		await fireEvent.press(screen.getByTestId(`project-row-${data.web}`));
		await waitFor(() => expect(view.getPathname()).toBe(`/project/${data.web}`));
	});
});
