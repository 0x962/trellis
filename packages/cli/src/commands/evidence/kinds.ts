import { EvidenceWriteInputSchema } from "@trellis/api";
import { usageError } from "../../errors.ts";

export const evidenceKinds = [
	"before",
	"after",
	"clip",
	"console",
	"verify",
	"test",
	"contract",
	"migration",
	"picture",
	"equivalence",
] as const;
export const addEvidenceKinds = [...evidenceKinds, "capture"] as const;
export type AddEvidenceKind = (typeof addEvidenceKinds)[number];

export const evidenceKindFlags = {
	before: [["file", "route", "viewport", "theme", "seed", "browser", "base"]],
	after: [["file", "route", "viewport", "theme", "seed", "browser", "sha"]],
	clip: [["file", "route", "caption"]],
	console: [["file"]],
	verify: [["cmd", "exit", "sha", "tail"]],
	test: [
		["name", "fails-on", "passes-on"],
		["none", "reason"],
	],
	contract: [["before", "after"], ["none"]],
	migration: [["file"], ["table"]],
	picture: [["file", "why"]],
	equivalence: [["cmd", "exit", "sha", "tail"]],
	capture: [["base", "route", "viewport", "theme", "seed", "browser", "time"]],
} as const;

type Flag = (typeof evidenceKindFlags)[AddEvidenceKind][number][number];
export type EvidenceArgs = { kind: AddEvidenceKind } & Partial<Record<Flag, string | boolean>>;
const flags = [...new Set(Object.values(evidenceKindFlags).flat(2))] as Flag[];

export const validateKindFlags = (args: EvidenceArgs): void => {
	const variants = evidenceKindFlags[args.kind];
	const allowed = new Set(variants.flat());
	const supplied = flags.filter((flag) => args[flag] !== undefined && args[flag] !== false);
	const refused = supplied.find((flag) => !allowed.has(flag));
	if (refused !== undefined) throw usageError(`${args.kind} evidence does not take --${refused}`);
	if (
		variants.some((variant) => variant.every((flag) => supplied.includes(flag)) && supplied.length === variant.length)
	)
		return;
	const needs = variants.map((variant) => variant.map((flag) => `--${flag}`).join(" ")).join(", or ");
	throw usageError(`${args.kind} evidence needs ${needs}`);
};

type Common = { id: string; evidenceId: string; headSha: string };
type Built = { record: object; file?: File };
type Builder = (args: EvidenceArgs, common: Common, file?: File) => Built;
const text = (args: EvidenceArgs, flag: Flag): string => args[flag] as string;
const capture = (args: EvidenceArgs) => ({
	route: text(args, "route"),
	viewport: text(args, "viewport"),
	theme: text(args, "theme"),
	seed: text(args, "seed"),
	browser: text(args, "browser"),
});
const command = (args: EvidenceArgs) => {
	const exit = Number(text(args, "exit"));
	if (!Number.isInteger(exit)) throw usageError("--exit needs an integer");
	return { command: text(args, "cmd"), exit, tail: text(args, "tail") };
};
const withFile = (record: object, file?: File): Built => ({ record, file });

const builders: Record<AddEvidenceKind, Builder> = {
	before: (args, _common, file) => withFile({ ...capture(args), base: text(args, "base") }, file),
	after: (args, _common, file) => withFile(capture(args), file),
	capture: (args, common) => ({
		record: {
			headSha: common.headSha,
			baseSha: text(args, "base"),
			...capture(args),
			capturedAt: text(args, "time"),
		},
	}),
	clip: (args, _common, file) => withFile({ route: text(args, "route"), caption: text(args, "caption") }, file),
	console: (_args, _common, file) => withFile({}, file),
	verify: (args) => ({ record: command(args) }),
	equivalence: (args) => ({ record: command(args) }),
	test: (args) => ({
		record:
			args.none === true
				? { none: true, reason: text(args, "reason") }
				: { name: text(args, "name"), failsOn: text(args, "fails-on"), passesOn: text(args, "passes-on") },
	}),
	contract: (args) => ({
		record: args.none === true ? { none: true } : { before: text(args, "before"), after: text(args, "after") },
	}),
	migration: (args, _common, file) =>
		file === undefined ? { record: { table: text(args, "table") } } : withFile({}, file),
	picture: (args, _common, file) => withFile({ why: text(args, "why") }, file),
};

export const evidenceInput = (common: Common, args: EvidenceArgs, file?: File) => {
	validateKindFlags(args);
	return EvidenceWriteInputSchema.parse({ ...common, kind: args.kind, ...builders[args.kind](args, common, file) });
};
