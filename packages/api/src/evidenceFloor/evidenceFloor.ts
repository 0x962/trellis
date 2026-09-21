import { isTestPath, type PrKind, type PrPath, type PrPathFacts, prPaths } from "../prPaths/index.ts";
import type { EvidenceKind } from "../schemas/evidence.ts";
import type { TicketContract } from "../schemas/ticket.ts";

export const evidenceFloorItems = [
	"summary",
	"after",
	"before",
	"capture",
	"console",
	"callWorking",
	"callFailing",
	"run",
	"migration",
] as const;

export type EvidenceFloorItem = (typeof evidenceFloorItems)[number];

export const evidenceWords: Record<EvidenceFloorItem, string> = {
	summary: "summary",
	after: "after image",
	before: "before image",
	capture: "capture record",
	console: "console list",
	callWorking: "working call",
	callFailing: "failing call",
	run: "run record",
	migration: "migration plan",
};

export type EvidenceFloorGap = {
	item: EvidenceFloorItem;
	fillCommand: string;
	soft: boolean;
};

export type EvidenceFloor = {
	kind: PrKind;
	required: EvidenceFloorItem[];
	present: EvidenceFloorItem[];
	missing: EvidenceFloorGap[];
};

export type ContractFloor = Pick<EvidenceFloor, "kind" | "required"> & { notes: string[] };

type PrRisk = PrPathFacts["risk"];

const frontendFloor: EvidenceFloorItem[] = ["summary", "after", "before", "capture", "console"];
const serviceFloor: EvidenceFloorItem[] = ["summary", "callWorking", "callFailing"];
const cliFloor: EvidenceFloorItem[] = ["summary", "run"];
const docsFloor: EvidenceFloorItem[] = ["summary"];

// The one command that submits each floor item. The brief prints it beside
// the name of the item, and `trellis evidence check` prints it for a missing
// item, so an agent never has to guess the flags.
export const evidenceFillCommands: Record<EvidenceFloorItem, string> = {
	summary: 'trellis summary write <pr> --headline "..." --why - --watch "..."',
	after:
		'trellis evidence add <pr> --kind after --file <path> --route <route> --viewport 1440x900 --theme dark --seed "<command>" --browser <browser> --sha <head>',
	before:
		'trellis evidence add <pr> --kind before --file <path> --route <route> --viewport 1440x900 --theme dark --seed "<command>" --browser <browser> --base <base>',
	capture:
		'trellis evidence add <pr> --kind capture --base <base> --route <route> --viewport 1440x900 --theme dark --seed "<command>" --browser <browser> --time <time>',
	console: "trellis evidence add <pr> --kind console --file <path>",
	callWorking:
		"trellis evidence add <pr> --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>",
	callFailing:
		"trellis evidence add <pr> --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>",
	run: 'trellis evidence add <pr> --kind run --cmd "<command>" --exit <code> --server <url> --output -',
	migration: "trellis evidence add <pr> --kind migration --file <path>",
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const backendProof = (risk: PrRisk): EvidenceFloorItem[] =>
	unique([
		...(risk.api === "yes" || (risk.cli === "no" && risk.background === "no") ? serviceFloor : []),
		...(risk.cli === "yes" || risk.background === "yes" ? cliFloor : []),
	]);

const requiredItems = (kind: PrKind, risk: PrRisk): EvidenceFloorItem[] => [
	...(kind === "docs"
		? docsFloor
		: kind === "frontend"
			? frontendFloor
			: kind === "backend"
				? backendProof(risk)
				: unique([...frontendFloor, ...backendProof(risk)])),
	...(risk.migration === "yes" ? (["migration"] as const) : []),
];

const asPrPath = (path: string): PrPath => ({ path, change: "change", removedLinesOnly: false });
const serverDatabasePath = /^(?:\.\/)?apps\/server\/src\/db\//i;

export const contractFloor = (
	repositoryName: string | undefined,
	contract: Pick<TicketContract, "files">,
): ContractFloor | null => {
	if (repositoryName === undefined || contract.files.length === 0) return null;
	const facts = prPaths(repositoryName, contract.files.map(asPrPath));
	// A brief forecasts what the work will owe before a migration file exists, so a server database path counts as migration work.
	const risk = contract.files.some((path) => serverDatabasePath.test(path))
		? { ...facts.risk, migration: "yes" as const }
		: facts.risk;
	return {
		kind: facts.kind,
		required: requiredItems(facts.kind, risk),
		notes: contract.files.some(isTestPath) ? ["A change that removes test cases also owes an equivalence proof."] : [],
	};
};

export const evidenceFloor = ({
	kind,
	risk,
	rows,
	hasSummary,
}: {
	kind: PrKind;
	risk: PrRisk;
	rows: ReadonlyArray<
		Pick<{ kind: EvidenceKind; record: Record<string, unknown> }, "kind"> & { record?: Record<string, unknown> }
	>;
	hasSummary: boolean;
}): EvidenceFloor => {
	const required = requiredItems(kind, risk);
	const recordKinds = new Set(rows.map((row) => row.kind));
	const calls = rows.filter((row) => row.kind === "call");
	const hasWorkingCall = calls.some((row) => typeof row.record?.status === "number" && row.record.status < 400);
	const hasFailingCall = calls.some((row) => typeof row.record?.status === "number" && row.record.status >= 400);
	const present = required.filter((item) => {
		if (item === "summary") return hasSummary;
		if (item === "callWorking") return hasWorkingCall;
		if (item === "callFailing") return hasFailingCall;
		return recordKinds.has(item);
	});
	const presentItems = new Set(present);
	return {
		kind,
		required,
		present,
		missing: required
			.filter((item) => !presentItems.has(item))
			.map((item) => ({ item, fillCommand: evidenceFillCommands[item], soft: false })),
	};
};

const article = (item: EvidenceFloorItem): string => {
	const word = evidenceWords[item];
	return `the ${word}`;
};

export const proofSentence = (missing: readonly EvidenceFloorItem[], present: number, required: number): string => {
	if (required === 0 || missing.length === 0) return "proof complete";
	if (present === 0) return "no proof yet";
	const names = missing.slice(0, 2).map(article);
	if (missing.length === 1) return `needs ${names[0]}`;
	if (missing.length === 2) return `needs ${names[0]} and ${names[1]}`;
	return `needs ${names[0]}, ${names[1]} and ${missing.length - 2} more`;
};
