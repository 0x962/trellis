import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip, Command, Dialog } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Chip",
	component: Chip,
	args: { label: "Priority", op: "is", value: "High" },
	parameters: {
		docs: {
			description: {
				component: "The editable chip changes its operator and opens local value choices. Remove clears the chip.",
			},
		},
	},
	render: function Render(args) {
		const [op, setOp] = useStoryState(args.op);
		const [value, setValue] = useStoryState(args.value);
		const [removed, setRemoved] = useState(false);
		const [open, setOpen] = useState(false);
		if (removed)
			return (
				<p role="status" className="text-sm text-fg-muted">
					{args.label} filter removed.
				</p>
			);
		return (
			<>
				<Chip
					{...args}
					op={op}
					value={value}
					onOpClick={args.onOpClick && (() => setOp(op === "is" ? "is not" : "is"))}
					onValueClick={args.onValueClick && (() => setOpen(true))}
					onRemove={args.onRemove && (() => setRemoved(true))}
				/>
				<Dialog open={open} onOpenChange={setOpen} title={`Select ${args.label.toLowerCase()}`}>
					<Command
						label="Priority choices"
						items={["High", "Urgent"].map((label) => ({ id: label, label, current: label === value }))}
						onSelect={(next) => {
							setValue(next);
							setOpen(false);
						}}
					/>
				</Dialog>
			</>
		);
	},
} satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Removable: Story = { args: { onRemove: () => {} } };
export const Editable: Story = { args: { onOpClick: () => {}, onValueClick: () => {}, onRemove: () => {} } };
export const LongContent: Story = { args: { value: "Urgent, high, and medium priority tickets" } };
export const EditAndRemove: Story = {
	args: Editable.args,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(canvas.getByRole("button", { name: "is" }));
		await expect(canvas.getByRole("button", { name: "is not" })).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "High" }));
		await userEvent.click(await body.findByRole("option", { name: "Urgent" }));
		await expect(canvas.getByRole("button", { name: "Urgent" })).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "Remove Priority" }));
		await expect(canvas.getByText("Priority filter removed.")).toBeVisible();
	},
};
