import { PencilSimple } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, InlineEdit, Tooltip } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const save = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const input = await within(canvasElement).findByRole("textbox", { name: "Project name" });
	await userEvent.clear(input);
	await userEvent.type(input, "Review workspace{Enter}");
};

const meta = {
	title: "Components/InlineEdit",
	component: InlineEdit,
	args: { label: "Project name", value: "Trellis", editing: false, onEditingChange: () => {}, onSave: async () => {} },
	parameters: {
		docs: {
			description: {
				component:
					"Use Rename to edit the value. Enter or blur saves it. Escape restores it. Empty input, a pending save, and a refusal use the real field behavior.",
			},
		},
	},
	render: function Render(args) {
		const [editing, setEditing] = useStoryState(args.editing);
		const [value, setValue] = useStoryState(args.value);
		return (
			<div className="flex items-center gap-3">
				<InlineEdit
					{...args}
					value={value}
					editing={editing}
					onEditingChange={setEditing}
					onSave={async (next) => {
						await args.onSave(next);
						setValue(next);
					}}
				>
					{value}
				</InlineEdit>
				<Tooltip content="Rename">
					<IconButton label="Rename" icon={<PencilSimple />} onClick={() => setEditing(true)} />
				</Tooltip>
			</div>
		);
	},
} satisfies Meta<typeof InlineEdit>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Editing: Story = { args: { editing: true } };
export const Empty: Story = { args: { editing: true, value: "" } };
export const Refused: Story = {
	args: {
		editing: true,
		onSave: async () => {
			throw new Error("The project name already exists.");
		},
	},
	play: async (context) => {
		await save(context);
		await expect(
			await within(context.canvasElement.ownerDocument.body).findByText("The project name already exists."),
		).toBeVisible();
		await expect(within(context.canvasElement).getByRole("textbox", { name: "Project name" })).toHaveAttribute(
			"aria-invalid",
			"true",
		);
	},
};
export const Pending: Story = {
	args: { editing: true, onSave: () => new Promise<void>(() => {}) },
	play: async (context) => {
		await save(context);
		await waitFor(() =>
			expect(within(context.canvasElement).getByRole("textbox", { name: "Project name" })).toBeDisabled(),
		);
	},
};
export const LongValue: Story = { args: { value: "Review every project in the current desktop release" } };
