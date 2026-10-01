import type { Meta, StoryObj } from "@storybook/react-vite";
import { HARNESS_DEFAULT_MODELS } from "@trellis/api";
import { ModelPicker } from "../../features/agents/ModelPicker";
import { noop } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/ModelPicker",
	component: ModelPicker,
	args: { harness: "claude", onValueChange: noop },
} satisfies Meta<typeof ModelPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Model") };
export const Disabled: Story = { args: { disabled: true } };
export const Selected: Story = { args: { value: HARNESS_DEFAULT_MODELS.claude }, play: clickButton("Model") };
export const Codex: Story = { args: { harness: "codex" }, play: clickButton("Model") };
export const OpenCode: Story = { args: { harness: "opencode" }, play: clickButton("Model") };
export const Pi: Story = { args: { harness: "pi" }, play: clickButton("Model") };
export const Muse: Story = { args: { harness: "muse" }, play: clickButton("Model") };
export const EmptySearch: Story = {
	play: async (context) => {
		await clickButton("Model")(context);
		await fillField(context.canvasElement, "Search models", "no matching model");
	},
};
