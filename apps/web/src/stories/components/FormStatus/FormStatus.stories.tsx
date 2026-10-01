import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormStatus } from "@trellis/ui";

const meta = {
	title: "Components/FormStatus",
	component: FormStatus,
	args: { status: "idle" },
} satisfies Meta<typeof FormStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Saving: Story = { args: { status: "saving" } };
export const Saved: Story = { args: { status: "saved" } };
export const ErrorState: Story = { args: { status: "error", message: "The project name already exists." } };
