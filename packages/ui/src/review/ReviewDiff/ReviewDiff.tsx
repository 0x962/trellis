import { Plus } from "@phosphor-icons/react";
import { type CodeViewItem, type FileDiffContentsLoader } from "@pierre/diffs";
import { CodeView, type CodeViewHandle, type CodeViewReactOptions } from "@pierre/diffs/react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { commentInteractions } from "./commentInteractions";
import { expandControls } from "./expandControls";
import { lineAnnotations } from "./lineAnnotations";
import { parseReviewFiles } from "./parseReviewFiles";
export type DiffAnchor = { path: string; side: "old" | "new"; line: number; startLine: number };
export type DiffThread = DiffAnchor & { id: string; version: number; updatedAt: string; revisionId: string | null };
type Props = {
	patch: string;
	revisionId: string;
	threads: DiffThread[];
	mode: "split" | "unified";
	theme: "light" | "dark" | "system";
	selectedFile?: string;
	filter?: string;
	renderThread: (id: string) => ReactNode;
	composer?: DiffAnchor | null;
	renderComposer?: () => ReactNode;
	onSelect: (anchor: DiffAnchor) => void;
	loadFile?: (path: string, side: "old" | "new") => Promise<string>;
	onFiles: (files: { path: string; type: string; additions: number; deletions: number }[]) => void;
};
export function ReviewDiff({
	patch,
	revisionId,
	threads,
	mode,
	theme,
	selectedFile,
	filter = "",
	renderThread,
	composer = null,
	renderComposer,
	onSelect,
	onFiles,
	loadFile,
}: Props) {
	const viewer = useRef<CodeViewHandle<ReactNode, undefined>>(null);
	const files = useMemo(() => parseReviewFiles(patch), [patch]);
	useEffect(() => {
		onFiles(
			files.map((f) => ({
				path: f.name,
				type: f.type,
				additions: f.hunks.reduce((n, h) => n + h.additionLines, 0),
				deletions: f.hunks.reduce((n, h) => n + h.deletionLines, 0),
			})),
		);
	}, [files, onFiles]);
	useEffect(() => {
		if (selectedFile) viewer.current?.scrollTo({ type: "item", id: selectedFile, align: "start" });
	}, [selectedFile]);
	const version = useRef(0);
	const items = useMemo<CodeViewItem<ReactNode>[]>(() => {
		version.current += 1;
		return files
			.filter((file) => file.name.toLowerCase().includes(filter.toLowerCase()))
			.map((file) => {
				const annotations = lineAnnotations(file, threads, revisionId, composer).map((annotation) => ({
					...annotation,
					metadata: annotation.metadata === "composer" ? renderComposer?.() : renderThread(annotation.metadata),
				}));
				return { id: file.name, type: "diff", fileDiff: file, annotations, version: version.current };
			});
	}, [files, threads, revisionId, filter, composer, renderThread, renderComposer]);
	const loadDiffFiles = useMemo<FileDiffContentsLoader | undefined>(
		() =>
			loadFile
				? async (file) => {
						const oldName = file.prevName ?? file.name;
						const [oldContent, newContent] = await Promise.all([loadFile(oldName, "old"), loadFile(file.name, "new")]);
						return {
							oldFile: { name: oldName, contents: oldContent, lang: "text" },
							newFile: { name: file.name, contents: newContent, lang: "text" },
						};
					}
				: undefined,
		[loadFile],
	);
	const options = useMemo<CodeViewReactOptions<ReactNode, undefined>>(
		() => ({
			...commentInteractions<ReactNode>((anchor) => {
				onSelect(anchor);
				viewer.current?.clearSelectedLines();
			}),
			theme: { light: "pierre-light", dark: "pierre-dark" },
			themeType: theme,
			diffStyle: mode,
			stickyHeaders: true,
			unsafeCSS:
				"[data-file-info] { border-block-width: .5px; } [data-additions], [data-additions] [data-gutter] { border-left-width: .5px; } [data-deletions], [data-deletions] [data-content] { border-right-width: .5px; }",
			onPostRender: expandControls,
			loadDiffFiles,
			enableLineSelection: true,
			enableGutterUtility: true,
		}),
		[mode, theme, loadDiffFiles, onSelect],
	);
	if (items.length === 0)
		return (
			<div className="review-diff-empty">
				<EmptyState
					title={filter ? "No matching files" : "No changes"}
					description={
						filter ? "Clear the file filter to show all changes." : "This revision has no text changes to display."
					}
				/>
			</div>
		);
	return (
		<CodeView
			renderGutterUtility={(hover, item) => (
				<Tooltip content="Add line comment">
					<IconButton
						label="Add line comment"
						icon={<Plus />}
						onClick={(event) => {
							event.stopPropagation();
							if (item.type !== "diff") return;
							const line = hover();
							if (!line || !("side" in line)) return;
							onSelect({
								path: item.fileDiff.name,
								side: line.side === "deletions" ? "old" : "new",
								startLine: line.lineNumber,
								line: line.lineNumber,
							});
						}}
					/>
				</Tooltip>
			)}
			ref={viewer}
			className="review-code"
			items={items}
			options={options}
			renderAnnotation={(annotation) => annotation.metadata}
		/>
	);
}
