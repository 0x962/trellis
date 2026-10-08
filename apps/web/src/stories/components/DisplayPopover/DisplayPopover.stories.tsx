import type { Meta, StoryObj } from "@storybook/react-vite";
import { DisplayPopover } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/DisplayPopover",
	component: DisplayPopover,
	args: {
		fields: [
			{ value: "number", label: "ID", descending: false },
			{ value: "updated", label: "Updated", descending: true },
		],
		field: "number",
		descending: false,
		onSortChange: () => {},
	},
	parameters: {
		docs: { description: { component: "Open Display to select a sort field and reverse its direction." } },
	},
	render: function Render(args) {
		const [field, setField] = useStoryState(args.field);
		const [descending, setDescending] = useStoryState(args.descending);
		return (
			<DisplayPopover
				{...args}
				field={field}
				descending={descending}
				onSortChange={(nextField, nextDescending) => {
					setField(nextField);
					setDescending(nextDescending);
				}}
			/>
		);
	},
} satisfies Meta<typeof DisplayPopover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Descending: Story = { args: { field: "updated", descending: true } };
export const WithExtraFields: Story = {
	args: {
		beforeSort: <p className="text-sm">Group by wave</p>,
		afterSort: <p className="text-xs text-fg-muted">Completed tickets appear last.</p>,
	},
};
