import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewCommentEditor } from "@trellis/ui/review";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ReviewCommentEditor",
	component: ReviewCommentEditor,
	args: {
		body: "The new behavior preserves the selection.",
		onChange: () => {},
		onSave: () => {},
		onCancel: () => {},
		renderPreview: (body) => <p className="whitespace-pre-wrap">{body}</p>,
	},
	parameters: {
		docs: {
			description: {
				component:
					"Write text or insert a suggestion. Preview shows the local draft. Save clears the draft. Cancel restores its initial text.",
			},
		},
	},
	render: function Render(args) {
		const [body, setBody] = useStoryState(args.body);
		return (
			<ReviewCommentEditor
				{...args}
				body={body}
				onChange={setBody}
				onSave={() => setBody("")}
				onCancel={() => setBody(args.body)}
			/>
		);
	},
} satisfies Meta<typeof ReviewCommentEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { body: "" } };
export const Pending: Story = { args: { pending: true } };
export const ErrorState: Story = { args: { error: "The comment does not save." } };
export const Suggestion: Story = { args: { suggestionText: "return selectedTickets;", location: "src/project.ts:42" } };
export const SuggestionUnavailable: Story = {
	args: { suggestionText: null, suggestionUnavailable: "The selected lines are outside the saved diff." },
};
export const Reply: Story = { args: { submitOnEnter: true, saveLabel: "Reply" } };
export const Preview: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("tab", { name: "Preview" }));
		await expect(await canvas.findByRole("tabpanel", { name: "Preview" })).toBeVisible();
	},
};
export const EmptyPreview: Story = { ...Preview, args: { body: "" } };
export const SuggestionInserted: Story = {
	args: { body: "", suggestionText: "```suggestion\nreturn selectedTickets;\n```", location: "src/project.ts:42" },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Suggest a change" }));
		await expect(canvas.getByRole("textbox", { name: "Comment" })).toHaveValue(
			"```suggestion\nreturn selectedTickets;\n```",
		);
	},
};
