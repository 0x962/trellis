import { Archive, DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { Button, ConfirmDialog, Dialog, IconButton, Select, Textarea, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";
import {
	acknowledgeCopy,
	exportDrafts,
	importDrafts,
	listRecoveryCopies,
	restoreDraft,
} from "../../../lib/draftTransfer/draftTransfer";
import { draftKind } from "../../../lib/draftTransfer/parseDraftBundle";
import { SettingsRow } from "../SettingsRow";

export function DraftTransfer() {
	const navigate = useNavigate();
	const input = useRef<HTMLInputElement>(null);
	const [copies, setCopies] = useState(() => listRecoveryCopies(localStorage));
	const [selected, setSelected] = useState("");
	const [open, setOpen] = useState(false);
	const [remove, setRemove] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const copy = copies.find((item) => item.id === selected);
	const flow = copy && draftKind(copy.entry) === "flow";
	const refresh = () => {
		const next = listRecoveryCopies(localStorage);
		setCopies(next);
		return next;
	};
	const exportFile = () => {
		setError("");
		try {
			const text = exportDrafts({ local: localStorage, session: sessionStorage });
			const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
			const link = document.createElement("a");
			link.href = url;
			link.download = "trellis-drafts.json";
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
			setNotice("Draft file exported.");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};
	const importFile = async (file: File) => {
		setBusy(true);
		setError("");
		try {
			if (file.size > 10 * 1024 * 1024) throw new Error("The draft file exceeds 10 MiB.");
			const imported = importDrafts({ local: localStorage, session: sessionStorage }, await file.text());
			refresh();
			setSelected(imported[0]?.id ?? "");
			setNotice(`${imported.length} draft ${imported.length === 1 ? "copy" : "copies"} imported.`);
			setOpen(imported.length > 0);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	const restore = () => {
		if (!copy) return;
		setError("");
		try {
			if (flow) {
				void navigate({ to: "/ai/flows/$slug", params: { slug: copy.entry.key.split(".").at(-1)! } });
				return;
			}
			restoreDraft({ local: localStorage, session: sessionStorage }, copy.id);
			refresh();
			setNotice(
				"Draft restored. Open its ticket composer or review page. Remove the recovery copy after you confirm it.",
			);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};
	return (
		<SettingsRow
			label="Move browser drafts"
			hint="Export flow, review, and ticket drafts from this browser. Import the file in the desktop app."
		>
			<div className="flex items-center gap-2">
				<Tooltip content="Export drafts">
					<IconButton label="Export drafts" icon={<DownloadSimple />} onClick={exportFile} />
				</Tooltip>
				<Tooltip content="Import drafts">
					<IconButton
						label="Import drafts"
						icon={<UploadSimple />}
						disabled={busy}
						onClick={() => input.current?.click()}
					/>
				</Tooltip>
				<Tooltip content="Review recovery copies">
					<IconButton
						label="Review recovery copies"
						icon={<Archive />}
						onClick={() => {
							const next = refresh();
							setSelected(next[0]?.id ?? "");
							setOpen(true);
						}}
					/>
				</Tooltip>
				<span className="text-sm text-fg-muted tabular-nums">
					{copies.length} recovery {copies.length === 1 ? "copy" : "copies"}
				</span>
			</div>
			<input
				ref={input}
				className="hidden"
				type="file"
				accept="application/json,.json"
				aria-label="Draft file"
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (file) void importFile(file);
				}}
			/>
			{!open && error && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			{!open && notice && (
				<p role="status" className="text-sm text-fg-muted">
					{notice}
				</p>
			)}
			<Dialog
				open={open}
				onOpenChange={setOpen}
				title="Draft recovery copies"
				description="Each copy stays here until you confirm its recovery or save its flow."
			>
				{copies.length === 0 ? (
					<p className="text-sm text-fg-muted">No recovery copies. Import a draft file to start.</p>
				) : (
					<>
						<Select
							label="Recovery copy"
							value={selected}
							onValueChange={(value) => {
								setSelected(value);
								setNotice("");
							}}
							items={copies.map((item, index) => ({
								value: item.id,
								label: `${index + 1}. ${draftKind(item.entry)} draft`,
							}))}
						/>
						{copy && (
							<>
								<p className="break-all text-xs text-fg-muted">{copy.entry.key}</p>
								<Textarea label="Draft contents" value={copy.entry.value} readOnly rows={6} />
								<p className="text-sm text-fg-muted">
									If the destination has different edits, Trellis keeps them as another recovery copy.
								</p>
							</>
						)}
					</>
				)}
				{error && (
					<p role="alert" className="text-sm text-danger">
						{error}
					</p>
				)}
				{notice && (
					<p role="status" className="text-sm text-fg-muted">
						{notice}
					</p>
				)}
				<div className="flex flex-wrap justify-end gap-2">
					<Button variant="quiet" onClick={() => setOpen(false)}>
						Close
					</Button>
					{copy && (
						<>
							<Button variant="quiet" onClick={() => setRemove(true)}>
								Remove copy
							</Button>
							<Button onClick={restore}>{flow ? "Open flow" : "Restore draft"}</Button>
						</>
					)}
				</div>
			</Dialog>
			<ConfirmDialog
				open={remove}
				onCancel={() => setRemove(false)}
				title="Remove this recovery copy?"
				description="Remove the copy after you confirm the draft is saved, or if you do not need it."
				confirmLabel="Remove copy"
				onConfirm={() => {
					acknowledgeCopy(localStorage, selected);
					setSelected(refresh()[0]?.id ?? "");
					setRemove(false);
				}}
			/>
		</SettingsRow>
	);
}
