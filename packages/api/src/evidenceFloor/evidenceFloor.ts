import { isTestPath, type PrKind, type PrPath, type PrPathFacts, prPaths } from "../prPaths/index.ts";
import type { EvidenceKind } from "../schemas/evidence.ts";
import type { TicketContract } from "../schemas/ticket.ts";

export type EvidenceFloorItem = "summary" | Exclude<EvidenceKind, "clip">;

export const evidenceWords: Record<EvidenceFloorItem, string> = {
	summary: "summary",
	after: "after image",
	before: "before image",
	capture: "capture record",
	console: "console list",
	verify: "verify record",
	test: "test proof",
	contract: "contract table",
	migration: "migration plan",
	picture: "picture",
	equivalence: "equivalence proof",
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
const backendFloor: EvidenceFloorItem[] = ["summary", "verify", "test", "contract"];
const softItems = new Set<EvidenceFloorItem>(["picture"]);

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
	verify: 'trellis evidence add <pr> --kind verify --cmd "<command>" --exit <code> --sha <head> --tail -',
	test: "trellis evidence add <pr> --kind test --name <test> --fails-on <base> --passes-on <head>",
	contract: 'trellis evidence add <pr> --kind contract --before "<before>" --after "<after>"',
	migration: "trellis evidence add <pr> --kind migration --file <path>",
	picture: "trellis evidence add <pr> --kind picture --file <path> --why <reason>",
	equivalence: 'trellis evidence add <pr> --kind equivalence --cmd "<command>" --exit <code> --sha <head> --tail -',
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const requiredItems = (kind: PrKind, risk: PrRisk): EvidenceFloorItem[] => [
	...(kind === "frontend"
		? frontendFloor
		: kind === "backend"
			? backendFloor
			: unique([...frontendFloor, ...backendFloor])),
	...(risk.migration === "yes" ? (["migration"] as const) : []),
	...(Object.entries(risk).some(([name, answer]) => name !== "deletedTest" && answer === "yes")
		? (["picture"] as const)
		: []),
	...(risk.deletedTest === "yes" ? (["equivalence"] as const) : []),
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
	rows: ReadonlyArray<Pick<{ kind: EvidenceKind }, "kind">>;
	hasSummary: boolean;
}): EvidenceFloor => {
	const required = requiredItems(kind, risk);
	const recordKinds = new Set(rows.map((row) => row.kind));
	const present = required.filter((item) => (item === "summary" ? hasSummary : recordKinds.has(item)));
	const presentItems = new Set(present);
	return {
		kind,
		required,
		present,
		missing: required
			.filter((item) => !presentItems.has(item))
			.map((item) => ({ item, fillCommand: evidenceFillCommands[item], soft: softItems.has(item) })),
	};
};
