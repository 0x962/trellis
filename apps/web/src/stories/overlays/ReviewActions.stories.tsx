import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PrActions } from "../../features/prs/PullRequestRow/components/PrActions";
import { ApplySuggestionsDialog } from "../../features/reviews/ReviewApply/ApplySuggestionsDialog";
import { LocalStateMenu } from "../../features/reviews/ReviewPage/components/ReviewIdentity/components/LocalStateMenu";
import { DraftNote } from "../../features/reviews/VerdictBar/components/DraftNote";
import { useStoryState } from "../components/useStoryState";
import { pullRequest, reviewThread } from "../pages/fixtures/review";
import { actor, at, failure, noop, pending, responses, ticket } from "./fixtures";
import { clickButton, fillField } from "./interactions";
import { OverlayTrigger } from "./OverlayTrigger";

const pr = { ...pullRequest, source: "manual" as const, linkedBy: actor, linkedAt: at };
const meta = {
	title: "Overlays/ReviewActions",
	component: PrActions,
	args: { ticket, pr },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"pullRequests.unlink": {},
				"pullRequests.setLocalState": pr,
				"reviews.apply": { headSha: "a".repeat(40) },
			},
		},
	},
} satisfies Meta<typeof PrActions>;
export default meta;
type Story = StoryObj<typeof meta>;
const remove = async (context: { canvasElement: HTMLElement }) => {
	await clickButton("Actions for PR #42")(context);
	await userEvent.click(
		await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Remove" }),
	);
};
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Actions for PR #42") };
export const RemoveConfirmation: Story = { play: remove };
export const RemovePending: Story = {
	parameters: { trellis: { responses: { "pullRequests.unlink": pending } } },
	play: async (context) => {
		await remove(context);
		await clickButton("Remove")(context);
	},
};
export const RemoveError: Story = {
	...RemovePending,
	parameters: { trellis: { responses: { "pullRequests.unlink": failure } } },
};
export const LocalStateClosed: Story = { render: () => <LocalStateMenu id={pr.id} number={42} localState="ready" /> };
export const LocalStateReady: Story = { ...LocalStateClosed, play: clickButton("Actions for PR #42") };
export const LocalStateNotReady: Story = {
	render: () => <LocalStateMenu id={pr.id} number={42} localState="not-ready" />,
	play: clickButton("Actions for PR #42"),
};
export const CommitSuggestion: Story = {
	render: () => (
		<ApplySuggestionsDialog
			pr={pr.url}
			headSha="local-head"
			threads={[reviewThread]}
			onClose={noop}
			onApplied={noop}
			onHeadMoved={noop}
		/>
	),
};
export const CommitPending: Story = {
	...CommitSuggestion,
	parameters: { trellis: { responses: { "reviews.apply": pending } } },
	play: clickButton("Commit changes"),
};
export const CommitError: Story = {
	...CommitSuggestion,
	parameters: { trellis: { responses: { "reviews.apply": failure } } },
	play: clickButton("Commit changes"),
};
const renderVerdict = (args: Pick<ComponentProps<typeof DraftNote>, "note" | "error" | "processing">) =>
	function Render() {
		const [note, setNote] = useStoryState(args.note);
		return (
			<OverlayTrigger label="Review note">
				{(close) => (
					<DraftNote
						{...args}
						open
						title="Request changes"
						description="Send the review with a note."
						confirmLabel="Send review"
						note={note}
						noteRequired
						onNote={setNote}
						onConfirm={close}
						onCancel={close}
					/>
				)}
			</OverlayTrigger>
		);
	};
const verdict = { note: "Please add a keyboard check.", error: null, processing: false };
export const VerdictNote: Story = { render: renderVerdict(verdict) };
export const VerdictPending: Story = { render: renderVerdict({ ...verdict, processing: true }) };
export const VerdictError: Story = { render: renderVerdict({ ...verdict, error: "The review did not send." }) };
export const VerdictEmpty: Story = {
	render: renderVerdict({ ...verdict, note: "" }),
	play: clickButton("Send review"),
};
export const EditVerdict: Story = {
	...VerdictNote,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await fillField(context.canvasElement, "Note", "Please check the keyboard focus.");
		await expect(body.getByRole("textbox", { name: "Note" })).toHaveValue("Please check the keyboard focus.");
		await clickButton("Send review")(context);
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
	},
};
