import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectSettingsSheet } from "../../features/shell/PageSheetHost/components/ProjectSettingsSheet";
import { SettingsSheet } from "../../features/shell/PageSheetHost/components/SettingsSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { failure, pending } from "./fixtures/project";
import { settingsResponses } from "./fixtures/settings";

const meta = {
	title: "Pages/Settings sheets",
	component: SettingsSheet,
	args: { at: "page" },
	beforeEach: () => {
		pageSheetActions.openSettings("account");
	},
	parameters: { layout: "fullscreen", trellis: { path: "/search", responses: settingsResponses } },
} satisfies Meta<typeof SettingsSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Account: Story = {};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const Project: Story = {
	beforeEach: () => {
		pageSheetActions.openProjectSettings({ project: "DEMO", section: "" });
	},
	render: () => <ProjectSettingsSheet at="page" />,
};
export const ProjectLoading: Story = {
	...Project,
	parameters: { trellis: { responses: { "projects.get": pending } } },
};
export const ProjectError: Story = {
	...Project,
	parameters: { trellis: { responses: { "projects.get": failure } } },
};
export const ProjectNarrow: Story = {
	...Project,
	globals: { viewport: { value: "phone", isRotated: false } },
};
