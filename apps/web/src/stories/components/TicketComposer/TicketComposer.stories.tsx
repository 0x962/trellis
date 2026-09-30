import { Plus, X } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	Button,
	ComposerProperty,
	ComposerTitle,
	IconButton,
	StatusIcon,
	Textarea,
	TicketComposer,
	Tooltip,
} from "@trellis/ui";
import { useState } from "react";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/TicketComposer",
	component: TicketComposer,
	args: {
		open: true,
		title: "Create ticket",
		onOpenChange: () => {},
		onSubmit: () => {},
		header: <ComposerProperty>TRL</ComposerProperty>,
		children: (
			<>
				<ComposerTitle aria-label="Ticket title" defaultValue="Restore the project view" />
				<Textarea
					label="Description"
					hideLabel
					variant="composer"
					defaultValue="Retain the selected tickets after the review closes."
				/>
				<div className="ticket-composer-properties">
					<ComposerProperty icon={<StatusIcon category="todo" />}>Todo</ComposerProperty>
					<ComposerProperty detail="Wave 1">Desktop release</ComposerProperty>
				</div>
			</>
		),
		footer: (
			<Button type="submit" variant="primary" className="ml-auto">
				Create ticket
			</Button>
		),
	},
	parameters: {
		docs: {
			description: {
				component:
					"The form renders ComposerTitle and ComposerProperty. Command+Enter submits. Command+Shift+Enter submits and keeps the form open. Control replaces Command on other platforms.",
			},
		},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		const [result, setResult] = useState("");
		return (
			<>
				<Tooltip content="Create ticket">
					<IconButton label="Create ticket" icon={<Plus />} onClick={() => setOpen(true)} />
				</Tooltip>
				<p role="status" className="text-sm text-fg-muted">
					{result}
				</p>
				<TicketComposer
					{...args}
					open={open}
					onOpenChange={setOpen}
					onSubmit={(keepOpen) => {
						setResult("The local ticket is ready.");
						if (!keepOpen) setOpen(false);
					}}
					header={
						<>
							{args.header}
							<Tooltip content="Close">
								<IconButton label="Close" icon={<X />} className="ml-auto" onClick={() => setOpen(false)} />
							</Tooltip>
						</>
					}
				/>
			</>
		);
	},
} satisfies Meta<typeof TicketComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Closed: Story = { args: { open: false } };
export const Empty: Story = {
	args: {
		children: <ComposerTitle aria-label="Ticket title" placeholder="Ticket title" />,
		footer: (
			<Button type="submit" variant="primary" disabled>
				Create ticket
			</Button>
		),
	},
};
export const LongContent: Story = {
	args: {
		children: (
			<>
				<ComposerTitle
					aria-label="Ticket title"
					defaultValue="Restore the project view and retain every selected ticket after the review closes"
				/>
				<Textarea
					label="Description"
					variant="composer"
					rows={12}
					defaultValue={"The project retains the current ticket selection. ".repeat(80)}
				/>
			</>
		),
	},
};
