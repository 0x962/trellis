import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsNav } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/SettingsNav",
	component: SettingsNav,
	args: {
		label: "Settings",
		items: [
			{ id: "account", label: "Account" },
			{ id: "notifications", label: "Notifications" },
			{ id: "desktop", label: "Desktop" },
		],
		selected: "account",
		onSelect: () => {},
	},
	render: function Render(args) {
		const [selected, setSelected] = useStoryState(args.selected);
		return <SettingsNav {...args} selected={selected} onSelect={setSelected} />;
	},
} satisfies Meta<typeof SettingsNav>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NarrowTargets: Story = {
	globals: { viewport: { value: "narrow", isRotated: false } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const nav = canvas.getByRole("navigation", { name: "Settings" });
		for (const button of within(nav).getAllByRole("button")) {
			await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		}
		const notifications = within(nav).getByRole("button", { name: "Notifications" });
		notifications.focus();
		await userEvent.keyboard("{Enter}");
		await expect(notifications).toHaveAttribute("aria-current", "page");
		await expect(notifications).toHaveFocus();
	},
};
export const SecondSelected: Story = { args: { selected: "notifications" } };
export const LongLabels: Story = {
	args: {
		items: [
			{ id: "account", label: "Account and provider connections" },
			{ id: "desktop", label: "Desktop installation and runtime" },
		],
	},
};
