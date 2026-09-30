import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceChanges } from "@trellis/ui";

const meta = {
	title: "Components/WorkspaceChanges",
	component: WorkspaceChanges,
	args: {
		files: [
			{ path: "src/project.ts", status: "M" },
			{ path: "README.md", status: "A" },
		],
		diff: "--- a/src/project.ts\n+++ b/src/project.ts\n@@ -1 +1 @@\n-const name = 'Old';\n+const name = 'Trellis';",
		truncated: false,
		selected: "",
		onSelect: () => {},
		pending: false,
	},
} satisfies Meta<typeof WorkspaceChanges>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { files: [], diff: "" } };
export const Loading: Story = { args: { pending: true } };
export const ErrorState: Story = { args: { error: "The file does not load." } };
export const TruncatedDiff: Story = { args: { truncated: true } };
export const File: Story = {
	args: {
		selected: "README.md",
		content: { path: "README.md", text: "# Trellis", bytes: 9, binary: false, truncated: false },
	},
};
export const Binary: Story = {
	args: {
		selected: "logo.png",
		content: { path: "logo.png", text: null, bytes: 123456, binary: true, truncated: false },
	},
};
export const TruncatedFile: Story = {
	args: {
		selected: "README.md",
		content: { path: "README.md", text: "# Trellis", bytes: 1234567, binary: false, truncated: true },
	},
};
