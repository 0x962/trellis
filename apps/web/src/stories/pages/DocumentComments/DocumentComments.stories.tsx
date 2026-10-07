import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EpicPage } from "../../../features/epics/EpicPage";
import { epic } from "../fixtures/epic";
import { project } from "../fixtures/project";
import { documentResource } from "../fixtures/resources";
import { pageFrame } from "../pageFrame";
import { commentFixture } from "./commentFixture";

const fixture = commentFixture();
const quote = "The controls support keyboard access.";
const comment = "Keep the complete document readable.";
const reply = "The keyboard check passes.";
const meta = {
	title: "Pages/Document comments",
	component: EpicPage,
	decorators: [pageFrame],
	args: { project, slug: epic.slug, search: { tab: "resources" }, onSearchChange: () => {} },
	parameters: {
		layout: "fullscreen",
		trellis: {
			path: `/p/DEMO/epics/interface-review#${documentResource.id}`,
			responses: fixture.responses,
		},
	},
	beforeEach: () => fixture.reset(),
} satisfies Meta<typeof EpicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

async function selectQuote(canvasElement: HTMLElement) {
	const canvas = within(canvasElement);
	const editor = await canvas.findByRole("textbox", { name: "Description" });
	const paragraph = within(editor).getByText(quote, { exact: true });
	await userEvent.click(paragraph);
	const range = canvasElement.ownerDocument.createRange();
	range.selectNodeContents(paragraph);
	const selection = canvasElement.ownerDocument.getSelection()!;
	selection.removeAllRanges();
	selection.addRange(range);
	canvasElement.ownerDocument.dispatchEvent(new Event("selectionchange"));
	await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("button", { name: "Comment" }));
	return within(canvasElement.ownerDocument.body);
}

async function settleSheet(canvasElement: HTMLElement) {
	const body = within(canvasElement.ownerDocument.body);
	const sheet = body.queryByRole("dialog", { name: "Comments" });
	if (sheet === null) return;
	await waitFor(() => {
		expect(getComputedStyle(sheet).opacity).toBe("1");
		expect(getComputedStyle(sheet).transform).toBe("none");
		expect(sheet).not.toHaveAttribute("data-starting-style");
	});
	expect(getComputedStyle(sheet).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
}

async function openComments(canvasElement: HTMLElement) {
	const canvas = within(canvasElement);
	const button = canvas.queryByRole("button", { name: "Comments" });
	if (button !== null) {
		await userEvent.click(button);
		await settleSheet(canvasElement);
	}
	return within(canvasElement.ownerDocument.body);
}

export const Lifecycle: Story = {
	play: async ({ canvasElement }) => {
		const body = await selectQuote(canvasElement);
		await settleSheet(canvasElement);
		const draft = body.getByRole("form", { name: "New comment" });
		await userEvent.type(within(draft).getByRole("textbox", { name: "Comment" }), comment);
		await userEvent.keyboard("{Control>}{Enter}{/Control}");
		await expect(await body.findByText(comment, { exact: true })).toBeVisible();
		expect(fixture.snapshot().threads[0]!.anchor.quote).toBe(quote);
		const replyInput = body.getByRole("textbox", { name: "Reply" });
		await userEvent.type(replyInput, reply);
		await userEvent.keyboard("{Control>}{Enter}{/Control}");
		await expect(await body.findByText(reply, { exact: true })).toBeVisible();
		await userEvent.click(body.getByRole("button", { name: "Resolve comment" }));
		await expect(await body.findByText("Every thread is resolved.")).toBeVisible();
		await userEvent.click(body.getByRole("button", { name: "Show resolved threads" }));
		const reopen = await body.findByRole("button", { name: "Reopen comment" });
		reopen.focus();
		await userEvent.keyboard("{Enter}");
		await expect(await body.findByRole("button", { name: "Resolve comment" })).toBeVisible();
		expect(fixture.snapshot().threads[0]!.resolved).toBeNull();
		const sheet = body.queryByRole("dialog", { name: "Comments" });
		if (sheet !== null) {
			await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
			await waitFor(() => expect(body.queryByRole("dialog", { name: "Comments" })).not.toBeInTheDocument());
		}
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Plan" }));
		await userEvent.click(canvas.getByRole("button", { name: documentResource.name }));
		await openComments(canvasElement);
		await expect(await body.findByText(comment, { exact: true })).toBeVisible();
		await expect(await body.findByText(reply, { exact: true })).toBeVisible();
		expect(fixture.snapshot().threads[0]!.comments.map((item) => item.body)).toEqual([comment, reply]);
	},
};

export const ReplyDraft: Story = {
	beforeEach: () => fixture.reset("", true),
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByRole("textbox", { name: "Description" });
		const body = await openComments(canvasElement);
		await userEvent.type(await body.findByRole("textbox", { name: "Reply" }), reply);
		await settleSheet(canvasElement);
		expect(body.getByRole("button", { name: "Post reply" })).toBeEnabled();
	},
};

export const CreateError: Story = {
	beforeEach: () => fixture.reset("create"),
	play: async ({ canvasElement }) => {
		const body = await selectQuote(canvasElement);
		await settleSheet(canvasElement);
		await userEvent.type(body.getByRole("textbox", { name: "Comment" }), comment);
		await userEvent.keyboard("{Control>}{Enter}{/Control}");
		await expect(await body.findByRole("alert")).toHaveTextContent("The comment was not saved.");
		expect(body.getByRole("textbox", { name: "Comment" })).toHaveValue(comment);
		expect(fixture.snapshot().threads).toHaveLength(0);
	},
};

export const ReplyError: Story = {
	beforeEach: () => fixture.reset("reply", true),
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByRole("textbox", { name: "Description" });
		const body = await openComments(canvasElement);
		await userEvent.type(await body.findByRole("textbox", { name: "Reply" }), reply);
		await userEvent.keyboard("{Control>}{Enter}{/Control}");
		await expect(await body.findByRole("alert")).toHaveTextContent("The reply was not saved.");
		expect(body.getByRole("textbox", { name: "Reply" })).toHaveValue(reply);
		expect(fixture.snapshot().threads[0]!.comments).toHaveLength(1);
	},
};

export const RemovedQuote: Story = {
	beforeEach: () => {
		fixture.reset("", true);
		fixture.responses["resources.update"]({ body: "## Required states\n\nThe controls support keyboard access." });
	},
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByRole("textbox", { name: "Description" });
		const body = await openComments(canvasElement);
		await expect(await body.findByText("Text removed", { exact: true })).toBeVisible();
		expect(fixture.snapshot().threads[0]!.anchor.quote).toBe("The ticket identifier remains visible.");
		await waitFor(() => expect(fixture.snapshot().threads[0]!.textRemoved).toBe(true));
	},
};

export const LoadError: Story = {
	beforeEach: () => fixture.reset("load"),
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByRole("textbox", { name: "Description" });
		const body = await openComments(canvasElement);
		await expect(await body.findByRole("alert")).toHaveTextContent("Could not load comments");
		expect(body.getByRole("button", { name: "Retry" })).toBeEnabled();
	},
};

export const RetryLoad: Story = {
	beforeEach: () => fixture.reset("load", true),
	play: async (context) => {
		await LoadError.play!(context);
		fixture.recover();
		const body = within(context.canvasElement.ownerDocument.body);
		body.getByRole("button", { name: "Retry" }).focus();
		await userEvent.keyboard("{Enter}");
		await expect(await body.findByText("Check the identifier at a phone width.")).toBeVisible();
		expect(body.queryByRole("alert")).not.toBeInTheDocument();
		expect(fixture.snapshot().threads).toHaveLength(1);
	},
};

export const DelayedRetry: Story = {
	beforeEach: () => fixture.reset("load", true),
	play: async (context) => {
		await LoadError.play!(context);
		const body = within(context.canvasElement.ownerDocument.body);
		const region = body.getByRole("region", { name: "Comments" });
		const pane = region.closest("aside") ?? region.closest('[role="dialog"]')!;
		const editor = within(context.canvasElement).getByRole("textbox", { name: "Description" });
		const paneBefore = pane.getBoundingClientRect().toJSON();
		const editorBefore = editor.getBoundingClientRect().toJSON();
		const retry = body.getByRole("button", { name: "Retry" });
		const finish = fixture.delayRecovery();
		retry.focus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(retry).toHaveAttribute("aria-busy", "true"));
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		expect(region).toBeInTheDocument();
		expect(retry).toBeInTheDocument();
		expect(retry).toHaveFocus();
		expect(retry).toHaveAttribute("aria-disabled", "true");
		expect(pane.getBoundingClientRect().toJSON()).toEqual(paneBefore);
		expect(editor.getBoundingClientRect().toJSON()).toEqual(editorBefore);
		finish();
		await expect(await body.findByText("Check the identifier at a phone width.")).toBeVisible();
		expect(body.queryByRole("alert")).not.toBeInTheDocument();
	},
};
