import { Copy } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field, IconButton, Input, Tooltip } from "@trellis/ui";

const meta = {
	title: "Components/Field",
	component: Field,
	args: {
		label: "Project name",
		hint: "The name appears in the project list.",
		children: <Input label="Project name" defaultValue="Trellis" />,
	},
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const ErrorState: Story = { args: { error: "Enter a unique project name." } };
export const ReadOnly: Story = { args: { readOnly: true, readOnlyReason: "This project is archived." } };
export const TrailingAction: Story = {
	args: {
		trailingAction: (
			<Tooltip content="Copy name">
				<IconButton label="Copy name" icon={<Copy />} />
			</Tooltip>
		),
	},
};
