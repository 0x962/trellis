import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	Button,
	FormStatus,
	IconButton,
	Input,
	Sheet,
	SheetBody,
	SheetFooter,
	SheetSection,
	Tooltip,
} from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Sheet",
	component: Sheet,
	args: {
		open: false,
		title: "TRL-42",
		onOpenChange: () => {},
		children: (
			<SheetBody>
				<SheetSection title="The ask">
					<p>Restore the project view.</p>
				</SheetSection>
				<SheetSection title="Properties" divided>
					<Input label="Title" defaultValue="Restore the project view" />
				</SheetSection>
			</SheetBody>
		),
	},
	parameters: {
		docs: {
			description: {
				component:
					"The form renders SheetBody, SheetSection, and SheetFooter. Escape closes the sheet. The opener receives focus.",
			},
		},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		return (
			<>
				<Tooltip content="Open ticket">
					<IconButton label="Open ticket" icon={<Plus />} onClick={() => setOpen(true)} />
				</Tooltip>
				<Sheet {...args} open={open} onOpenChange={setOpen}>
					{args.children}
					<SheetFooter
						leading={<FormStatus status="saved" />}
						confirmation={<p className="text-xs text-fg-muted">The draft stays local.</p>}
					>
						<Button onClick={() => setOpen(false)}>Cancel</Button>
						<Button variant="primary" onClick={() => setOpen(false)}>
							Save
						</Button>
					</SheetFooter>
				</Sheet>
			</>
		);
	},
} satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Left: Story = { args: { open: true, side: "left" } };
export const NonModal: Story = { args: { open: true, modal: false } };
export const FullWidth: Story = { args: { open: true, width: "100%" } };
export const LongContent: Story = {
	args: {
		open: true,
		children: (
			<SheetBody>
				<p>{"The project contains tickets and waves. ".repeat(120)}</p>
			</SheetBody>
		),
	},
};
