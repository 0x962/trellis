import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsNav } from "@trellis/ui";
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
export const SecondSelected: Story = { args: { selected: "notifications" } };
export const LongLabels: Story = {
	args: {
		items: [
			{ id: "account", label: "Account and provider connections" },
			{ id: "desktop", label: "Desktop installation and runtime" },
		],
	},
};
