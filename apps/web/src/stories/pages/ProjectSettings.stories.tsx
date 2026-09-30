import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { ProjectSettingsView } from "../../features/project-settings/ProjectSettingsView";
import { archivedProject, failure, pending } from "./fixtures/project";
import { settingsResponses } from "./fixtures/settings";

const meta = {
	title: "Pages/Project settings",
	component: ProjectSettingsView,
	args: { project: "DEMO", section: "", onSectionChange: () => {} },
	render: function Render(args) {
		const [, updateArgs] = useArgs();
		return <ProjectSettingsView {...args} onSectionChange={(section) => updateArgs({ section })} />;
	},
	parameters: { layout: "fullscreen", trellis: { path: "/p/DEMO/settings", responses: settingsResponses } },
} satisfies Meta<typeof ProjectSettingsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const General: Story = {};
export const Notes: Story = { args: { section: "notes" } };
export const EmptyNotes: Story = {
	args: { section: "notes" },
	parameters: { trellis: { responses: { "notes.list": [] } } },
};
export const NotesLoading: Story = {
	args: { section: "notes" },
	parameters: { trellis: { responses: { "notes.list": pending } } },
};
export const NotesError: Story = {
	args: { section: "notes" },
	parameters: { trellis: { responses: { "notes.list": failure } } },
};
export const TicketTemplate: Story = { args: { section: "template" } };
export const Statuses: Story = { args: { section: "statuses" } };
export const Labels: Story = { args: { section: "labels" } };
export const EmptyLabels: Story = {
	args: { section: "labels" },
	parameters: { trellis: { responses: { "labels.list": { labels: [], groups: [] } } } },
};
export const Lifecycle: Story = { args: { section: "archive" } };
export const Archived: Story = { parameters: { trellis: { responses: { "projects.get": archivedProject } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
