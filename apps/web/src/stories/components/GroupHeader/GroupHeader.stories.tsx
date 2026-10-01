import type { Meta, StoryObj } from "@storybook/react-vite";
import { GroupHeader } from "@trellis/ui";
import { useState } from "react";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/GroupHeader",
	component: GroupHeader,
	args: { group: "wave-1", label: "Wave 1", count: "3/5", expanded: true },
	parameters: {
		docs: {
			description: {
				component:
					"Select the heading to change its expansion. Create and Start report the selected action below the header.",
			},
		},
	},
	render: function Render(args) {
		const [expanded, setExpanded] = useStoryState(args.expanded);
		const [action, setAction] = useState("");
		return (
			<>
				<GroupHeader
					{...args}
					expanded={expanded}
					onToggle={() => setExpanded(!expanded)}
					onCreate={args.onCreate && (() => setAction("New ticket selected."))}
					onStart={args.onStart && (() => setAction("Start wave selected."))}
				/>
				<p role="status" className="text-sm text-fg-muted">
					{action}
				</p>
			</>
		);
	},
} satisfies Meta<typeof GroupHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Collapsed: Story = { args: { expanded: false } };
export const Empty: Story = { args: { count: 0 } };
export const NoCount: Story = { args: { count: undefined } };
export const Fixed: Story = { args: { collapsible: false } };
export const Band: Story = { args: { appearance: "band" } };
export const Sidebar: Story = { args: { appearance: "sidebar" } };
export const Strip: Story = { args: { appearance: "strip" } };
export const Phone: Story = { args: { phone: true } };
export const Actions: Story = { args: { onCreate: () => {}, onStart: () => {} } };
export const LongLabel: Story = { args: { label: "Review the project settings and retain every open ticket" } };
