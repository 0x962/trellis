import { Button, Dialog, Select } from "@trellis/ui";
import { useState } from "react";
import type { RecoveryCopy } from "../../../../../lib/draftTransfer/types";
import type { DraftGraph } from "../../flowDraft";

export function FlowDraftPicker({
	copies,
	error,
	onSelect,
	onClose,
}: {
	copies: RecoveryCopy[];
	error: string;
	onSelect: (id: string) => void;
	onClose: () => void;
}) {
	const [selected, setSelected] = useState(copies[0]?.id ?? "");
	const items = copies.map((copy, index) => {
		const draft = JSON.parse(copy.entry.value) as { version: number; graph: DraftGraph };
		return { value: copy.id, label: `Draft ${index + 1}: version ${draft.version}, ${draft.graph.nodes.length} steps` };
	});
	const copy = copies.find((entry) => entry.id === selected);
	const graph = copy ? (JSON.parse(copy.entry.value) as { graph: DraftGraph }).graph : null;
	return (
		<Dialog
			open
			onOpenChange={onClose}
			title="Recover an imported flow draft"
			description="Choose a draft to open. Trellis keeps the recovery copy until the server saves the graph."
		>
			{error && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			<Select label="Imported flow draft" value={selected} onValueChange={setSelected} items={items} />
			{copy && (
				<p className="text-sm text-fg-muted tabular-nums">Imported {new Date(copy.importedAt).toLocaleString()}</p>
			)}
			{graph && (
				<div className="rounded-md border border-border p-3 text-sm text-fg">
					{graph.nodes.length === 0 ? (
						<p>Empty graph</p>
					) : (
						<ul className="flex flex-col gap-1">
							{graph.nodes.slice(0, 5).map((node) => (
								<li key={node.id} className="truncate">
									{node.title || node.kind}
								</li>
							))}
							{graph.nodes.length > 5 && <li className="text-fg-muted">{graph.nodes.length - 5} more steps</li>}
						</ul>
					)}
				</div>
			)}
			<p className="text-sm text-fg-muted">
				If this editor has different edits, Trellis keeps them as another recovery copy.
			</p>
			<div className="flex justify-end gap-2">
				<Button variant="quiet" onClick={onClose}>
					Keep current draft
				</Button>
				<Button disabled={!copy} onClick={() => onSelect(selected)}>
					Open draft
				</Button>
			</div>
		</Dialog>
	);
}
