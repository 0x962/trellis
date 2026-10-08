import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageVersionRow } from "@trellis/ui";

const meta = {
	title: "Components/PageVersionRow",
	component: PageVersionRow,
	args: {
		number: 3,
		label: "Current",
		actor: "Dana Lee",
		sourcePath: "release-notes/index.html",
		sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
		bytes: 123456,
		publishedAt: "2026-09-30T12:00:00Z",
		selected: false,
		link: <a href="#version">Open version</a>,
	},
} satisfies Meta<typeof PageVersionRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const NoLabel: Story = { args: { label: null } };
export const LongPath: Story = {
	args: { sourcePath: "reports/release-notes/desktop/current-release/summary/index.html" },
};
