import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton, StartControls } from "@trellis/ui";

const meta = {
	title: "Components/StartControls",
	component: StartControls,
	args: {
		pickers: <PickerButton label="Agent">Codex</PickerButton>,
		dependencies: [],
		starting: false,
		error: null,
		onStart: () => {},
	},
	parameters: {
		docs: {
			description: {
				component: "The start action is local. The control permits an explicit start when dependencies remain open.",
			},
		},
	},
} satisfies Meta<typeof StartControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Starting: Story = { args: { starting: true } };
export const ErrorState: Story = { args: { error: "The agent does not start." } };
export const OneDependency: Story = {
	args: { dependencies: [{ identifier: "TRL-42", title: "Restore the project view", reason: "is open" }] },
};
export const SeveralDependencies: Story = {
	args: {
		dependencies: [
			{ identifier: "TRL-42", title: "Restore the project view", reason: "is open" },
			{ identifier: "TRL-43", title: "Review the ticket selection", reason: "is not merged" },
		],
	},
};
export const ManyAgents: Story = { args: { label: "Start 4 agents" } };
