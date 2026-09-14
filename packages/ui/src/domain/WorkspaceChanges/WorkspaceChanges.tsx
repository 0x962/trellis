import { Select } from "../../primitives/Select";

type File = { path: string; status: string };
type Content = { path: string; text: string | null; bytes: number; binary: boolean; truncated: boolean };

export function WorkspaceChanges({
	files,
	diff,
	truncated,
	selected,
	onSelect,
	content,
	pending,
	error,
}: {
	files: File[];
	diff: string;
	truncated: boolean;
	selected: string;
	onSelect: (path: string) => void;
	content?: Content;
	pending: boolean;
	error?: string;
}) {
	return (
		<section aria-label="Local changes" className="flex min-w-0 flex-col gap-4">
			<h3 className="text-sm font-medium">Local changes</h3>
			<Select
				label="Workspace file"
				value={selected}
				onValueChange={onSelect}
				placeholder="Workspace diff"
				items={[
					{ value: "", label: "Workspace diff" },
					...files.map((file) => ({ value: file.path, label: `${file.status ? `${file.status} ` : ""}${file.path}` })),
				]}
			/>
			{error ? (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			) : pending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load file…
				</p>
			) : content ? (
				<>
					<p className="text-xs text-fg-muted tabular-nums">
						{content.bytes.toLocaleString()} bytes{content.truncated ? " · Partial file" : ""}
					</p>
					<pre className="overflow-auto border border-border bg-surface p-3 font-mono text-xs tabular-nums">
						{content.binary ? "This is a binary file." : content.text}
					</pre>
				</>
			) : (
				<>
					{truncated && (
						<p className="text-sm text-fg-muted">The diff exceeds the display limit. Inspect the files separately.</p>
					)}
					<pre className="overflow-auto border border-border bg-surface p-3 font-mono text-xs tabular-nums">
						{diff || "No tracked changes. Select a file to inspect its contents."}
					</pre>
				</>
			)}
		</section>
	);
}
