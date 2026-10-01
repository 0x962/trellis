import type { Meta, StoryObj } from "@storybook/react-vite";
import { TerminalSurface } from "@trellis/ui/terminal";
import { useEffect, useId } from "react";
import { disposeTerminalIdentity } from "../../../../../../packages/ui/src/terminal/TerminalSurface/terminalRegistry";
import { localTransport } from "./localTransport";

const meta = {
	title: "Components/TerminalSurface",
	component: TerminalSurface,
	args: {
		identity: "storybook-terminal",
		label: "Local terminal",
		createTransport: () => localTransport("connected"),
		onLeave: () => {},
		onOpenLink: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"The transport echoes local input. It opens no network or runtime connection. Read-only, connection, buffer-gap, and stopped states use the real terminal.",
			},
		},
	},
	render: function Render(args) {
		const identity = useId();
		useEffect(() => () => disposeTerminalIdentity(identity), [identity]);
		return (
			<div className="flex h-100 flex-col bg-bg font-mono text-sm text-fg">
				<TerminalSurface {...args} identity={identity} />
			</div>
		);
	},
} satisfies Meta<typeof TerminalSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
export const ReadOnly: Story = { args: { readOnly: true } };
export const Connecting: Story = { args: { createTransport: () => localTransport("connecting") } };
export const ErrorState: Story = { args: { createTransport: () => localTransport("error") } };
export const Unavailable: Story = { args: { createTransport: () => localTransport("unavailable") } };
export const BufferGap: Story = { args: { createTransport: () => localTransport("gap") } };
export const Stopped: Story = { args: { stopped: true } };
export const Fill: Story = { args: { layout: "fill" } };
