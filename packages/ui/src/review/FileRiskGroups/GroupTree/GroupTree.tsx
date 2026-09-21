import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import type { FileRiskRow } from "../FileRiskGroups";
import "./GroupTree.css";

export type GroupTreeProps = {
	// The name of the risk group this tree holds, such as Risk. It names the
	// tree for a screen reader.
	label: string;
	files: FileRiskRow[];
	// The path whose diff the pane shows. An empty string selects no row.
	selected: string;
	onSelect: (path: string) => void;
};

// The colour of a row comes from its git status. A file the person marked
// read takes the `ignored` status, and `GroupTree.css` paints that status
// with the faint foreground. A read file therefore sits back from the files
// that the person still must read.
const statusOf = (file: FileRiskRow): GitStatusEntry["status"] => {
	if (file.read) return "ignored";
	if (file.change === "new") return "added";
	if (file.change === "deleted") return "deleted";
	if (file.change === "change") return "modified";
	return "renamed";
};

const digits = new Intl.NumberFormat();
const lineWords = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

// The added and deleted line counts at the right edge of a row. The tree
// draws plain text, so this repeats the shape of `LineChanges` instead of
// rendering it. A count of zero is faint, so the colour marks a real change.
const lineCounts = (file: FileRiskRow) => {
	const tone = (count: number, token: string) => (file.read || count === 0 ? "var(--fg-faint)" : `var(--${token})`);
	return {
		text: `+${digits.format(file.additions)} −${digits.format(file.deletions)}`,
		title: `${lineWords(file.additions, "line")} added, ${lineWords(file.deletions, "line")} deleted`,
		parts: [
			{ text: `+${digits.format(file.additions)}`, color: tone(file.additions, "success") },
			{ text: ` −${digits.format(file.deletions)}`, color: tone(file.deletions, "danger") },
		],
	};
};

// The files of one risk group, drawn as the directory tree that holds them.
// A folder opens and closes, and a file is a leaf that picks the diff of that
// file.
//
// The pane that stacks the groups owns the scroll bar, so this tree must draw
// every row it has. The tree fills the height of the box around it, and the
// effect below sets that height to the height of the rows the tree shows.
export function GroupTree({ label, files, selected, onSelect }: GroupTreeProps) {
	const coarse = useMediaQuery("(pointer: coarse)");
	// The tree builds its model once. This box holds the newest files and the
	// newest callback, so a model callback never reads a past render.
	const current = useRef({ files, onSelect });
	current.current = { files, onSelect };
	const [height, setHeight] = useState(0);
	const { model } = useFileTree({
		paths: files.map((file) => file.path),
		initialExpansion: "open",
		flattenEmptyDirectories: true,
		itemHeight: coarse ? 44 : 28,
		onSelectionChange: (paths) => {
			const path = paths.at(-1);
			if (path !== undefined && current.current.files.some((file) => file.path === path))
				current.current.onSelect(path);
		},
		renderRowDecoration: ({ item }) => {
			const file = current.current.files.find((entry) => entry.path === item.path);
			return file === undefined ? null : lineCounts(file);
		},
	});
	// A path holds no newline, so this one string changes only when the set of
	// paths changes. A read mark builds new file objects and must not reset the
	// tree, because a reset reopens every folder the person closed.
	const paths = files.map((file) => file.path).join("\n");
	useEffect(() => {
		model.resetPaths(paths === "" ? [] : paths.split("\n"));
	}, [paths, model]);
	useEffect(() => {
		model.setGitStatus(files.map((file) => ({ path: file.path, status: statusOf(file) })));
	}, [files, model]);
	useEffect(() => {
		const measure = () => setHeight(model.getVisibleCount() * model.getItemHeight());
		measure();
		return model.subscribe(measure);
	}, [model]);
	useEffect(() => {
		const item = model.getItem(selected);
		if (item === null) for (const path of model.getSelectedPaths()) model.getItem(path)?.deselect();
		else if (!item.isSelected()) item.select();
	}, [model, selected]);
	return (
		<div className="review-group-tree" style={{ height }}>
			<FileTree model={model} aria-label={`${label} files`} />
		</div>
	);
}
