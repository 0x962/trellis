import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ReviewHeaderActions } from "../../features/reviews/ReviewHeaderActions";
import { pullRequest, reviewStatus, revision } from "../pages/fixtures/review";
import { failure, noop, pending } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/GithubActions",
	component: ReviewHeaderActions,
	args: { pr: pullRequest.url, revision, onDone: noop },
	parameters: {
		trellis: {
			responses: {
				"reviews.metadata": { mergeQueueEntry: null },
				"reviews.mergeTickets": [],
				"reviews.action": { state: "closed", completedTicketIds: [] },
			},
		},
	},
} satisfies Meta<typeof ReviewHeaderActions>;
export default meta;
type Story = StoryObj<typeof meta>;
const open = clickButton("GitHub actions");
const choose = (name: string) => async (context: { canvasElement: HTMLElement }) => {
	await open(context);
	await userEvent.click(await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name }));
};
const close = async (context: { canvasElement: HTMLElement }) => {
	await choose("Close pull request")(context);
	await clickButton("Close pull request")(context);
};
export const ClosedTrigger: Story = {};
export const Open: Story = { play: open };
export const Draft: Story = {
	args: { revision: { ...revision, meta: { ...reviewStatus, isDraft: true } } },
	play: open,
};
export const Merged: Story = {
	args: { revision: { ...revision, meta: { ...reviewStatus, state: "MERGED" } } },
	play: open,
};
export const Queued: Story = {
	parameters: { trellis: { responses: { "reviews.metadata": { mergeQueueEntry: { id: "queue-1" } } } } },
	play: open,
};
export const Loading: Story = { parameters: { trellis: { responses: { "reviews.metadata": pending } } }, play: open };
export const CloseConfirmation: Story = { play: choose("Close pull request") };
export const MergeConfirmation: Story = { play: choose("Merge") };
export const Pending: Story = { parameters: { trellis: { responses: { "reviews.action": pending } } }, play: close };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "reviews.action": failure } } },
	play: close,
};
export const Success: Story = { play: close };
