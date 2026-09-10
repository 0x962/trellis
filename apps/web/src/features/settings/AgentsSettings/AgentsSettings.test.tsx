import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentSettingsSetInput } from "@trellis/api";
import { Toaster } from "@trellis/ui";
import { projectRow, rootId } from "../../../../test/agents";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AgentsSettings } from "./AgentsSettings";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<AgentsSettings />
		</>,
		{ path: "/settings", actor: "navid", server },
	);

// The block of one root project, named by its key and its name.
const projectGroup = (key: string) => screen.findByRole("group", { name: new RegExp(`^${key} `) });

const saves = (server: FakeServer) => server.callsTo("agents.setSettings");
const lastSave = (server: FakeServer) => saves(server).at(-1)!.input as AgentSettingsSetInput;

const commit = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) => {
	await user.clear(field);
	if (value !== "") await user.type(field, value);
	await user.tab();
};

describe("AgentsSettings", () => {
	test("the switch turns agents on with one full replace", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		const toggle = await screen.findByRole("switch", { name: "Turn on agents" });
		expect(toggle.getAttribute("aria-checked")).toBe("false");
		await user.click(toggle);
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(lastSave(server)).toEqual({ runner: "superset", enabled: true, projects: [] });
		expect(server.state.agentSettings.enabled).toBe(true);
		await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
	});

	test("the runner select offers Superset only", async () => {
		const user = userEvent.setup();
		render(createFakeServer());
		const runner = await screen.findByRole("combobox", { name: "Runner" });
		expect(runner.textContent).toBe("Superset");
		await user.click(runner);
		expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(["Superset"]);
		await user.keyboard("{Escape}");
	});

	// A manager serves a root and every sub-project under it, so only roots
	// get a block. An archived project takes no writes, so it gets none.
	test("shows one block per open root project", async () => {
		const server = createFakeServer();
		render(server);
		const roots = [...server.state.projects.values()].filter(
			(project) => project.parentId === null && project.archivedAt === null,
		);
		for (const root of roots) expect(await projectGroup(root.key)).toBeDefined();
		expect(screen.getAllByRole("group")).toHaveLength(roots.length);
	});

	test("turning a manager on saves the project row with the defaults", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		await user.click(within(await projectGroup("CDE")).getByRole("switch", { name: "Manager" }));
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(lastSave(server)).toEqual({
			runner: "superset",
			enabled: false,
			projects: [projectRow(rootId(server), { enabled: true })],
		});
	});

	test("the Superset project picker lists the runner's projects and names the Auto match", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		await server.client.projects.setRepos({
			project: "CDE",
			repos: [{ owner: "canary-technologies-corp", repo: "de" }],
		});
		render(server);
		const trellis = within(await projectGroup("TRL"));
		await waitFor(() =>
			expect(trellis.getByRole("combobox", { name: "Superset project" }).textContent).toBe("Auto: no match"),
		);
		const picker = within(await projectGroup("CDE")).getByRole("combobox", { name: "Superset project" });
		expect(picker.textContent).toBe("Auto: de");
		await user.click(picker);
		const options = await screen.findAllByRole("option");
		expect(options.map((option) => option.textContent)).toEqual(["Auto: de", "de", "trellis"]);
		await user.click(options[2]!);
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(lastSave(server).projects).toEqual([
			projectRow(rootId(server), { enabled: false, supersetProjectId: "sp-trellis" }),
		]);
	});

	test("a missing Superset CLI shows the reason and leaves Auto", async () => {
		const server = createFakeServer();
		server.state.runnerDown = "missing";
		render(server);
		expect(await screen.findByText("trellis cannot find the Superset CLI.")).toBeDefined();
		const picker = within(await projectGroup("CDE")).getByRole("combobox", { name: "Superset project" });
		expect(picker.textContent).toBe("Auto");
	});

	test("the base branch saves on blur and refuses an empty name", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		const branch = within(await projectGroup("CDE")).getByRole("textbox", { name: "Base branch" });
		expect((branch as HTMLInputElement).value).toBe("main");
		await commit(user, branch, "");
		expect(await screen.findByText("Enter a branch name.")).toBeDefined();
		expect(saves(server)).toHaveLength(0);
		await commit(user, branch, "develop");
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(lastSave(server).projects[0]!.baseBranch).toBe("develop");
		expect(screen.queryByText("Enter a branch name.")).toBeNull();
	});

	test("max builders takes a whole number from 1 to 20", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		const limit = within(await projectGroup("CDE")).getByRole("spinbutton", { name: "Max builders" });
		expect((limit as HTMLInputElement).value).toBe("3");
		for (const value of ["0", "21", "2.5"]) {
			await commit(user, limit, value);
			expect(await screen.findByText("Enter a whole number from 1 to 20.")).toBeDefined();
		}
		expect(saves(server)).toHaveLength(0);
		await commit(user, limit, "5");
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(lastSave(server).projects[0]!.maxConcurrent).toBe(5);
	});

	test("remove workspace when Done saves off", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		const remove = within(await projectGroup("CDE")).getByRole("checkbox", { name: "Remove workspace when Done" });
		expect(remove.getAttribute("aria-checked")).toBe("true");
		await user.click(remove);
		await waitFor(() => expect(saves(server)).toHaveLength(1));
		expect(lastSave(server).projects[0]!.removeWorkspaceOnDone).toBe(false);
	});

	test("a refused save shows a toast with Retry and restores the stored value", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		server.failNext("agents.setSettings", { code: "INPUT_VALIDATION_FAILED", data: { issues: [] } });
		render(server);
		const toggle = await screen.findByRole("switch", { name: "Turn on agents" });
		await user.click(toggle);
		expect(await screen.findByText("Couldn't save the agent settings")).toBeDefined();
		expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
		await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
		expect(server.state.agentSettings.enabled).toBe(false);
	});
});
