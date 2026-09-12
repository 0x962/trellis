import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery/useMediaQuery";
import { Input } from "../../primitives/Input";

type FileRow = { path: string; type: string; additions: number; deletions: number };
type Props = {
	files: FileRow[];
	selected: string;
	counts: Record<string, number>;
	onSelect: (path: string) => void;
	search: string;
	onSearch: (value: string) => void;
};
export function ReviewFiles({ files, selected, counts, onSelect, search, onSearch }: Props) {
	const current = useRef({ files, counts, onSelect });
	current.current = { files, counts, onSelect };
	const hasMatches = files.some((file) => file.path.toLowerCase().includes(search.toLowerCase()));
	const coarse = useMediaQuery("(pointer: coarse)");
	const { model } = useFileTree({
		paths: files.map((file) => file.path),
		initialExpansion: "open",
		flattenEmptyDirectories: true,
		fileTreeSearchMode: "hide-non-matches",
		itemHeight: coarse ? 44 : 28,
		onSelectionChange: (paths) => {
			const path = paths.at(-1);
			if (path && current.current.files.some((file) => file.path === path)) current.current.onSelect(path);
		},
		renderRowDecoration: ({ item }) => {
			const count = current.current.counts[item.path];
			return count ? { text: String(count), title: `${count} open comments and drafts` } : null;
		},
	});
	useEffect(() => {
		model.resetPaths(files.map((file) => file.path));
	}, [files, model]);
	useEffect(() => {
		const statuses: GitStatusEntry[] = files.map((file) => ({
			path: file.path,
			status:
				file.type === "new"
					? "added"
					: file.type === "deleted"
						? "deleted"
						: file.type.startsWith("rename")
							? "renamed"
							: "modified",
		}));
		model.setGitStatus(statuses);
	}, [files, model]);
	useEffect(() => {
		current.current.counts = counts;
		model.setComposition(model.getComposition());
	}, [counts, model]);
	useEffect(() => {
		model.setSearch(search || null);
	}, [model, search]);
	useEffect(() => {
		if (selected && !model.getSelectedPaths().includes(selected)) model.getItem(selected)?.select();
	}, [model, selected]);
	return (
		<div className="review-file-navigation">
			<div className="review-file-search">
				<div className="review-section-heading">
					<h2>Files</h2>
				</div>
				<Input
					label="Find a file"
					hideLabel
					placeholder="Find a file…"
					value={search}
					onChange={(event) => onSearch(event.target.value)}
				/>
				{search && !hasMatches && <p className="review-file-empty">No files match.</p>}
			</div>
			<div className="review-tree-mount" hidden={!hasMatches}>
				<FileTree model={model} className="review-pierre-tree" aria-label="Changed files" />
			</div>
		</div>
	);
}
