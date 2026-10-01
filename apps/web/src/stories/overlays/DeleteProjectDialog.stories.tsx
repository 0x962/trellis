import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeleteProjectDialog } from "../../features/project-actions/DeleteProjectDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, pending, project, responses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/DeleteProjectDialog",
	component: DeleteProjectDialog,
	args: { project, open: true, onOpenChange: noop },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"tickets.counts": { total: 4 },
				"flows.list": [],
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
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Type DEMO to confirm", "DEMO");
	await clickButton("Delete project")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		await fillField(canvasElement, "Type DEMO to confirm", "DEMO");
	},
};
export const Empty: Story = { parameters: { trellis: { responses: { "tickets.counts": { total: 0 } } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "tickets.counts": pending } } } };
export const Pending: Story = { parameters: { trellis: { responses: { "projects.delete": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "projects.delete": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
