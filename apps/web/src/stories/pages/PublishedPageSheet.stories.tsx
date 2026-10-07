import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PublishedPageSheet } from "../../features/shell/PageSheetHost/components/PublishedPageSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { page, pageResponses } from "./fixtures/page";

const openSheet = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement);
	const body = within(canvasElement.ownerDocument.body);
	const trigger = await canvas.findByRole("button", { name: "Open published Page" });
	await userEvent.click(trigger);
	await waitFor(() => expect(body.getByRole("dialog", { name: "Page" })).toBeVisible());
	await waitFor(() => expect(body.getByRole("heading", { name: page.title })).toBeVisible());
	await userEvent.click(await body.findByRole("button", { name: "Close" }));
	await waitFor(() => expect(trigger).toHaveFocus());
	await userEvent.click(trigger);
	await waitFor(() => expect(body.getByRole("dialog", { name: "Page" })).toBeVisible());
};

const meta = {
	title: "Pages/Published Page sheet",
	component: PublishedPageSheet,
	beforeEach: () => {
		pageSheetActions.closePublishedPage();
	},
	render: () => (
		<>
			<button type="button" onClick={() => pageSheetActions.openPublishedPage({ ref: page.ref })}>
				Open published Page
			</button>
			<PublishedPageSheet />
		</>
	),
	parameters: {
		layout: "fullscreen",
		a11y: { options: { iframes: false } },
		trellis: { path: "/search", responses: pageResponses },
	},
	play: async ({ canvasElement }) => openSheet(canvasElement),
} satisfies Meta<typeof PublishedPageSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Narrow: Story = {
	globals: { viewport: { value: "narrow", isRotated: false } },
};
