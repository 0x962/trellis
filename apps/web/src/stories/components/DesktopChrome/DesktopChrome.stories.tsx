import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesktopChrome } from "@trellis/ui";

const meta = {
	title: "Components/DesktopChrome",
	component: DesktopChrome,
	args: { enabled: true, children: <div className="h-80 bg-surface p-4">Desktop content</div> },
} satisfies Meta<typeof DesktopChrome>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Browser: Story = { args: { enabled: false } };
