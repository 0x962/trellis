import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowSummarySchema } from "@trellis/api";
import { expect, userEvent, within } from "storybook/test";
import { DeleteProjectDialog } from "../../features/project-actions/DeleteProjectDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { at, failure, id, noop, pending, project, responses } from "./fixtures";
import { fillField } from "./interactions";

const flow = FlowSummarySchema.parse({
	id: id(80),
	project: project.key,
	slug: "review",
	name: "Review",
	description: "Review a proposed change.",
	harness: null,
	version: 1,
	nodeCount: 3,
	edgeCount: 2,
	createdAt: at,
	updatedAt: at,
});

const meta = {
	title: "Overlays/DeleteProjectDialog",
	component: DeleteProjectDialog,
	args: { project, open: true, onOpenChange: noop },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"tickets.counts": { total: 4 },
				"flows.list": [flow],
				"projects.delete": { deleted: project.id },
			},
		},
	},
	render: (args, context) => (
		<OverlayTrigger label="Delete project" initiallyOpen={!context.parameters.closed}>
			{(close) => (
				<DeleteProjectDialog
					{...args}
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
} satisfies Meta<typeof DeleteProjectDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const bodyOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

const dialogOf = async (canvasElement: HTMLElement) =>
	within(await bodyOf(canvasElement).findByRole("dialog", { name: "Delete Demo project?" }));

const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Type DEMO to confirm", "DEMO");
	await userEvent.click((await dialogOf(context.canvasElement)).getByRole("button", { name: "Delete project" }));
};

export const Open: Story = {
	play: async ({ canvasElement }) => {
		const body = bodyOf(canvasElement);
		await expect(
			await body.findByText(
				"This permanently deletes DEMO and all project data: 4 tickets, ticket attachments, resources, Pages, and 1 flow with every step. You cannot undo this.",
			),
		).toBeVisible();
		await expect((await dialogOf(canvasElement)).getByRole("button", { name: "Delete project" })).toBeDisabled();
	},
};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		await fillField(canvasElement, "Type DEMO to confirm", "DEMO");
		await expect((await dialogOf(canvasElement)).getByRole("button", { name: "Delete project" })).toBeEnabled();
	},
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "tickets.counts": { total: 0 }, "flows.list": [] } } },
	play: async ({ canvasElement }) => {
		const body = bodyOf(canvasElement);
		await expect(
			await body.findByText(
				"This permanently deletes DEMO and all project data: 0 tickets, ticket attachments, resources, Pages, and 0 flows with every step. You cannot undo this.",
			),
		).toBeVisible();
		await expect((await dialogOf(canvasElement)).getByRole("button", { name: "Delete project" })).toBeEnabled();
	},
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "tickets.counts": pending } } },
	play: async ({ canvasElement }) => {
		await expect((await dialogOf(canvasElement)).getByRole("button", { name: "Delete project" })).toBeDisabled();
		await expect(
			await bodyOf(canvasElement).findByText("Trellis checks the tickets and flows before deletion."),
		).toBeVisible();
	},
};
export const FlowLoading: Story = {
	parameters: { trellis: { responses: { "flows.list": pending } } },
	play: async ({ canvasElement }) => {
		await expect((await dialogOf(canvasElement)).getByRole("button", { name: "Delete project" })).toBeDisabled();
	},
};
export const TicketReadError: Story = {
	parameters: { trellis: { responses: { "tickets.counts": failure } } },
	play: async ({ canvasElement }) => {
		const body = bodyOf(canvasElement);
		await expect(await body.findByRole("alert")).toHaveTextContent("The project contents did not load.");
		await expect(body.getByRole("button", { name: "Retry" })).toBeEnabled();
		await expect((await dialogOf(canvasElement)).getByRole("button", { name: "Delete project" })).toBeDisabled();
	},
};
export const ReadError: Story = {
	parameters: { trellis: { responses: { "flows.list": failure } } },
	play: async ({ canvasElement }) => {
		const body = bodyOf(canvasElement);
		await expect(await body.findByRole("alert")).toHaveTextContent("The project contents did not load.");
		await expect(body.getByRole("button", { name: "Retry" })).toBeEnabled();
		await expect((await dialogOf(canvasElement)).getByRole("button", { name: "Delete project" })).toBeDisabled();
	},
};
export const Pending: Story = {
	parameters: { trellis: { responses: { "projects.delete": pending } } },
	play: async (context) => {
		await submit(context);
		const dialog = await dialogOf(context.canvasElement);
		await expect(dialog.getByLabelText("Type DEMO to confirm")).toBeDisabled();
		await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
		await expect(dialog.getByRole("button", { name: "Delete project" })).toBeDisabled();
		await expect(dialog.getByRole("button", { name: "Delete project" })).toHaveAttribute("aria-busy", "true");
	},
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "projects.delete": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
