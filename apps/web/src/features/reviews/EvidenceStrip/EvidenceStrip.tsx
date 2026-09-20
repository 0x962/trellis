import type { Evidence, EvidenceFloor, EvidenceFloorItem, EvidenceKind } from "@trellis/api";
import { EvidenceStrip as EvidenceStripView, FrontendEvidence } from "@trellis/ui/review";
import { copyText } from "../../../lib/clipboard";

export type EvidenceStripProps = {
	// Every record the pull request carries, for the head SHA the page shows.
	records: readonly Evidence[];
	// What the pull request owes, and what of it is already there.
	floor: EvidenceFloor;
	// True while the request for the records is not complete.
	loading?: boolean;
};

// The words that name each record on the page. The floor names a record with
// one word, such as "verify", which reads as a command and not as a thing.
const itemWords: Record<EvidenceFloorItem, string> = {
	after: "after image",
	before: "before image",
	capture: "capture record",
	console: "console log",
	contract: "contract table",
	equivalence: "equivalence proof",
	migration: "migration plan",
	picture: "picture",
	summary: "summary",
	test: "test proof",
	verify: "verify record",
};

// A record holds free-form JSON, so every field of it reads as text or as
// nothing.
const text = (record: Evidence["record"], key: string): string | null => {
	const value = record[key];
	return typeof value === "string" ? value : null;
};

// GitHub prints 7 characters of a SHA.
const short = (sha: string | null) => (sha === null ? null : sha.slice(0, 7));

// The record holds the time in UTC. The line prints UTC, and never the local
// time of the reader.
const minute = (iso: string | null) => (iso === null ? null : iso.slice(0, 16).replace("T", " "));

const bytes = (size: number) => (size < 1024 ? `${size} B` : `${Math.round(size / 1024)} KB`);

const firstOf = (records: readonly Evidence[], kind: EvidenceKind) =>
	records.find((record) => record.kind === kind) ?? null;

const shotOf = (records: readonly Evidence[], kind: "before" | "after") => {
	const record = firstOf(records, kind);
	if (record === null || record.blob === null) return null;
	return { url: record.blob.url, caption: text(record.record, "caption") };
};

export function EvidenceStrip({ records, floor, loading = false }: EvidenceStripProps) {
	const captureRecord = firstOf(records, "capture");
	const capture =
		captureRecord === null
			? null
			: {
					route: text(captureRecord.record, "route"),
					viewport: text(captureRecord.record, "viewport"),
					theme: text(captureRecord.record, "theme"),
					seed: text(captureRecord.record, "seed"),
					browser: text(captureRecord.record, "browser"),
					headSha: short(text(captureRecord.record, "headSha") ?? captureRecord.headSha),
					baseSha: short(text(captureRecord.record, "baseSha")),
					capturedAt: minute(text(captureRecord.record, "capturedAt")),
				};

	const clipRecord = firstOf(records, "clip");
	const clip =
		clipRecord === null || clipRecord.blob === null
			? null
			: {
					url: clipRecord.blob.url,
					filename: clipRecord.blob.filename,
					caption: text(clipRecord.record, "caption") ?? "",
					mime: clipRecord.blob.mime,
				};

	const consoleRecord = firstOf(records, "console");
	const consoleLine =
		consoleRecord === null || consoleRecord.blob === null
			? null
			: `${consoleRecord.blob.filename} · ${bytes(consoleRecord.blob.size)}`;

	return (
		<EvidenceStripView
			present={floor.present.length}
			required={floor.required.length}
			missing={floor.missing.map((gap) => ({ label: itemWords[gap.item], fillCommand: gap.fillCommand }))}
			hasRecords={records.length > 0}
			note={capture?.headSha == null ? undefined : `captured on ${capture.headSha}`}
			loading={loading}
			onCopy={(command) => void copyText(command, "Copied to the clipboard")}
		>
			<FrontendEvidence
				capture={capture}
				before={shotOf(records, "before")}
				after={shotOf(records, "after")}
				clip={clip}
				consoleLine={consoleLine}
			/>
		</EvidenceStripView>
	);
}
