import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { LabelPicker } from "../../features/pickers/LabelPicker";
import { useStoryState } from "../components/useStoryState";
import { failure, id, labels, noop, pending, responses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

let availableLabels = [...labels];

const meta = {
	title: "Overlays/LabelPicker",
	component: LabelPicker,
	beforeEach: () => {
		availableLabels = [...labels];
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [checked, setChecked] = useStoryState(args.checked);
		const [mixed, setMixed] = useStoryState(args.mixed);
		return (
			<LabelPicker
				{...args}
				open={open}
				checked={checked}
				mixed={mixed}
				onOpenChange={setOpen}
				onToggle={(label, selected) => {
					setChecked(selected ? [...checked, label.id] : checked.filter((entry) => entry !== label.id));
					setMixed(mixed?.filter((entry) => entry !== label.id));
				}}
			/>
		);
	},
	args: { project: "DEMO", checked: [], onToggle: noop, trigger: <PickerButton label="Label">Label</PickerButton> },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"labels.list": () => ({ labels: availableLabels, groups: [] }),
				"labels.create": (input: unknown) => {
					const label = { ...labels[0]!, id: id(300 + availableLabels.length), name: (input as { name: string }).name };
					availableLabels = [...availableLabels, label];
					return label;
				},
			},
		},
	},
} satisfies Meta<typeof LabelPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Label" disabled>
				Label
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, checked: [labels[0]!.id] } };
export const Mixed: Story = { args: { open: true, mixed: [labels[1]!.id] } };
export const Empty: Story = {
	args: { open: true },
	beforeEach: () => {
		availableLabels = [];
	},
};
export const ListPending: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "labels.list": pending } } },
};

export const ToggleSelection: Story = {
	args: { open: false },
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton("Label")(context);
		const design = await body.findByRole("option", { name: "Design" });
		await userEvent.click(design);
		await waitFor(() => expect(design).toHaveAttribute("data-checked", "true"));
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await clickButton("Label")(context);
		const selected = await body.findByRole("option", { name: "Design" });
		await waitFor(() => expect(selected).toHaveAttribute("data-checked", "true"));
		await userEvent.click(selected);
		await waitFor(() => expect(selected).toHaveAttribute("data-checked", "false"));
	},
};
const createLabel = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Search labels", "Research");
	await userEvent.click(
		await within(context.canvasElement.ownerDocument.body).findByRole("option", { name: /Create/ }),
	);
};
export const CreateSuccess: Story = {
	args: { open: true },
	play: async (context) => {
		await createLabel(context);
		const created = await within(context.canvasElement.ownerDocument.body).findByRole("option", { name: "Research" });
		await waitFor(() => expect(created).toHaveAttribute("data-checked", "true"));
	},
};
export const CreateError: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "labels.create": failure } } },
	play: async (context) => {
		await createLabel(context);
		await expect(await within(context.canvasElement.ownerDocument.body).findByRole("alert")).toHaveTextContent(
			"The local fixture refuses this request.",
		);
	},
};
