import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { DeleteSessionDialog } from "../../features/sessions/DeleteSessionDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, pending, responses, session } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/DeleteSessionDialog",
	component: DeleteSessionDialog,
	args: { session, open: true, onOpenChange: noop },
	parameters: { trellis: { responses: { ...responses, "sessions.delete": {} } } },
	render: (args, context) => (
		<OverlayTrigger label="Open confirmation" initiallyOpen={!context.parameters.closed}>
			{(close) => (
				<DeleteSessionDialog
					{...args}
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
} satisfies Meta<typeof DeleteSessionDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "sessions.delete": pending } } },
	play: async (context) => {
		await clickButton("Delete session")(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "Delete session" })).toBeDisabled();
		await userEvent.keyboard("{Escape}");
		await expect(page.getByRole("dialog", { name: "Delete Catalog session?" })).toBeVisible();
	},
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "sessions.delete": failure } } },
	play: async (context) => {
		await clickButton("Delete session")(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await expect(await page.findByText("The session was not deleted")).toBeVisible();
		await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled();
		await expect(page.getByRole("button", { name: "Delete session" })).toBeEnabled();
	},
};
export const Success: Story = { play: clickButton("Delete session") };

export const RequestErrorNarrow: Story = {
	...RequestError,
	globals: { viewport: { value: "narrow", isRotated: false } },
};
export const PendingNarrow: Story = { ...Pending, globals: { viewport: { value: "narrow", isRotated: false } } };
let deleteRequests = 0;
export const Retry: Story = {
	beforeEach: () => {
		deleteRequests = 0;
	},
	parameters: {
		trellis: {
			responses: {
				"sessions.delete": () => {
					if (++deleteRequests === 1) return failure();
					return {};
				},
			},
		},
	},
	play: async (context) => {
		await RequestError.play!(context);
		const page = within(context.canvasElement.ownerDocument.body);
		page.getByRole("button", { name: "Delete session" }).focus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(deleteRequests).toBe(2);
	},
};
export const CancelAfterError: Story = {
	...RequestError,
	play: async (context) => {
		await RequestError.play!(context);
		const page = within(context.canvasElement.ownerDocument.body);
		page.getByRole("button", { name: "Cancel" }).focus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
	},
};
