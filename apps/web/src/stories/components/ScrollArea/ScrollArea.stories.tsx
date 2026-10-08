import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea } from "@trellis/ui";

const meta = {
	title: "Components/ScrollArea",
	component: ScrollArea,
	args: {
		label: "Tickets",
		className: "h-40 w-80",
		children: (
			<ul>
				{Array.from({ length: 30 }, (_, index) => `TRL-${index + 1}`).map((identifier) => (
					<li key={identifier} className="p-2">
						{identifier} Restore the project view
					</li>
				))}
			</ul>
		),
	},
	parameters: {
		docs: { description: { component: "Focus the region and use Page Up, Page Down, Home, or End to scroll." } },
	},
} satisfies Meta<typeof ScrollArea>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { children: null } };
export const Busy: Story = { args: { busy: true } };
