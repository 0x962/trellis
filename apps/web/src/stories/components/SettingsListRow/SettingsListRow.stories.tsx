import { Bell, PencilSimple } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Input, SettingsListRow, Tooltip } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

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
	parameters: {
		docs: { description: { component: "Select the row or its edit action to open or close the local editor." } },
	},
	render: function Render(args) {
		const [expanded, setExpanded] = useStoryState(Boolean(args.children));
		const toggle = () => setExpanded(!expanded);
		return (
			<ul>
				<SettingsListRow
					{...args}
					onEdit={toggle}
					actions={
						<Tooltip content="Edit notifications">
							<IconButton
								label="Edit notifications"
								icon={<PencilSimple />}
								disabled={args.disabled}
								onClick={toggle}
							/>
						</Tooltip>
					}
				>
					{expanded && (args.children ?? <Input label="Notification name" defaultValue="Agent needs a decision" />)}
				</SettingsListRow>
			</ul>
		);
	},
} satisfies Meta<typeof SettingsListRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Expanded: Story = {
	args: { children: <Input label="Notification name" defaultValue="Agent needs a decision" /> },
};
export const ToggleEditor: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const row = canvas.getByRole("button", { name: "Edit Desktop notifications" });
		await userEvent.click(row);
		await expect(row).toHaveAttribute("aria-expanded", "true");
		await expect(canvas.getByRole("textbox", { name: "Notification name" })).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Edit notifications" }));
		await expect(row).toHaveAttribute("aria-expanded", "false");
	},
};
export const LongContent: Story = {
	args: {
		label: "Notifications for every agent across all projects",
		description:
			"Use the notification settings to select which updates appear when the desktop app runs in the background.",
	},
};
