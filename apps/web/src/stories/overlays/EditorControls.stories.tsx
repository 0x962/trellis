import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import {
	destroyEditor,
	EditorView,
} from "../../features/ticket/Description/components/LazyEditor/components/EditorView/EditorView";
import { noop } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/EditorControls",
	component: EditorView,
	args: {
		markdown: "Inspect the component catalog.",
		contentKey: "storybook-editor",
		onChange: noop,
		onBlur: noop,
		onReady: noop,
		onAttachFiles: noop,
		placeholder: "Write a description",
		autoFocus: false,
	},
	beforeEach: () => {
		destroyEditor();
	},
} satisfies Meta<typeof EditorView>;
export default meta;
type Story = StoryObj<typeof meta>;
const selectText = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const editor = await within(canvasElement).findByRole("textbox", { name: "Description" });
	await userEvent.click(editor);
	const range = canvasElement.ownerDocument.createRange();
	range.selectNodeContents(editor.querySelector("p")!);
	const selection = canvasElement.ownerDocument.getSelection()!;
	selection.removeAllRanges();
	selection.addRange(range);
	canvasElement.ownerDocument.dispatchEvent(new Event("selectionchange"));
};
export const ClosedTrigger: Story = {};
export const FormatOpen: Story = { play: selectText };
export const FormatSelected: Story = { args: { markdown: "**Inspect the component catalog.**" }, play: selectText };
export const WithComments: Story = { args: { comments: { onComment: noop, onOpenThread: noop } }, play: selectText };
export const LinkOpen: Story = {
	play: async (context) => {
		await selectText(context);
		await clickButton("Link")(context);
	},
};
export const LinkSelected: Story = {
	args: { markdown: "[Inspect the component catalog.](https://example.test/catalog)" },
	play: async (context) => {
		await selectText(context);
		await clickButton("Link")(context);
	},
};
export const SlashOpen: Story = {
	args: { markdown: "" },
	play: async ({ canvasElement }) => {
		await userEvent.type(await within(canvasElement).findByRole("textbox", { name: "Description" }), "/");
	},
};
export const SlashFiltered: Story = {
	args: { markdown: "" },
	play: async ({ canvasElement }) => {
		await userEvent.type(await within(canvasElement).findByRole("textbox", { name: "Description" }), "/heading");
	},
};
export const SlashEmpty: Story = {
	args: { markdown: "" },
	play: async ({ canvasElement }) => {
		await userEvent.type(await within(canvasElement).findByRole("textbox", { name: "Description" }), "/unknown");
	},
};
