import { Button, ConfirmDialog, Dialog, Select } from "@trellis/ui";
import { useState } from "react";
import type { DraftIdentity } from "../../../langflowDrafts/draftRecord";
import { DraftRecordSchema } from "../../../langflowDrafts/draftRecord";

export type DocumentDraftCopy = { identity: DraftIdentity; bytes: string };
type Props = {
	copies: DocumentDraftCopy[];
	error: string;
	busy: boolean;
	readOnly: boolean;
	onClose: () => void;
	onRecover: (copy: DocumentDraftCopy) => Promise<void>;
	onDiscard: (copy: DocumentDraftCopy) => Promise<void>;
};

export function DocumentDraftDialog({ copies, error, busy, readOnly, onClose, onRecover, onDiscard }: Props) {
	const [selected, setSelected] = useState(copies[0]?.identity.tab ?? "");
	const [confirmation, setConfirmation] = useState<DocumentDraftCopy | null>(null);
	const copy = copies.find((item) => item.identity.tab === selected);
	const record = copy === undefined ? null : readRecord(copy.bytes);
	return (
		<>
			<Dialog
				open
				onOpenChange={onClose}
				title="Browser drafts"
				description="Export a draft or open a retained copy. Recovery preserves the source copy."
			>
				{error && (
					<p role="alert" className="text-sm text-danger">
						{error}
					</p>
				)}
				{copies.length === 0 ? (
					<p className="text-sm text-fg-muted">No draft is available in this browser.</p>
				) : (
					<>
						<Select
							label="Browser draft"
							value={selected}
							onValueChange={setSelected}
							items={copies.map((item) => ({ value: item.identity.tab, label: `Tab ${item.identity.tab}` }))}
						/>
						<p className="text-sm text-fg-muted tabular-nums">
							{record === null
								? "Unknown format. Export the original bytes."
								: `Revision ${record.baseVersion}. Updated ${new Date(record.updatedAt).toLocaleString()}.`}
						</p>
					</>
				)}
				<div className="flex flex-wrap justify-end gap-2">
					<Button variant="quiet" onClick={onClose}>
						Close
					</Button>
					<Button
						disabled={copy === undefined}
						onClick={() => {
							if (copy) download(copy);
						}}
					>
						Export draft
					</Button>
					<Button disabled={copy === undefined || busy} onClick={() => setConfirmation(copy!)}>
						Discard draft
					</Button>
					<Button
						disabled={copy === undefined || record === null || busy || readOnly}
						onClick={() => {
							if (copy) void onRecover(copy);
						}}
					>
						Open copy
					</Button>
				</div>
			</Dialog>
			<ConfirmDialog
				open={confirmation !== null}
				title="Discard this browser draft?"
				description={`This removes the selected draft for tab ${confirmation?.identity.tab ?? ""}. Export it first if you need a copy.`}
				confirmLabel="Discard draft"
				onCancel={() => setConfirmation(null)}
				onConfirm={() => {
					const confirmed = confirmation!;
					setConfirmation(null);
					void onDiscard(confirmed);
				}}
			/>
		</>
	);
}

function readRecord(bytes: string) {
	try {
		const parsed = DraftRecordSchema.safeParse(JSON.parse(bytes));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

function download(copy: DocumentDraftCopy) {
	const url = URL.createObjectURL(new Blob([copy.bytes], { type: "application/json" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = `flow-draft-${encodeURIComponent(copy.identity.flow)}-${encodeURIComponent(copy.identity.tab)}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
