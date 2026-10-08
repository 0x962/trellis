import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeText } from "@trellis/ui";

const meta = {
	title: "Components/CodeText",
	component: CodeText,
	args: { children: "trellis ticket show TRL-42" },
} satisfies Meta<typeof CodeText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LongContent: Story = {
	args: { children: "apps/web/src/features/project-settings/ProjectSettings/ProjectSettings.tsx" },
};
