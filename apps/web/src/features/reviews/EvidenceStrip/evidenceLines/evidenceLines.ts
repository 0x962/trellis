import { type Evidence, type EvidenceFloor, type EvidenceKind, evidenceWords, proofSentence } from "@trellis/api";
import type {
	CallProof,
	CaptureRun,
	ContractChange,
	EvidenceClip,
	EvidencePicture,
	EvidenceScreenshot,
	EvidenceStripProps,
	MigrationPlan,
	ProductRun,
	TestProof,
	VerifyRun,
} from "@trellis/ui/review";
import { formatBytes } from "../../../attachments/utils/formatBytes";

export type EvidenceLines = {
	strip: Pick<EvidenceStripProps, "status" | "missing" | "hasRecords" | "note">;
	capture: CaptureRun | null;
	before: EvidenceScreenshot | null;
	after: EvidenceScreenshot | null;
	clip: EvidenceClip | null;
	consoleLine: string | null;
	calls: CallProof[];
	runs: ProductRun[];
	verify: VerifyRun[];
	tests: TestProof[];
	contracts: ContractChange[];
	migration: MigrationPlan | null;
	picture: EvidencePicture | null;
};

// The JSON field holds any shape, so each key of it reads as text or as
// nothing.
const stringField = (record: Evidence["record"], key: string): string | null => {
	const value = record[key];
	return typeof value === "string" ? value : null;
};

const numberField = (record: Evidence["record"], key: string): number | null => {
	const value = record[key];
	return typeof value === "number" ? value : null;
};

// GitHub prints 7 characters of a SHA.
const shortSha = (sha: string | null) => (sha === null ? null : sha.slice(0, 7));

// The record holds the time in UTC. The line prints UTC, and never the local
// time of the reader.
const dayAndMinute = (iso: string | null) => (iso === null ? null : iso.slice(0, 16).replace("T", " "));

const firstOf = (records: readonly Evidence[], kind: EvidenceKind) =>
	records.find((record) => record.kind === kind) ?? null;

const allOf = (records: readonly Evidence[], kind: EvidenceKind) => records.filter((record) => record.kind === kind);

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

const callsOf = (records: readonly Evidence[]): CallProof[] =>
	allOf(records, "call").map((record) => ({
		id: record.id,
		method: stringField(record.record, "method") ?? "",
		path: stringField(record.record, "path") ?? "",
		request: stringField(record.record, "request") ?? "",
		status: numberField(record.record, "status"),
		response: stringField(record.record, "response") ?? "",
		server: stringField(record.record, "server") ?? "",
	}));

const runsOf = (records: readonly Evidence[]): ProductRun[] =>
	allOf(records, "run").map((record) => ({
		id: record.id,
		command: stringField(record.record, "command") ?? "",
		exit: numberField(record.record, "exit"),
		output: stringField(record.record, "output") ?? "",
		server: stringField(record.record, "server") ?? "",
	}));

const verifyOf = (records: readonly Evidence[]): VerifyRun[] =>
	[...allOf(records, "verify"), ...allOf(records, "equivalence")].map((record) => ({
		id: record.id,
		label: record.kind === "equivalence" ? "equivalence proof" : "verify record",
		command: stringField(record.record, "command") ?? "",
		exit: numberField(record.record, "exit"),
		tail: stringField(record.record, "tail") ?? "",
	}));

const testsOf = (records: readonly Evidence[]): TestProof[] =>
	allOf(records, "test").map((record) => {
		const name = stringField(record.record, "name");
		if (name === null) return { id: record.id, state: "none", reason: stringField(record.record, "reason") ?? "" };
		return {
			id: record.id,
			state: "named",
			name,
			failsOn: shortSha(stringField(record.record, "failsOn")),
			passesOn: shortSha(stringField(record.record, "passesOn")),
		};
	});

const contractsOf = (records: readonly Evidence[]): ContractChange[] =>
	allOf(records, "contract").map((record) => {
		const before = stringField(record.record, "before");
		if (before === null) return { id: record.id, state: "none" };
		return { id: record.id, state: "changed", before, after: stringField(record.record, "after") ?? "" };
	});

const migrationOf = (records: readonly Evidence[]): MigrationPlan | null => {
	const record = firstOf(records, "migration");
	if (record === null) return null;
	return { plan: stringField(record.record, "table"), filename: record.blob?.filename ?? null };
};

const pictureOf = (records: readonly Evidence[]): EvidencePicture | null => {
	const record = firstOf(records, "picture");
	if (record === null || record.blob === null) return null;
	return { url: record.blob.url, why: stringField(record.record, "why") ?? "" };
};

// The records of one pull request, read into the props the strip draws.
export const evidenceLines = (records: readonly Evidence[], floor: EvidenceFloor): EvidenceLines => {
	const capture = captureOf(records);
	return {
		strip: {
			status: proofSentence(
				floor.missing.map((gap) => gap.item),
				floor.present.length,
				floor.required.length,
			),
			missing: floor.missing.map((gap) => ({
				label: evidenceWords[gap.item],
				fillCommand: gap.fillCommand,
				soft: gap.soft,
			})),
			hasRecords: records.length > 0,
			note: capture?.headSha == null ? undefined : `captured on ${capture.headSha}`,
		},
		capture,
		before: screenshotOf(records, "before"),
		after: screenshotOf(records, "after"),
		clip: clipOf(records),
		consoleLine: consoleLineOf(records),
		calls: callsOf(records),
		runs: runsOf(records),
		verify: verifyOf(records),
		tests: testsOf(records),
		contracts: contractsOf(records),
		migration: migrationOf(records),
		picture: pictureOf(records),
	};
};
