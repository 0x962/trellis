import type { PrKind, PrPathFacts } from "../prPaths/index.ts";
import type { EvidenceKind } from "../schemas/evidence.ts";

export type EvidenceFloorItem = "summary" | Exclude<EvidenceKind, "clip">;

export type EvidenceFloorGap = {
	item: EvidenceFloorItem;
	fillCommand: string;
};

export type EvidenceFloor = {
	kind: PrKind;
	required: EvidenceFloorItem[];
	present: EvidenceFloorItem[];
	missing: EvidenceFloorGap[];
};

type PrRisk = PrPathFacts["risk"];

const frontendFloor: EvidenceFloorItem[] = ["summary", "after", "before", "capture", "console"];
const backendFloor: EvidenceFloorItem[] = ["summary", "verify", "test", "contract"];

const fillCommands: Record<EvidenceFloorItem, string> = {
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
	contract: "trellis evidence add <pr> --kind contract --before - --after -",
	migration: "trellis evidence add <pr> --kind migration --file <path>",
	picture: "trellis evidence add <pr> --kind picture --file <path> --why <reason>",
	equivalence: 'trellis evidence add <pr> --kind equivalence --cmd "<command>" --exit <code> --sha <head> --tail -',
};

const unique = <T>(items: T[]): T[] => [...new Set(items)];

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
	const required = [
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
	] satisfies EvidenceFloorItem[];
	const recordKinds = new Set(rows.map((row) => row.kind));
	const present = required.filter((item) => (item === "summary" ? hasSummary : recordKinds.has(item)));
	const presentItems = new Set(present);
	return {
		kind,
		required,
		present,
		missing: required
			.filter((item) => !presentItems.has(item))
			.map((item) => ({ item, fillCommand: fillCommands[item] })),
	};
};
