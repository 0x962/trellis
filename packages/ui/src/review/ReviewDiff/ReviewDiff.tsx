import { Plus } from "@phosphor-icons/react";
import {
	type CodeViewItem,
	type DiffLineAnnotation,
	type FileDiffContentsLoader,
	parsePatchFiles,
	type SelectedLineRange,
} from "@pierre/diffs";
import {
	CodeView,
	type CodeViewHandle,
	type CodeViewReactOptions,
	WorkerPoolContextProvider,
} from "@pierre/diffs/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { expandControls } from "./expandControls";
export type DiffAnchor = { path: string; side: "old" | "new"; line: number; startLine: number };
export type DiffThread = DiffAnchor & { id: string; version: number; updatedAt: string; revisionId: string | null };
type Props = {
	workerFactory: () => Worker;
	patch: string;
	revisionId: string;
	threads: DiffThread[];
	mode: "split" | "unified";
	theme: "light" | "dark" | "system";
	selectedFile?: string;
	filter?: string;
	renderThread: (id: string) => ReactNode;
	onSelect: (anchor: DiffAnchor) => void;
	loadFile?: (path: string, side: "old" | "new") => Promise<string>;
	onFiles: (files: { path: string; type: string; additions: number; deletions: number }[]) => void;
};
export function ReviewDiff({
	workerFactory,
	patch,
	revisionId,
	threads,
	mode,
	theme,
	selectedFile,
	filter = "",
	renderThread,
	onSelect,
	onFiles,
	loadFile,
}: Props) {
	const [selection, setSelection] = useState<{ id: string; range: SelectedLineRange } | null>(null);
	const viewer = useRef<CodeViewHandle<string, undefined>>(null);
	const files = useMemo(() => parsePatchFiles(patch).flatMap((patch) => patch.files), [patch]);
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
	const items = useMemo<CodeViewItem<string>[]>(() => {
		version.current += 1;
		return files
			.filter((file) => file.name.toLowerCase().includes(filter.toLowerCase()))
			.map((file) => {
				const annotations: DiffLineAnnotation<string>[] = [];
				for (const t of threads.filter((t) => t.path === file.name && t.revisionId === revisionId)) {
					const shown = file.hunks.some((h) =>
						t.side === "old"
							? t.line >= h.deletionStart && t.line < h.deletionStart + h.deletionCount
							: t.line >= h.additionStart && t.line < h.additionStart + h.additionCount,
					);
					annotations.push({
						side: t.side === "old" ? "deletions" : "additions",
						lineNumber: shown ? t.line : 0,
						metadata: t.id,
					});
				}
				return { id: file.name, type: "diff", fileDiff: file, annotations, version: version.current };
			});
	}, [files, threads, revisionId, filter]);
	const loadDiffFiles = useMemo<FileDiffContentsLoader | undefined>(
		() =>
			loadFile
				? async (file) => {
						const oldName = file.prevName ?? file.name;
						const [oldContent, newContent] = await Promise.all([loadFile(oldName, "old"), loadFile(file.name, "new")]);
						return {
							oldFile: { name: oldName, contents: oldContent },
							newFile: { name: file.name, contents: newContent },
						};
					}
				: undefined,
		[loadFile],
	);
	const options = useMemo<CodeViewReactOptions<string, undefined>>(
		() => ({
			theme: { light: "pierre-light", dark: "pierre-dark" },
			themeType: theme,
			diffStyle: mode,
			stickyHeaders: true,
			onPostRender: expandControls,
			loadDiffFiles,
			enableLineSelection: true,
			enableGutterUtility: true,
		}),
		[mode, theme, loadDiffFiles],
	);
	return (
		<WorkerPoolContextProvider
			highlighterOptions={{ theme: { light: "pierre-light", dark: "pierre-dark" }, preferredHighlighter: "shiki-js" }}
			poolOptions={{
				poolSize: 2,
				workerFactory,
			}}
		>
			<CodeView
				selectedLines={selection}
				onSelectedLinesChange={setSelection}
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
								const range: SelectedLineRange =
									selection?.id === item.id
										? selection.range
										: {
												start: line.lineNumber,
												end: line.lineNumber,
												side: line.side === "deletions" ? "deletions" : "additions",
											};
								if (range.endSide && range.side !== range.endSide) return;
								onSelect({
									path: item.fileDiff.name,
									side: range.side === "deletions" ? "old" : "new",
									startLine: Math.min(range.start, range.end),
									line: Math.max(range.start, range.end),
								});
							}}
						/>
					</Tooltip>
				)}
				ref={viewer}
				className="review-code"
				items={items}
				options={options}
				renderAnnotation={(a) => renderThread(a.metadata)}
			/>
		</WorkerPoolContextProvider>
	);
}
