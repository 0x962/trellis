import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ProjectSectionMenu } from "../../features/shell/ProjectSectionMenu";
import { ProjectRowActions } from "../../features/sidebar/ProjectRowActions";
import { at, failure, pending, project, responses } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/ProjectMenus",
	component: ProjectRowActions,
	args: { project },
	parameters: {
		trellis: {
			path: "/p/DEMO/epics",
			responses: { ...responses, "projects.update": project, "tickets.counts": { total: 4 }, "flows.list": [] },
		},
	},
} satisfies Meta<typeof ProjectRowActions>;
export default meta;
type Story = StoryObj<typeof meta>;
const open = clickButton("Actions for Demo project");
const unarchive = async (context: { canvasElement: HTMLElement }) => {
	await open(context);
	await userEvent.click(
		await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Unarchive" }),
	);
};
export const ClosedTrigger: Story = {};
export const Open: Story = { play: open };
export const Archived: Story = { args: { project: { ...project, archivedAt: at } }, play: open };
export const Pending: Story = {
	args: Archived.args,
	parameters: { trellis: { responses: { "projects.update": pending } } },
	play: unarchive,
};
export const RequestError: Story = {
	args: Archived.args,
	parameters: { trellis: { responses: { "projects.update": failure } } },
	play: unarchive,
};
export const DeleteConfirmation: Story = {
	args: Archived.args,
	play: async (context) => {
		await open(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Delete…" }),
		);
	},
};
export const SectionClosed: Story = { render: () => <ProjectSectionMenu projectKey="DEMO" current="epics" /> };
export const SectionOpen: Story = { ...SectionClosed, play: clickButton("Epics") };
export const SectionSelected: Story = {
	render: () => <ProjectSectionMenu projectKey="DEMO" current="sessions" />,
	play: clickButton("Sessions"),
};
