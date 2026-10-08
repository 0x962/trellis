import { ArrowClockwise } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FailureState, IconButton, Tooltip } from "@trellis/ui";

const meta = {
	title: "Components/FailureState",
	component: FailureState,
	args: {
		title: "The tickets do not load",
		description: "The connection to the server is closed.",
		detail: "The request returned 503.",
		action: (
			<Tooltip content="Retry">
				<IconButton label="Retry" icon={<ArrowClockwise />} />
			</Tooltip>
		),
	},
} satisfies Meta<typeof FailureState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Page: Story = { args: { variant: "page" } };
export const Inline: Story = { args: { variant: "inline" } };
export const Retrying: Story = { args: { recovery: "retrying" } };
export const Waiting: Story = { args: { recovery: "waiting" } };
export const NoDetail: Story = { args: { detail: null } };
export const LongDetail: Story = { args: { detail: "The request returned 503.\n".repeat(60) } };
