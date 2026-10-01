import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HarnessAccountNameForm, IconButton, Tooltip } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/HarnessAccountNameForm",
	component: HarnessAccountNameForm,
	args: { open: true, busy: false, onClose: () => {}, onSubmit: () => {}, name: "Work account" },
	parameters: {
		docs: {
			description: {
				component: "The form uses local data. Submit closes the dialog. The provider does not receive a request.",
			},
		},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		return (
			<>
				<Tooltip content="Edit account">
					<IconButton label="Edit account" icon={<Plus />} onClick={() => setOpen(true)} />
				</Tooltip>
				<HarnessAccountNameForm {...args} open={open} onClose={() => setOpen(false)} onSubmit={() => setOpen(false)} />
			</>
		);
	},
} satisfies Meta<typeof HarnessAccountNameForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Closed: Story = { args: { open: false } };
export const Busy: Story = { args: { busy: true } };
export const ErrorState: Story = { args: { error: "The account name already exists." } };
