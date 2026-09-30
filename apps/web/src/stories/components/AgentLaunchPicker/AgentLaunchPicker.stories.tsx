import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentLaunchPicker, ProviderIcon } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EffortField } from "./components/EffortField";

const meta = {
	title: "Components/AgentLaunchPicker",
	component: AgentLaunchPicker,
	args: {
		agent: "Codex",
		model: "GPT-6 Astra",
		icon: <ProviderIcon provider="openai" />,
		disabled: false,
		children: <EffortField />,
	},
	parameters: {
		docs: { description: { component: "Open the picker to change the effort. The selection stays local." } },
	},
} satisfies Meta<typeof AgentLaunchPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Choose agent" }));
		const panel = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Choose agent" });
		await waitFor(() => expect(panel).toBeVisible());
	},
};
export const Disabled: Story = { args: { disabled: true } };
export const LongContent: Story = {
	args: { agent: "Shared review account", model: "A model with a long name and a detailed variant" },
};
export const ChooseEffort: Story = {
	play: async (context) => {
		await Open.play!(context);
		const body = within(context.canvasElement.ownerDocument.body);
		const effort = body.getByRole("combobox", { name: "Effort" });
		await userEvent.click(effort);
		await userEvent.click(await body.findByRole("option", { name: "Medium" }));
		await expect(effort).toHaveTextContent("Medium");
	},
};
