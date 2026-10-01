import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQuery } from "@tanstack/react-query";
import { LinkPrDialog } from "../../features/prs/PullRequests/components/LinkPrDialog";
import { useApp } from "../../lib/appContext";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, pending, responses, ticket } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/LinkPrDialog",
	component: LinkPrDialog,
	args: { ticket, open: true, onOpenChange: noop },
	parameters: {
		trellis: { responses: { ...responses, "pullRequests.list": [], "pullRequests.link": { id: "storybook-pr" } } },
	},
	render: function Render(args, context) {
		const { orpc } = useApp();
		useQuery(orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }));
		return (
			<OverlayTrigger label="Link pull request" initiallyOpen={!context.parameters.closed}>
				{(close) => (
					<LinkPrDialog
						{...args}
						onOpenChange={(open) => {
							if (!open) close();
						}}
					/>
				)}
			</OverlayTrigger>
		);
	},
} satisfies Meta<typeof LinkPrDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Link PR", "https://github.com/example/catalog/pull/12");
	await clickButton("Link")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Selected: Story = {
	play: async ({ canvasElement }) => {
		await fillField(canvasElement, "Link PR", "https://github.com/example/catalog/pull/12");
	},
};
export const Pending: Story = {
	parameters: { trellis: { responses: { "pullRequests.link": pending } } },
	play: submit,
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "pullRequests.link": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
