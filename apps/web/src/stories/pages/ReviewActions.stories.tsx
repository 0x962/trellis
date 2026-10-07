import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { reviewThread } from "./fixtures/review";
import meta, { OpenFinding, ReplyFailed } from "./Review.stories";

export default { ...meta, title: "Pages/Review actions" };
type Story = StoryObj<typeof meta>;
let threads = [reviewThread];

const assertClear = (canvasElement: HTMLElement, content: HTMLElement) => {
	const actions = canvasElement.querySelector<HTMLElement>(".review-action-bars")!.getBoundingClientRect();
	const box = content.getBoundingClientRect();
	expect(box.bottom).toBeLessThanOrEqual(actions.top);
};

export const CommentSaved: Story = {
	beforeEach: () => {
		threads = [structuredClone(reviewThread)];
	},
	parameters: {
		trellis: {
			responses: {
				"reviews.list": () => ({ items: threads, total: threads.length, open: threads.length }),
				"reviews.add": ({ body }: { body: string }) => {
					const thread = { ...reviewThread, id: `comment-${threads.length + 304}`, body };
					threads = [...threads, thread];
					return thread;
				},
			},
		},
	},
	play: async (context) => {
		await OpenFinding.play!(context);
		const canvas = within(context.canvasElement);
		const line = context.canvasElement.querySelector<HTMLElement>(
			'.review-diff-line[data-side="new"][data-line-number="2"]',
		)!;
		await userEvent.click(within(line).getByRole("button", { name: "Add line comment" }));
		const form = await canvas.findByRole("form", { name: "Add review comment" });
		await userEvent.type(within(form).getByRole("textbox", { name: "Comment" }), "The comment remains with this line.");
		const submit = within(form).getByRole("button", { name: "Add comment" });
		submit.scrollIntoView({ block: "nearest" });
		assertClear(context.canvasElement, submit);
		const box = submit.getBoundingClientRect();
		expect(submit.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))).toBe(true);
		await userEvent.click(submit);
		await waitFor(() => expect(canvas.queryByRole("form", { name: "Add review comment" })).not.toBeInTheDocument());
		const comment = (await canvas.findAllByText("The comment remains with this line.")).find((element) =>
			element.closest("article"),
		)!;
		await expect(comment).toBeVisible();
	},
};
export const CommentSavedNarrow: Story = {
	...CommentSaved,
	globals: { viewport: { value: "narrow", isRotated: false } },
};
export const ReplyErrorClear: Story = {
	...ReplyFailed,
	play: async (context) => {
		await ReplyFailed.play!(context);
		const alert = within(context.canvasElement).getByRole("alert");
		alert.scrollIntoView({ block: "nearest" });
		assertClear(context.canvasElement, alert);
	},
};
