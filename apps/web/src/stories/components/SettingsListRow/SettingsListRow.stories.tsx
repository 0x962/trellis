import { Bell, PencilSimple } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Input, SettingsListRow, Tooltip } from "@trellis/ui";

const meta = {
	title: "Components/SettingsListRow",
	component: SettingsListRow,
	args: {
		label: "Desktop notifications",
		description: "Show a notification when an agent needs a decision.",
		icon: <Bell />,
		actions: (
			<Tooltip content="Edit notifications">
				<IconButton label="Edit notifications" icon={<PencilSimple />} />
			</Tooltip>
		),
		onEdit: () => {},
	},
} satisfies Meta<typeof SettingsListRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Expanded: Story = {
	args: { children: <Input label="Notification name" defaultValue="Agent needs a decision" /> },
};
export const LongContent: Story = {
	args: {
		label: "Notifications for every agent across all projects",
		description:
			"Use the notification settings to select which updates appear when the desktop app runs in the background.",
	},
};
