import type { FlowDoc } from "@trellis/api";
import { useState } from "react";
import { createDraftRecovery } from "../../draftRecovery";
import { FlowDraftPicker } from "../FlowDraftPicker";
import { FlowWorkspaceContent } from "../FlowWorkspaceContent";

export function FlowWorkspace({ doc, onReload }: { doc: FlowDoc; onReload: () => void }) {
	const [recovery] = useState(() => {
		let tab = sessionStorage.getItem("trellis.flow-tab");
		if (tab === null) {
			tab = crypto.randomUUID();
			sessionStorage.setItem("trellis.flow-tab", tab);
		}
		return createDraftRecovery(localStorage, tab, doc.flow.id);
	});
	const [copies, setCopies] = useState(() => recovery.candidates());
	const [open, setOpen] = useState(copies.length > 0);
	const [generation, setGeneration] = useState(0);
	const [error, setError] = useState("");
	return (
		<>
			<FlowWorkspaceContent
				key={generation}
				doc={doc}
				onReload={onReload}
				recovery={recovery}
				paused={open}
				onRecover={() => {
					setError("");
					setCopies(recovery.candidates());
					setOpen(true);
				}}
			/>
			{open && (
				<FlowDraftPicker
					copies={copies}
					error={error}
					onClose={() => setOpen(false)}
					onSelect={(id) => {
						try {
							recovery.select(id);
							setGeneration((value) => value + 1);
							setOpen(false);
						} catch (cause) {
							setError(cause instanceof Error ? cause.message : String(cause));
							setCopies(recovery.candidates());
						}
					}}
				/>
			)}
		</>
	);
}
