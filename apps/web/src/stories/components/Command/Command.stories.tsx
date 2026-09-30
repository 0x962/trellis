import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Command, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";

const items = [
	{ id: "TRL-42", label: "Restore the project view", hint: "TRL-42", current: true },
	{ id: "TRL-43", label: "Retain the selected tickets", hint: "TRL-43", checked: true },
	{ id: "TRL-44", label: "Review the release", hint: "TRL-44", checked: "mixed" as const },
];
const meta = {
	title: "Components/Command",
	component: Command,
	args: { items, onSelect: () => {} },
	parameters: {
		docs: {
			description: {
				component:
					"Type to filter. Arrow keys move focus and Enter selects an item. The virtual list also supports Home, End, Page Up, and Page Down.",
			},
		},
	},
	render: function Render(args) {
		const [selected, setSelected] = useState("");
		return (
			<>
				<Command {...args} onSelect={setSelected} />
				<p role="status" className="mt-3 text-sm text-fg-muted">
					Selected: {selected || "None"}
				</p>
			</>
		);
	},
} satisfies Meta<typeof Command>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { items: [] } };
export const Grouped: Story = {
	args: {
		items: [],
		groups: [
			{ heading: "Tickets", items },
			{ heading: "Actions", items: [{ id: "new", label: "Create ticket", pinned: true }] },
		],
	},
};
export const Virtualized: Story = {
	render: (args) => (
		<Command.Virtual
			{...args}
			items={Array.from({ length: 200 }, (_, index) => ({
				id: `TRL-${index + 1}`,
				label: `Ticket ${index + 1}`,
				checked: index === 120,
			}))}
		/>
	),
};
export const Dialog: Story = {
	render: function Render(args) {
		const [open, setOpen] = useState(false);
		return (
			<>
				<Tooltip content="Search">
					<IconButton label="Search" icon={<MagnifyingGlass />} onClick={() => setOpen(true)} />
				</Tooltip>
				<Command.Dialog open={open} onOpenChange={setOpen}>
					<Command {...args} onSelect={() => setOpen(false)} />
				</Command.Dialog>
			</>
		);
	},
};
export const Composition: Story = {
	render: () => (
		<Command.Root label="Project commands">
			<Command.Field label="Search commands" placeholder="Search commands" />
			<Command.List>
				<Command.Empty>No command matches.</Command.Empty>
				<Command.Group heading="Project">
					<Command.Row value="settings" label="Settings" onSelect={() => {}} />
					<Command.Row value="archive" label="Archive" onSelect={() => {}} />
				</Command.Group>
			</Command.List>
			<Command.Footer>Enter selects a command.</Command.Footer>
		</Command.Root>
	),
};
