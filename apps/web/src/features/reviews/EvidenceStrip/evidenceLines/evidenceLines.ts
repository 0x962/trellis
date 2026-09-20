import { type Evidence, type EvidenceFloor, type EvidenceKind, evidenceWords } from "@trellis/api";
import type { CaptureRun, EvidenceClip, EvidenceScreenshot, EvidenceStripProps } from "@trellis/ui/review";
import { formatBytes } from "../../../attachments/utils/formatBytes";

export type EvidenceLines = {
	strip: Pick<EvidenceStripProps, "present" | "required" | "missing" | "hasRecords" | "note">;
	capture: CaptureRun | null;
	before: EvidenceScreenshot | null;
	after: EvidenceScreenshot | null;
	clip: EvidenceClip | null;
	consoleLine: string | null;
};

// A record holds free-form JSON, so every field of it reads as text or as
// nothing.
const stringField = (record: Evidence["record"], key: string): string | null => {
	const value = record[key];
	return typeof value === "string" ? value : null;
};

// GitHub prints 7 characters of a SHA.
const shortSha = (sha: string | null) => (sha === null ? null : sha.slice(0, 7));

// The record holds the time in UTC. The line prints UTC, and never the local
// time of the reader.
const dayAndMinute = (iso: string | null) => (iso === null ? null : iso.slice(0, 16).replace("T", " "));

const firstOf = (records: readonly Evidence[], kind: EvidenceKind) =>
	records.find((record) => record.kind === kind) ?? null;

const screenshotOf = (records: readonly Evidence[], kind: "before" | "after"): EvidenceScreenshot | null => {
	const record = firstOf(records, kind);
	if (record === null || record.blob === null) return null;
	return { url: record.blob.url, caption: stringField(record.record, "caption") };
};

const captureOf = (records: readonly Evidence[]): CaptureRun | null => {
	const record = firstOf(records, "capture");
	if (record === null) return null;
	return {
		route: stringField(record.record, "route"),
		viewport: stringField(record.record, "viewport"),
		theme: stringField(record.record, "theme"),
		seed: stringField(record.record, "seed"),
		browser: stringField(record.record, "browser"),
		headSha: shortSha(stringField(record.record, "headSha") ?? record.headSha),
		baseSha: shortSha(stringField(record.record, "baseSha")),
		capturedAt: dayAndMinute(stringField(record.record, "capturedAt")),
	};
};

const clipOf = (records: readonly Evidence[]): EvidenceClip | null => {
	const record = firstOf(records, "clip");
	if (record === null || record.blob === null) return null;
	return {
		url: record.blob.url,
		filename: record.blob.filename,
		caption: stringField(record.record, "caption") ?? "",
		mime: record.blob.mime,
	};
};

const consoleLineOf = (records: readonly Evidence[]): string | null => {
	const record = firstOf(records, "console");
	if (record === null || record.blob === null) return null;
	return `${record.blob.filename} · ${formatBytes(record.blob.size)}`;
};

// The records of one pull request, read into the props the strip draws.
export const evidenceLines = (records: readonly Evidence[], floor: EvidenceFloor): EvidenceLines => {
	const capture = captureOf(records);
	return {
		strip: {
			present: floor.present.length,
			required: floor.required.length,
			missing: floor.missing.map((gap) => ({ label: evidenceWords[gap.item], fillCommand: gap.fillCommand })),
			hasRecords: records.length > 0,
			note: capture?.headSha == null ? undefined : `captured on ${capture.headSha}`,
		},
		capture,
		before: screenshotOf(records, "before"),
		after: screenshotOf(records, "after"),
		clip: clipOf(records),
		consoleLine: consoleLineOf(records),
	};
};
