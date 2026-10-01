import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentType } from "react";
import { Route } from "../../routes/setup";
import { project } from "./fixtures/project";
import { settingsResponses } from "./fixtures/settings";

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
