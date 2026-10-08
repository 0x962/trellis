import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ProjectSettingsView } from "../../features/project-settings/ProjectSettingsView";
import { ProjectSettingsJourneyView } from "./fixtures/ProjectSettingsJourneyView";
import { archivedProject, failure, id, pending } from "./fixtures/project";
import { projectJourney } from "./fixtures/projectJourney";
import { notes, settingsResponses } from "./fixtures/settings";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
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
export const DenseNotes: Story = {
	args: { section: "notes" },
	parameters: {
		trellis: {
			responses: {
				"notes.list": Array.from({ length: 24 }, (_, index) => ({
					...notes[0],
					id: id(800 + index),
					title: `${index + 1}. Release handoff and project instructions for the review team`,
					body: "Preserve each saved setting. Verify the project before release. ".repeat(12),
				})),
			},
		},
	},
};
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
export const DenseLabels: Story = {
	args: { section: "labels" },
	parameters: {
		trellis: {
			responses: {
				"labels.list": {
					groups: [],
					labels: Array.from({ length: 24 }, (_, index) => ({
						...settingsResponses["labels.list"].labels[0],
						id: id(900 + index),
						name: `Review category ${index + 1}: long descriptive label`,
						description: "Use this label for the synthetic review fixture.",
						ticketCount: 1234 + index,
					})),
				},
			},
		},
	},
};
export const EmptyLabels: Story = {
	args: { section: "labels" },
	parameters: { trellis: { responses: { "labels.list": { labels: [], groups: [] } } } },
};
export const Lifecycle: Story = { args: { section: "archive" } };
export const Archived: Story = { parameters: { trellis: { responses: { "projects.get": archivedProject } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };

const generalJourney = projectJourney();
export const GeneralSaveAndReturn: Story = {
	render: (args) => <ProjectSettingsJourneyView {...args} />,
	beforeEach: () => generalJourney.reset(),
	parameters: { trellis: { responses: generalJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const name = await canvas.findByRole("textbox", { name: "Project name" });
		await userEvent.clear(name);
		await userEvent.type(name, "Release workspace");
		await userEvent.click(canvas.getByRole("button", { name: "Save project" }));
		await waitFor(() => expect(generalJourney.writes.at(-1)?.name).toBe("Release workspace"));
		const nav = within(canvas.getByRole("navigation", { name: "Project settings" }));
		await userEvent.click(nav.getByRole("button", { name: "Labels" }));
		await userEvent.click(nav.getByRole("button", { name: "General" }));
		await expect(canvas.getByRole("textbox", { name: "Project name" })).toHaveValue("Release workspace");
		await expect(canvas.getByRole("textbox", { name: "Key" })).toHaveValue("DEMO");
	},
};

const templateJourney = projectJourney(1);
export const TemplateSaveRetryAndReturn: Story = {
	render: (args) => <ProjectSettingsJourneyView {...args} />,
	args: { section: "template" },
	beforeEach: () => templateJourney.reset(),
	parameters: { trellis: { responses: templateJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = await canvas.findByRole("textbox", { name: "Ticket template" });
		await userEvent.clear(field);
		await userEvent.type(field, "Describe the result. Record the checks.");
		await userEvent.click(canvas.getByRole("button", { name: "Save template" }));
		await expect(await canvas.findByText("The fixture rejects this save.")).toBeVisible();
		await expect(field).toHaveValue("Describe the result. Record the checks.");
		const release = templateJourney.holdNextSave();
		await userEvent.click(canvas.getByRole("button", { name: "Save template" }));
		await waitFor(() => expect(canvas.getByRole("button", { name: "Save template" })).toBeDisabled());
		await expect(canvas.getByText("Save in progress")).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Save template" }));
		await expect(templateJourney.requests).toHaveLength(2);
		await expect(templateJourney.writes).toHaveLength(0);
		release();
		await waitFor(() =>
			expect(templateJourney.writes.at(-1)?.ticketTemplate).toBe("Describe the result. Record the checks."),
		);
		const nav = within(canvas.getByRole("navigation", { name: "Project settings" }));
		await userEvent.click(nav.getByRole("button", { name: "General" }));
		await userEvent.click(nav.getByRole("button", { name: "Ticket template" }));
		await expect(canvas.getByRole("textbox", { name: "Ticket template" })).toHaveValue(
			"Describe the result. Record the checks.",
		);
	},
};
