import { Bell, Check, Code, WarningCircle } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Toaster, Tooltip, toast } from "@trellis/ui";
import { useEffect } from "react";

const meta = {
	title: "Components/Toaster",
	component: Toaster,
	parameters: {
		trellis: { toaster: false },
		docs: {
			description: {
				component:
					"Use each action to show a plain, success, error, or command toast. The command toast expands its local text. Toasts clear when the story closes.",
			},
		},
	},
	render: function Render(args) {
		useEffect(
			() => () => {
				toast.dismiss();
			},
			[],
		);
		return (
			<div className="flex gap-3">
				<Tooltip content="Plain toast">
					<IconButton label="Plain toast" icon={<Bell />} onClick={() => toast("Saved")} />
				</Tooltip>
				<Tooltip content="Success toast">
					<IconButton label="Success toast" icon={<Check />} onClick={() => toast.success("The checks pass.")} />
				</Tooltip>
				<Tooltip content="Error toast">
					<IconButton
						label="Error toast"
						icon={<WarningCircle />}
						onClick={() =>
							toast.error("The project does not save.", { description: "The project name already exists." })
						}
					/>
				</Tooltip>
				<Tooltip content="Command toast">
					<IconButton
						label="Command toast"
						icon={<Code />}
						onClick={() => toast.command({ title: "The command is ready.", command: "trellis ticket show TRL-42" })}
					/>
				</Tooltip>
				<Toaster {...args} />
			</div>
		);
	},
} satisfies Meta<typeof Toaster>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveStates: Story = {};
export const Top: Story = { args: { position: "top-center" } };
