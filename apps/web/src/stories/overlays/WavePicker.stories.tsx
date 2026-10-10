import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WavePicker } from "../../features/pickers/WavePicker";
import { useStoryState } from "../components/useStoryState";
import { failure, id, noop, pending, responses, wave } from "./fixtures";
import { chooseAndReopen, fillField } from "./interactions";

const meta = {
	title: "Overlays/WavePicker",
	component: WavePicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		const [mixed, setMixed] = useStoryState(args.mixed);
		return (
			<WavePicker
				{...args}
				open={open}
				value={value}
				onOpenChange={setOpen}
				mixed={mixed}
				onPick={(picked) => {
					setValue(picked?.ref);
					setMixed(false);
				}}
			/>
		);
	},
	args: { epic: "DEMO/catalog", onPick: noop, trigger: <PickerButton label="Wave">Wave</PickerButton> },
	parameters: { trellis: { responses } },
} satisfies Meta<typeof WavePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Wave" disabled>
				Wave
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: "DEMO/catalog/first-wave" } };
export const Mixed: Story = { args: { open: true, mixed: true } };

export const Empty: Story = {
	args: { open: true, allowNone: false },
	parameters: { trellis: { responses: { "epics.get": { ...responses["epics.get"], waves: [] } } } },
};
export const Loading: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "epics.get": pending } } },
};

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Wave", "First wave"),
};

export const CreateSuccess: Story = {
	args: { open: true, allowNone: false },
	parameters: {
		trellis: {
			responses: {
				"epics.get": { ...responses["epics.get"], waves: [] },
				"waves.create": { ...wave, id: id(451), ref: "DEMO/catalog/research", slug: "research", name: "Research" },
			},
		},
	},
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await fillField(context.canvasElement, "Search waves", "Research");
		await userEvent.click(await body.findByRole("option", { name: 'Create wave "Research"' }));
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
	},
};
export const CreateError: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "waves.create": failure } } },
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await fillField(context.canvasElement, "Search waves", "Research");
		await userEvent.click(await body.findByRole("option", { name: 'Create wave "Research"' }));
		await expect(await body.findByRole("alert")).toHaveTextContent("The local fixture refuses this request.");
		await expect(body.getByRole("combobox")).toHaveValue("Research");
	},
};
