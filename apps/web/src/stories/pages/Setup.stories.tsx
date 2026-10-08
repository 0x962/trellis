import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentType } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Route } from "../../routes/setup";
import { project } from "./fixtures/project";
import { settingsResponses } from "./fixtures/settings";
import { settingsJourney } from "./fixtures/settingsJourney";

const SetupPage = Route.options.component as ComponentType;

const meta = {
	title: "Pages/Setup",
	component: SetupPage,
	parameters: {
		layout: "fullscreen",
		trellis: {
			route: Route,
			routePath: "/setup",
			path: "/setup",
			loadRoute: false,
			actor: null,
			responses: { ...settingsResponses, "projects.list": [] },
		},
	},
} satisfies Meta<typeof SetupPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Name: Story = {};
export const BlankName: Story = { parameters: { trellis: { responses: { "actors.default": { name: "" } } } } };
export const Project: Story = { parameters: { trellis: { actor: "Storybook", path: "/setup?step=project" } } };
export const ExistingProjects: Story = {
	parameters: {
		trellis: { actor: "Storybook", path: "/setup?step=project", responses: { "projects.list": [project] } },
	},
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };

const nameJourney = settingsJourney();
export const NameToProject: Story = {
	beforeEach: () => nameJourney.reset(),
	parameters: { trellis: { responses: nameJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = await canvas.findByRole("textbox", { name: "Your name" });
		await userEvent.clear(field);
		await expect(canvas.getByRole("button", { name: /^Continue/ })).toBeDisabled();
		await userEvent.type(field, "Alex Morgan");
		await userEvent.click(canvas.getByRole("button", { name: /^Continue/ }));
		await waitFor(() => expect(nameJourney.writes.at(-1)?.defaultActorName).toBe("Alex Morgan"));
		await expect(await canvas.findByRole("heading", { name: "Create your first project" })).toBeVisible();
		await userEvent.type(await canvas.findByRole("textbox", { name: "Project name" }), "Release workspace");
		await expect(canvas.getByRole("button", { name: /^Create/ })).toBeEnabled();
		await expect(canvas.getByRole("textbox", { name: "Key" })).not.toHaveValue("");
	},
};
