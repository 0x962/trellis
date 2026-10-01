import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArchivedToggle } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ArchivedToggle",
	component: ArchivedToggle,
	args: { expanded: false, semantics: "expanded", count: 12, onExpandedChange: () => {} },
	render: function Render(args) {
		const [expanded, setExpanded] = useStoryState(args.expanded);
		return <ArchivedToggle {...args} expanded={expanded} onExpandedChange={setExpanded} />;
	},
} satisfies Meta<typeof ArchivedToggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Expanded: Story = { args: { expanded: true } };
export const PressedSemantics: Story = { args: { semantics: "pressed" } };
export const NoCount: Story = { args: { count: undefined } };
export const LargeCount: Story = { args: { count: 12345 } };
