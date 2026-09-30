import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Tabs",
	component: Tabs,
	args: {
		items: [
			{ value: "all", label: "All", content: <p>Every ticket.</p> },
			{ value: "activity", label: "Activity", content: <p>Recent changes.</p> },
			{ value: "comments", label: "Comments", content: <p>Review comments.</p> },
		],
		value: "all",
		onValueChange: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Tabs renders TabsRoot, TabsList, and TabsTab. Arrow keys skip disabled tabs. Home and End select the first and last tabs.",
			},
		},
	},
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return <Tabs {...args} value={value} onValueChange={setValue} />;
	},
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SecondSelected: Story = { args: { value: "activity" } };
export const DisabledTab: Story = {
	args: {
		items: [
			{ value: "all", label: "All", content: <p>Every ticket.</p> },
			{ value: "activity", label: "Activity", content: <p>Recent changes.</p>, disabled: true },
			{ value: "comments", label: "Comments", content: <p>Review comments.</p> },
		],
	},
};
export const KeepMounted: Story = { args: { keepMounted: true } };
