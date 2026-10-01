import type { Meta, StoryObj } from "@storybook/react-vite";
import { HARNESS_DEFAULT_MODELS, MODEL_CATALOG } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ModelPicker } from "../../features/agents/ModelPicker";
import { useStoryState } from "../components/useStoryState";
import { noop } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/ModelPicker",
	component: ModelPicker,
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return <ModelPicker {...args} value={value} onValueChange={setValue} />;
	},
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
export const ChangeSelection: Story = {
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		const model = MODEL_CATALOG.find((entry) => entry.id === HARNESS_DEFAULT_MODELS.claude)!;
		await clickButton("Model")(context);
		await userEvent.click(await body.findByRole("option", { name: model.name }));
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(body.getByRole("button", { name: "Model" })).toHaveTextContent(model.name);
		await expect(body.getByRole("button", { name: "Model" })).not.toHaveTextContent("Default");
		await clickButton("Model")(context);
		await expect(await body.findByRole("option", { name: model.name })).toHaveAttribute("data-current", "true");
	},
};
