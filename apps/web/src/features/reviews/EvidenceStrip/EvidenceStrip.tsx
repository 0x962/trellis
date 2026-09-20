import type { Evidence, EvidenceFloor } from "@trellis/api";
import { EvidenceStrip as EvidenceStripView, FrontendEvidence } from "@trellis/ui/review";
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

export function EvidenceStrip({ records, floor, loading = false }: EvidenceStripProps) {
	const lines = evidenceLines(records, floor);
	return (
		<EvidenceStripView
			{...lines.strip}
			loading={loading}
			onCopy={(command) => void copyText(command, "Copied to the clipboard")}
		>
			<FrontendEvidence
				capture={lines.capture}
				before={lines.before}
				after={lines.after}
				clip={lines.clip}
				consoleLine={lines.consoleLine}
			/>
		</EvidenceStripView>
	);
}
