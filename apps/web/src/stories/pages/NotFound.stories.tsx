import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotFoundState } from "../../features/shell/NotFoundState";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Not found",
	component: NotFoundState,
	args: { ref: "DEMO-404", searchFor: "DEMO-404" },
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotFoundState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ticket: Story = {};
export const Project: Story = { args: { ref: "MISSING", searchFor: "MISSING" } };
export const SearchLink: Story = { args: { searchFor: undefined } };
export const LongReference: Story = {
	args: { ref: "DEMO.interface-review.component-catalog-reference", searchFor: "component catalog reference" },
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
