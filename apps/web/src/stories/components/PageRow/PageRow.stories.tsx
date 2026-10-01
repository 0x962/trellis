import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageRow } from "@trellis/ui";

const meta = {
	title: "Components/PageRow",
	component: PageRow,
	args: {
		title: "Release notes",
		summary: "Changes in the current release.",
		latestVersion: 3,
		publishedBy: "Dana Lee",
		publishedAt: "2026-09-30T12:00:00Z",
		age: "2h",
		watcher: null,
		openThreadCount: 0,
		pinned: false,
		deleted: false,
		link: <a href="#page">Open page</a>,
	},
} satisfies Meta<typeof PageRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Pinned: Story = { args: { pinned: true } };
export const Deleted: Story = { args: { deleted: true } };
export const Comments: Story = { args: { openThreadCount: 12 } };
export const Watched: Story = { args: { watcher: "Review agent" } };
export const Search: Story = { args: { variant: "search", project: "TRL" } };
export const LongContent: Story = {
	args: {
		title: "Release notes for the project with a long name and many related changes",
		summary:
			"The release updates ticket assignment, review comments, and project settings across every local workspace.",
	},
};
export const Actions: Story = {
	args: {
		actions: [
			{ label: "Rename", onSelect: () => {} },
			{ label: "Delete", danger: true, onSelect: () => {} },
		],
	},
};
