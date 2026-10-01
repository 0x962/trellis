import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProviderIcon } from "@trellis/ui";

const meta = {
	title: "Components/ProviderIcon",
	component: ProviderIcon,
	args: { provider: "openai" },
} satisfies Meta<typeof ProviderIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Anthropic: Story = { args: { provider: "anthropic" } };
export const Google: Story = { args: { provider: "google" } };
export const MetaProvider: Story = { args: { provider: "meta" } };
export const Vercel: Story = { args: { provider: "vercel" } };
export const Compatible: Story = { args: { provider: "openai-compatible" } };
export const Decorative: Story = { args: { decorative: true } };
export const Large: Story = { args: { className: "size-8" } };
