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
	const visible = files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()));
	const tree = (prefix: string) => {
		const children = new Set(
			visible.filter((f) => f.path.startsWith(prefix)).map((f) => f.path.slice(prefix.length).split("/")[0]!),
		);
		return [...children].sort().map((name) => {
			const path = prefix + name;
			const file = visible.find((f) => f.path === path);
			return file ? (
				<button
					type="button"
					className="review-file"
					key={path}
					title={path}
					aria-current={selected === path}
					onClick={() => onSelect(path)}
				>
					<span>{name}</span>
					<span className="review-meta">
						+{file.additions} −{file.deletions}
						{counts[path] ? ` · ${counts[path]}` : ""}
					</span>
				</button>
			) : (
				<details className="review-folder" key={path} open>
					<summary>{name}</summary>
					{tree(`${path}/`)}
				</details>
			);
		});
	};
	return (
		<>
			<Input label="Find a file" value={search} onChange={(e) => onSearch(e.target.value)} />
			{visible.length ? tree("") : <p className="review-meta">No files match.</p>}
		</>
	);
}
