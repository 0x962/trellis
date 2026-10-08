import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { AgentPromptForm } from "../../features/settings/AgentPromptSettings/components/AgentPromptForm";
import { failure, pending, responses } from "./fixtures";
import { clickButton } from "./interactions";

const saved = {
	template: "Review {{ticket}} in {{project}}.",
	defaultTemplate: "Complete {{ticket}}.",
	variables: ["ticket", "project"],
	isCustom: true,
};
const meta = {
	title: "Overlays/AgentPromptForm",
	component: AgentPromptForm,
	args: { saved },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"settings.setAgentPrompt": { ...saved, template: saved.defaultTemplate, isCustom: false },
			},
		},
	},
} satisfies Meta<typeof AgentPromptForm>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await clickButton("Use default")(context);
	await clickButton("Save prompt")(context);
};
export const Selected: Story = {};
export const Default: Story = { args: { saved: { ...saved, template: saved.defaultTemplate, isCustom: false } } };
export const VariablesOpen: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(
			await within(canvasElement.ownerDocument.body).findByRole("combobox", { name: "Insert variable" }),
		);
	},
};
export const Pending: Story = {
	parameters: { trellis: { responses: { "settings.setAgentPrompt": pending } } },
	play: submit,
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "settings.setAgentPrompt": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
