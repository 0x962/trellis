export type LineChangesValue = { additions: number; deletions: number };

export function LineChanges({ value, pending }: { value: LineChangesValue | null; pending: boolean }) {
	const label = pending
		? "Line changes not ready"
		: value === null
			? "Line changes unavailable"
			: `${value.additions} ${value.additions === 1 ? "line" : "lines"} added, ${value.deletions} ${value.deletions === 1 ? "line" : "lines"} deleted`;
	return (
		<span className="inline-flex min-w-16 shrink-0 items-center justify-end gap-1 tabular">
			<span className="sr-only">{label}</span>
			<span aria-hidden="true" className={value === null ? "text-fg-faint" : "text-success"}>
				+{value?.additions ?? (pending ? "…" : "–")}
			</span>
			<span aria-hidden="true" className={value === null ? "text-fg-faint" : "text-danger"}>
				−{value?.deletions ?? (pending ? "…" : "–")}
			</span>
		</span>
	);
}
