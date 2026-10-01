import type { Meta, StoryObj } from "@storybook/react-vite";
import { NativeTerminal } from "../../../features/agents/NativeTerminal";
import { run } from "../../pages/fixtures/session";

const meta = {
	title: "Components/NativeTerminal",
	component: NativeTerminal,
	args: { run, readOnly: true },
	parameters: {
		docs: {
			description: {
				component:
					"The real wrapper shows startup, missing terminal, exit, and disconnect states. The shared network boundary blocks its runtime socket. TerminalSurface stories cover local connected and connecting output.",
			},
		},
	},
} satisfies Meta<typeof NativeTerminal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Starting: Story = { args: { run: { ...run, state: "starting", processStatus: null } } };
export const Exited: Story = {
	args: { run: { ...run, terminalId: "storybook-native-terminal", processStatus: "exited" } },
};
export const Disconnected: Story = {
	args: { run: { ...run, terminalId: "storybook-native-disconnected", state: "running", processStatus: "running" } },
};
export const Fill: Story = { args: { layout: "fill" } };
