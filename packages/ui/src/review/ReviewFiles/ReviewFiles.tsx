import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
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
type TreeNode = {
	path: string;
	name: string;
	type: "folder" | "file";
	file?: FileRow;
	children: TreeNode[];
};
type TreeRow = TreeNode & { depth: number; parent?: string };

const fileStatus = (type: string) =>
	type === "new" ? "added" : type === "deleted" ? "deleted" : type.startsWith("rename") ? "renamed" : "modified";

const folderPaths = (files: FileRow[]) =>
	files.flatMap((file) => {
		const pieces = file.path.split("/").slice(0, -1);
		return pieces.map((_, index) => pieces.slice(0, index + 1).join("/"));
	});

const tree = (files: FileRow[]): TreeNode[] => {
	const root: TreeNode = { path: "", name: "", type: "folder", children: [] };
	for (const file of files) {
		let parent = root;
		const pieces = file.path.split("/");
		for (const [index, name] of pieces.entries()) {
			const path = pieces.slice(0, index + 1).join("/");
			let node = parent.children.find((child) => child.name === name);
			if (!node) {
				node = {
					path,
					name,
					type: index === pieces.length - 1 ? "file" : "folder",
					...(index === pieces.length - 1 ? { file } : {}),
					children: [],
				};
				parent.children.push(node);
			}
			parent = node;
		}
	}
	const sort = (nodes: TreeNode[]) => {
		nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1));
		for (const node of nodes) sort(node.children);
	};
	sort(root.children);
	return root.children;
};

const visibleRows = (nodes: TreeNode[], expanded: Set<string>, search: string): TreeRow[] => {
	const query = search.toLowerCase();
	const matches = (node: TreeNode): boolean =>
		node.type === "file" ? node.path.toLowerCase().includes(query) : node.children.some(matches);
	const rows: TreeRow[] = [];
	const visit = (children: TreeNode[], depth: number, parent?: string) => {
		for (const node of children) {
			if (query && !matches(node)) continue;
			rows.push({ ...node, depth, parent });
			if (node.type === "folder" && (query || expanded.has(node.path))) visit(node.children, depth + 1, node.path);
		}
	};
	visit(nodes, 1);
	return rows;
};

export function ReviewFiles({ files, selected, counts, onSelect, search, onSearch }: Props) {
	const nodes = useMemo(() => tree(files), [files]);
	const [expanded, setExpanded] = useState(() => new Set(folderPaths(files)));
	useEffect(() => {
		setExpanded((current) => new Set([...current, ...folderPaths(files)]));
	}, [files]);
	const rows = visibleRows(nodes, expanded, search);
	const rowElements = useRef(new Map<string, HTMLElement>());
	const hasMatches = rows.some((row) => row.type === "file");
	const focusPath = rows.some((row) => row.path === selected) ? selected : rows[0]?.path;
	const toggle = (path: string) =>
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	const focus = (path: string | undefined) => path && rowElements.current.get(path)?.focus();
	const keyDown = (event: KeyboardEvent<HTMLElement>, row: TreeRow, index: number) => {
		if (event.key === "ArrowDown") focus(rows[index + 1]?.path);
		else if (event.key === "ArrowUp") focus(rows[index - 1]?.path);
		else if (event.key === "Home") focus(rows[0]?.path);
		else if (event.key === "End") focus(rows.at(-1)?.path);
		else if (event.key === "ArrowRight" && row.type === "folder") {
			if (expanded.has(row.path)) focus(rows[index + 1]?.path);
			else toggle(row.path);
		} else if (event.key === "ArrowLeft") {
			if (row.type === "folder" && expanded.has(row.path)) toggle(row.path);
			else focus(row.parent);
		} else if (event.key === "Enter" || event.key === " ") {
			if (row.type === "folder") toggle(row.path);
			else onSelect(row.path);
		} else return;
		event.preventDefault();
	};
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
				<div className="review-native-tree" role="tree" aria-label="Changed files">
					{rows.map((row, index) => {
						const count = counts[row.path];
						return (
							<div
								role="treeitem"
								aria-expanded={row.type === "folder" ? expanded.has(row.path) : undefined}
								aria-level={row.depth}
								aria-selected={row.type === "file" ? row.path === selected : undefined}
								className="review-tree-row"
								data-file-status={row.file ? fileStatus(row.file.type) : undefined}
								data-item-path={row.path}
								key={row.path}
								onClick={() => (row.type === "folder" ? toggle(row.path) : onSelect(row.path))}
								onKeyDown={(event) => keyDown(event, row, index)}
								ref={(element) => {
									if (element) rowElements.current.set(row.path, element);
									else rowElements.current.delete(row.path);
								}}
								style={{ "--review-tree-depth": row.depth } as CSSProperties}
								tabIndex={row.path === focusPath ? 0 : -1}
							>
								<span className="review-tree-caret" aria-hidden="true">
									{row.type === "folder" ? (expanded.has(row.path) ? "▾" : "▸") : ""}
								</span>
								<span className="review-tree-name">{row.name}</span>
								{count ? (
									<span className="review-tree-count" title={`${count} open comments and drafts`}>
										{count}
									</span>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
