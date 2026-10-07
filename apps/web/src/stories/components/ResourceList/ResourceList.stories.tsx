import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResourceList } from "@trellis/ui";
import { useRef } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ResourceList",
	component: ResourceList,
	args: {
		rows: [
			{ id: "plan", kind: "doc", name: "Release plan", detail: "The epic description", pullRequest: null, plan: true },
			{ id: "doc", kind: "doc", name: "Review notes", detail: "Edited by Dana Lee", pullRequest: null },
			{ id: "link", kind: "link", name: "Release issue", detail: "example.test", pullRequest: 42 },
			{ id: "image", kind: "image", name: "project-view.png", detail: "24 KB", pullRequest: null },
			{ id: "file", kind: "file", name: "checks.txt", detail: "2 KB", pullRequest: null },
		],
		onOpen: () => {},
		onNewDocument: () => {},
		onRetry: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Select a resource to mark it active. New document adds and selects a local draft. ResourceList renders ResourceRow for all four resource kinds.",
			},
		},
	},
	render: function Render(args) {
		const [selectedId, setSelectedId] = useStoryState(args.selectedId);
		const [rows, setRows] = useStoryState(args.rows);
		const sequence = useRef(0);
		return (
			<ResourceList
				{...args}
				rows={rows}
				selectedId={selectedId}
				onOpen={setSelectedId}
				onNewDocument={
					args.onNewDocument &&
					(() => {
						const id = `new-document-${++sequence.current}`;
						setRows([
							...rows,
							{ id, kind: "doc", name: `Document ${sequence.current}`, detail: "Local draft", pullRequest: null },
						]);
						setSelectedId(id);
					})
				}
			/>
		);
	},
} satisfies Meta<typeof ResourceList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { rows: [] } };
export const Loading: Story = { args: { rows: [], loading: true } };
export const ErrorState: Story = { args: { rows: [], error: "The resources do not load." } };
export const Selected: Story = { args: { selectedId: "doc" } };
export const Creating: Story = { args: { newDocumentPending: true } };
export const ReadOnly: Story = { args: { onNewDocument: undefined } };
export const LongNames: Story = {
	args: {
		rows: (["doc", "link", "image", "file"] as const).flatMap((kind) =>
			["A", "B"].map((suffix) => ({
				id: `${kind}-${suffix}`,
				kind,
				name: `Acceptance checks and verification records for the complete resource journey version ${suffix}`,
				detail: "Synthetic resource",
				pullRequest: null,
			})),
		),
	},
	render: (args) => (
		<div className="flex h-96 w-full max-w-80 flex-col">
			<ResourceList {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const name of ["Documents", "Links", "Images", "Files"]) {
			const header = canvas.getByRole("button", { name });
			if (header.getAttribute("aria-expanded") === "false") await userEvent.click(header);
			const group = within(canvas.getByRole("region", { name }));
			const row = group.getByRole("button", { name: /version B$/ });
			row.focus();
			await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Tab}");
			await expect(row).toHaveFocus();
			const label = row.querySelector(".sidebar-label")!;
			await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
			await expect(getComputedStyle(label).whiteSpace).toBe("normal");
		}
	},
};
export const Groups: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const name of ["Links", "Images", "Files"]) {
			const header = canvas.getByRole("button", { name });
			await expect(header).toHaveAttribute("aria-expanded", "false");
			await userEvent.click(header);
			await expect(header).toHaveAttribute("aria-expanded", "true");
			for (const other of ["Documents", "Links", "Images", "Files"].filter((group) => group !== name)) {
				await expect(canvas.getByRole("button", { name: other })).toHaveAttribute("aria-expanded", "false");
			}
		}
		await expect(canvas.getByRole("button", { name: "checks.txt" })).toBeVisible();
	},
};
export const CreateDocument: Story = {
	args: { rows: [] },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "New document" }));
		await expect(canvas.getByRole("button", { name: /Document 1/ })).toHaveAttribute("aria-current", "page");
	},
};
