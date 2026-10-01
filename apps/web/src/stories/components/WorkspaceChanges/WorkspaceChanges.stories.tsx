import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceChanges } from "@trellis/ui";
import type { ComponentProps } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const contents: Record<string, NonNullable<ComponentProps<typeof WorkspaceChanges>["content"]>> = {
	"src/project.ts": {
		path: "src/project.ts",
		text: "const name = 'Trellis';",
		bytes: 23,
		binary: false,
		truncated: false,
	},
	"README.md": { path: "README.md", text: "# Trellis", bytes: 9, binary: false, truncated: false },
	"logo.png": { path: "logo.png", text: null, bytes: 123456, binary: true, truncated: false },
};

const meta = {
	title: "Components/WorkspaceChanges",
	component: WorkspaceChanges,
	args: {
		files: [
			{ path: "src/project.ts", status: "M" },
			{ path: "README.md", status: "A" },
			{ path: "logo.png", status: "A" },
		],
		diff: "--- a/src/project.ts\n+++ b/src/project.ts\n@@ -1 +1 @@\n-const name = 'Old';\n+const name = 'Trellis';",
		truncated: false,
		selected: "",
		onSelect: () => {},
		pending: false,
	},
	parameters: {
		docs: {
			description: {
				component: "Select a file to inspect its local content. Workspace diff restores the complete synthetic diff.",
			},
		},
	},
	render: function Render(args) {
		const [selected, setSelected] = useStoryState(args.selected);
		const content = selected === "" ? undefined : selected === args.content?.path ? args.content : contents[selected];
		return <WorkspaceChanges {...args} selected={selected} onSelect={setSelected} content={content} />;
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
export const SelectFiles: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const body = within(canvasElement.ownerDocument.body);
		const select = canvas.getByRole("combobox", { name: "Workspace file" });
		await userEvent.click(select);
		await userEvent.click(await body.findByRole("option", { name: "A README.md" }));
		await expect(canvas.getByText("# Trellis")).toBeVisible();
		await userEvent.click(select);
		await userEvent.click(await body.findByRole("option", { name: "A logo.png" }));
		await expect(canvas.getByText("This is a binary file.")).toBeVisible();
		await userEvent.click(select);
		await userEvent.click(await body.findByRole("option", { name: "Workspace diff" }));
		await expect(canvas.getByText(/--- a\/src\/project.ts/)).toBeVisible();
	},
};
