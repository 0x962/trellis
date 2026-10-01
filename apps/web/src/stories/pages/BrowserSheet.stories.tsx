import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrowserSheet } from "../../features/shell/PageSheetHost/components/BrowserSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { browserAdapter } from "./fixtures/browserAdapter";

const meta = {
	title: "Pages/Browser sheet",
	component: BrowserSheet,
	args: { at: "page" },
	beforeEach: () => {
		pageSheetActions.openBrowser("file:///storybook/reference.html");
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The real BrowserPage chrome uses an inert webview element. A catalog adapter supplies local documents and Electron events. The address is metadata. Native webview transport needs desktop verification.",
			},
		},
	},
} satisfies Meta<typeof BrowserSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const UnsupportedAddress: Story = {};
export const InvalidAddress: Story = {
	beforeEach: () => {
		pageSheetActions.openBrowser("storybook-invalid-address");
	},
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const Loading: Story = {
	beforeEach: () => {
		pageSheetActions.openBrowser("https://storybook.invalid/guide");
	},
	play: ({ canvasElement }) => browserAdapter(canvasElement, "loading"),
};
export const Loaded: Story = {
	...Loading,
	play: ({ canvasElement }) => browserAdapter(canvasElement, "loaded"),
};
export const LoadFailure: Story = {
	...Loading,
	play: ({ canvasElement }) => browserAdapter(canvasElement, "failed"),
};
export const BackAndForward: Story = {
	...Loading,
	play: ({ canvasElement }) => browserAdapter(canvasElement, "history"),
};
export const LoadedNarrow: Story = {
	...Loaded,
	globals: { viewport: { value: "phone", isRotated: false } },
};
