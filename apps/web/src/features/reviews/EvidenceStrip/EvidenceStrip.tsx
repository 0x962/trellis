import type { Evidence, EvidenceFloor } from "@trellis/api";
import { BackendEvidence, EvidenceStrip as EvidenceStripView, FrontendEvidence } from "@trellis/ui/review";
import { copyText } from "../../../lib/clipboard";
import { evidenceLines } from "./evidenceLines";

export type EvidenceStripProps = {
	// Every record the pull request carries, for the head SHA the page shows.
	records: readonly Evidence[];
	// What the pull request owes, and what of it is already there.
	floor: EvidenceFloor;
	// True while the request for the records is not complete.
	loading?: boolean;
};

// The kind of the pull request chooses the records the strip draws. A pull
// request of the kind "mixed" changes a screen and a service, so it draws
// both sets.
export function EvidenceStrip({ records, floor, loading = false }: EvidenceStripProps) {
	const lines = evidenceLines(records, floor);
	const copy = (text: string) => void copyText(text, "Copied to the clipboard");
	return (
		<EvidenceStripView {...lines.strip} loading={loading} onCopy={copy}>
			{floor.kind !== "backend" && (
				<FrontendEvidence
					capture={lines.capture}
					before={lines.before}
					after={lines.after}
					clip={lines.clip}
					consoleLine={lines.consoleLine}
				/>
			)}
			{floor.kind !== "frontend" && (
				<BackendEvidence
					verify={lines.verify}
					tests={lines.tests}
					contracts={lines.contracts}
					migration={lines.migration}
					picture={lines.picture}
					onCopy={copy}
				/>
			)}
		</EvidenceStripView>
	);
}
