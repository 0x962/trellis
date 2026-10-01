import type { Meta, StoryObj } from "@storybook/react-vite";
import { type DiffAnchor, ReviewCommentEditor, ReviewDiff } from "@trellis/ui/review";
import { useState } from "react";
import { userEvent, within } from "storybook/test";
import { ReviewDiffSection } from "../../../../../../packages/ui/src/gallery/components/DomainSections/sections/ReviewDiffSection";
import { useStoryState } from "../useStoryState";
import { anchor, binaryPatch, newLines, oldLines, patch, renamedPatch } from "./fixtures";

const noFiles = new Set<string>();

const meta = {
	title: "Components/ReviewDiff",
	component: ReviewDiff,
	args: {
		patch,
		revisionId: "storybook-revision",
		threads: [],
		mode: "unified",
		theme: "system",
		renderThread: () => null,
		onSelect: () => {},
		onFiles: () => {},
		loadFile: async (_path, side) => (side === "old" ? oldLines : newLines).join("\n"),
	},
	parameters: {
		docs: {
			description: {
				component:
					"Select diff lines and inspect comment anchors. The fixture includes empty and loading panes, open and resolved threads, outdated anchors, and a read file.",
			},
		},
	},
	render: function Render(args, context) {
		const [selected, setSelected] = useStoryState<DiffAnchor | null>(args.selectedAnchor ?? null);
		const [composer, setComposer] = useStoryState<DiffAnchor | null>(args.composer ?? null);
		const [body, setBody] = useState("");
		const [viewed, setViewed] = useStoryState(args.viewed ?? noFiles);
		return (
			<div className="flex h-160 flex-col overflow-hidden border border-border bg-bg">
				<ReviewDiff
					{...args}
					theme={context.globals.theme}
					selectedAnchor={selected}
					composer={composer}
					viewed={viewed}
					onViewed={(path, read) => {
						const next = new Set(viewed);
						if (read) next.add(path);
						else next.delete(path);
						setViewed(next);
					}}
					onSelect={(next) => {
						setSelected(next);
						setComposer(next);
					}}
					renderComposer={() => (
						<ReviewCommentEditor
							body={body}
							onChange={setBody}
							onSave={() => setComposer(null)}
							onCancel={() => setComposer(null)}
							renderPreview={(text) => <p>{text}</p>}
						/>
					)}
				/>
			</div>
		);
	},
} satisfies Meta<typeof ReviewDiff>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveStates: Story = { render: () => <ReviewDiffSection /> };
export const Unified: Story = {};
export const Split: Story = { args: { mode: "split" } };
export const Empty: Story = { args: { patch: "" } };
export const NoMatchingFiles: Story = { args: { filter: "missing.ts" } };
export const Binary: Story = { args: { patch: binaryPatch } };
export const Renamed: Story = { args: { patch: renamedPatch } };
export const Viewed: Story = { args: { viewed: new Set(["src/project.ts"]) } };
export const SelectedRange: Story = { args: { selectedAnchor: { ...anchor, startLine: 9 } } };
export const Composer: Story = { args: { composer: anchor } };
export const FullFile: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Show full file" }));
	},
};
