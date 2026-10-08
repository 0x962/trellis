import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Command, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useCommandItems } from "../useCommandItems";

const items = [
	{ id: "TRL-42", label: "Restore the project view", hint: "TRL-42", current: true },
	{ id: "TRL-43", label: "Retain the selected tickets", hint: "TRL-43", checked: true },
	{ id: "TRL-44", label: "Review the release", hint: "TRL-44", checked: "mixed" as const },
];
const virtualItems = Array.from({ length: 200 }, (_, index) => ({
	id: `TRL-${index + 1}`,
	label: `Ticket ${index + 1}`,
	checked: index === 120,
}));
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
		const { selected, ...command } = useCommandItems(args);
		return (
			<>
				<Command {...args} {...command} />
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

function ResponsiveCommands({ args }: { args: NonNullable<Story["args"]> }) {
	const { selected, ...command } = useCommandItems(args);
	const [projectCommand, setProjectCommand] = useState("");
	const [virtualTicket, setVirtualTicket] = useState("");
	return (
		<div className="grid gap-4 p-4">
			<Command {...args} {...command} label="Search tickets" />
			<Command.Root label="Project commands">
				<Command.Field label="Search project commands" placeholder="Search project commands" />
				<Command.List>
					<Command.Group heading="Project">
						<Command.Row value="settings" label="Settings" onSelect={() => setProjectCommand("settings")} />
						<Command.Row value="archive" label="Archive" onSelect={() => setProjectCommand("archive")} />
					</Command.Group>
				</Command.List>
			</Command.Root>
			<Command.Virtual items={virtualItems} label="Search virtual tickets" onSelect={setVirtualTicket} />
			<p role="status" className="text-sm text-fg-muted">
				Selected: {selected || "None"}
			</p>
			<p role="status" className="text-sm text-fg-muted">
				Project command: {projectCommand || "None"}
			</p>
			<p role="status" className="text-sm text-fg-muted">
				Virtual ticket: {virtualTicket || "None"}
			</p>
		</div>
	);
}

export const DesktopTargets: Story = {
	render: (args) => <ResponsiveCommands args={args} />,
	globals: { viewport: { value: "desktop", isRotated: false } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const fixedFields = [
			canvas.getByRole("combobox", { name: "Search tickets" }),
			canvas.getByRole("combobox", { name: "Project commands" }),
		];
		for (const field of fixedFields) {
			const root = field.closest("[cmdk-root]") as HTMLElement;
			for (const option of within(root).getAllByRole("option")) {
				await expect(option.getBoundingClientRect().height).toBe(32);
			}
		}
		const virtualRoot = canvas
			.getByRole("combobox", { name: "Search virtual tickets" })
			.closest("[cmdk-root]") as HTMLElement;
		for (const option of within(virtualRoot).getAllByRole("option")) {
			await expect(option.getBoundingClientRect().height).toBe(44);
		}
	},
};

export const NarrowTargets: Story = {
	render: (args) => <ResponsiveCommands args={args} />,
	globals: { viewport: { value: "narrow", isRotated: false } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const option of canvas.getAllByRole("option")) {
			const bounds = option.getBoundingClientRect();
			await expect(bounds.height).toBeGreaterThanOrEqual(44);
			await expect(bounds.width).toBeGreaterThanOrEqual(44);
		}
		await userEvent.click(canvas.getByRole("combobox", { name: "Search tickets" }));
		await userEvent.keyboard("{End}{Enter}");
		await expect(canvas.getByText("Selected: TRL-44")).toBeVisible();
		await userEvent.click(canvas.getByRole("combobox", { name: "Project commands" }));
		await userEvent.keyboard("{End}{Enter}");
		await expect(canvas.getByText("Project command: archive")).toBeVisible();
		await userEvent.click(canvas.getByRole("combobox", { name: "Search virtual tickets" }));
		await userEvent.type(canvas.getByRole("combobox", { name: "Search virtual tickets" }), "Ticket 121");
		await userEvent.keyboard("{Enter}");
		await expect(canvas.getByText("Virtual ticket: TRL-121")).toBeVisible();
	},
};

export const Virtualized: Story = {
	args: { items: virtualItems },
	render: function Render(args) {
		const { selected, ...command } = useCommandItems(args);
		return (
			<>
				<Command.Virtual {...args} {...command} />
				<p role="status" className="mt-3 text-sm text-fg-muted">
					Selected: {selected || "None"}
				</p>
			</>
		);
	},
};
export const Dialog: Story = {
	render: function Render(args) {
		const [open, setOpen] = useState(false);
		const { selected: _selected, ...command } = useCommandItems(args);
		return (
			<>
				<Tooltip content="Search">
					<IconButton label="Search" icon={<MagnifyingGlass />} onClick={() => setOpen(true)} />
				</Tooltip>
				<Command.Dialog open={open} onOpenChange={setOpen}>
					<Command
						{...args}
						{...command}
						onSelect={(id) => {
							command.onSelect(id);
							setOpen(false);
						}}
					/>
				</Command.Dialog>
			</>
		);
	},
};
export const Composition: Story = {
	render: function Render() {
		const [selected, setSelected] = useState("");
		return (
			<Command.Root label="Project commands">
				<Command.Field label="Search commands" placeholder="Search commands" />
				<Command.List>
					<Command.Empty>No command matches.</Command.Empty>
					<Command.Group heading="Project">
						<Command.Row value="settings" label="Settings" onSelect={() => setSelected("Settings")} />
						<Command.Row value="archive" label="Archive" onSelect={() => setSelected("Archive")} />
					</Command.Group>
				</Command.List>
				<Command.Footer>
					<span role="status">{selected ? `Selected: ${selected}` : "Enter selects a command."}</span>
				</Command.Footer>
			</Command.Root>
		);
	},
};
export const ToggleSelection: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const checked = canvas.getByRole("option", { name: "Retain the selected tickets" });
		await expect(checked).toHaveAttribute("data-checked", "true");
		await userEvent.click(checked);
		await expect(checked).toHaveAttribute("data-checked", "false");
		const mixed = canvas.getByRole("option", { name: "Review the release" });
		await userEvent.click(mixed);
		await expect(mixed).toHaveAttribute("data-checked", "true");
		await expect(canvas.getByText("Selected: TRL-44")).toBeVisible();
	},
};
export const VirtualSelection: Story = {
	...Virtualized,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByRole("combobox"), "Ticket 121");
		const ticket = await canvas.findByRole("option", { name: "Ticket 121" });
		await expect(ticket).toHaveAttribute("data-checked", "true");
		await userEvent.keyboard("{Enter}");
		await expect(ticket).toHaveAttribute("data-checked", "false");
		await expect(canvas.getByText("Selected: TRL-121")).toBeVisible();
	},
};
export const DialogSelection: Story = {
	...Dialog,
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		const trigger = within(canvasElement).getByRole("button", { name: "Search" });
		await userEvent.click(trigger);
		const ticket = await body.findByRole("option", { name: "Retain the selected tickets" });
		await expect(ticket).toHaveAttribute("data-checked", "true");
		await userEvent.click(ticket);
		await userEvent.click(trigger);
		await expect(await body.findByRole("option", { name: "Retain the selected tickets" })).toHaveAttribute(
			"data-checked",
			"false",
		);
		await userEvent.keyboard("{Escape}");
	},
};
