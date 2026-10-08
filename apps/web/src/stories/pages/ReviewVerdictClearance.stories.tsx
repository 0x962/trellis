import type { StoryObj } from "@storybook/react-vite";
import type { ReviewThread } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { id } from "./fixtures/project";
import { reviewThread } from "./fixtures/review";
import meta from "./Review.stories";

export default { ...meta, title: "Pages/Review verdict clearance", args: { ...meta.args, tab: "diff" } };
type Story = StoryObj<typeof meta>;
let threads: ReviewThread[] = [];

const openFiles = async (canvasElement: HTMLElement) => {
	if (window.matchMedia("(max-width: 767px)").matches) {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Show 1 file" }));
	}
};

const assertClear = (canvasElement: HTMLElement, content: HTMLElement) => {
	const actions = canvasElement.querySelector<HTMLElement>(".review-float-bars")!.getBoundingClientRect();
	const body = canvasElement.querySelector<HTMLElement>(".review-body")!.getBoundingClientRect();
	const box = content.getBoundingClientRect();
	expect(body.bottom).toBeLessThanOrEqual(actions.top);
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
					const thread = { ...reviewThread, id: id(threads.length + 304), body };
					threads = [...threads, thread];
					return thread;
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await openFiles(canvasElement);
		await waitFor(() =>
			expect(canvasElement.querySelector('.review-diff-line[data-side="new"][data-line-number="2"]')).not.toBeNull(),
		);
		const line = canvasElement.querySelector<HTMLElement>('.review-diff-line[data-side="new"][data-line-number="2"]')!;
		await userEvent.click(within(line).getByRole("button", { name: "Add line comment" }));
		const form = await canvas.findByRole("form", { name: "Add review comment" });
		await userEvent.type(within(form).getByRole("textbox", { name: "Comment" }), "The comment remains with this line.");
		const submit = within(form).getByRole("button", { name: "Add comment" });
		submit.scrollIntoView({ block: "nearest" });
		assertClear(canvasElement, submit);
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
	parameters: {
		trellis: {
			responses: {
				"reviews.reply": () => {
					throw new Error("The reply did not save. Try again.");
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await openFiles(canvasElement);
		const reply = await canvas.findByRole("textbox", { name: "Reply" });
		await userEvent.type(reply, "Keep this reply draft.");
		await userEvent.click(canvas.getByRole("button", { name: "Post reply" }));
		const alert = await canvas.findByRole("alert");
		alert.scrollIntoView({ block: "nearest" });
		await expect(alert).toHaveTextContent("The reply did not save. Try again.");
		await expect(reply).toHaveValue("Keep this reply draft.");
		assertClear(canvasElement, alert);
	},
};
export const ReplyErrorClearNarrow: Story = {
	...ReplyErrorClear,
	globals: { viewport: { value: "narrow", isRotated: false } },
};
