import { EvidenceWriteInputSchema } from "@trellis/api";
import { usageError } from "../../errors.ts";

export const reviewKinds = [
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
export const evidenceKinds = [...reviewKinds, "capture"] as const;
export type EvidenceKind = (typeof evidenceKinds)[number];

// Each kind has one or more flag sets. The caller gives every flag of one set,
// and no flag from another set.
const evidenceKindFlags = {
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

type Flag = (typeof evidenceKindFlags)[EvidenceKind][number][number];
export type EvidenceArgs = { kind: EvidenceKind } & Partial<Record<Flag, string | boolean>>;
const allFlags = [...new Set(Object.values(evidenceKindFlags).flat(2))] as Flag[];
const stdinFlags = ["tail", "before", "after", "table"] as const;

export const validateKindFlags = (args: EvidenceArgs): void => {
	const variants = evidenceKindFlags[args.kind];
	const allowed = new Set(variants.flat());
	const supplied = allFlags.filter((flag) => args[flag] !== undefined && args[flag] !== false);
	const refused = supplied.find((flag) => !allowed.has(flag));
	if (refused !== undefined) throw usageError(`${args.kind} evidence does not take --${refused}`);
	if (stdinFlags.filter((flag) => args[flag] === "-").length > 1)
		throw usageError("only one evidence text flag can read standard input");
	if (
		variants.some((variant) => variant.every((flag) => supplied.includes(flag)) && supplied.length === variant.length)
	)
		return;
	const needs = variants.map((variant) => variant.map((flag) => `--${flag}`).join(" ")).join(", or ");
	throw usageError(`${args.kind} evidence needs ${needs}`);
};

type EvidenceKeys = { id: string; evidenceId: string; headSha: string };
type EvidenceBody = { record: object; file?: File };
type Builder = (args: EvidenceArgs, keys: EvidenceKeys, file?: File) => EvidenceBody;
const flagValue = (args: EvidenceArgs, flag: Flag): string => args[flag] as string;
const captureFields = (args: EvidenceArgs) => ({
	route: flagValue(args, "route"),
	viewport: flagValue(args, "viewport"),
	theme: flagValue(args, "theme"),
	seed: flagValue(args, "seed"),
	browser: flagValue(args, "browser"),
});
const commandRun = (args: EvidenceArgs) => {
	const rawExit = flagValue(args, "exit");
	if (!/^-?\d+$/.test(rawExit)) throw usageError("--exit needs an integer");
	return { command: flagValue(args, "cmd"), exit: Number(rawExit), tail: flagValue(args, "tail") };
};
const withFile = (record: object, file?: File): EvidenceBody => ({ record, file });

const builders: Record<EvidenceKind, Builder> = {
	before: (args, _keys, file) => withFile({ ...captureFields(args), base: flagValue(args, "base") }, file),
	after: (args, _keys, file) => withFile(captureFields(args), file),
	capture: (args, keys) => ({
		record: {
			headSha: keys.headSha,
			baseSha: flagValue(args, "base"),
			...captureFields(args),
			capturedAt: flagValue(args, "time"),
		},
	}),
	clip: (args, _keys, file) => withFile({ route: flagValue(args, "route"), caption: flagValue(args, "caption") }, file),
	console: (_args, _keys, file) => withFile({}, file),
	verify: (args) => ({ record: commandRun(args) }),
	equivalence: (args) => ({ record: commandRun(args) }),
	test: (args) => ({
		record:
			args.none === true
				? { none: true, reason: flagValue(args, "reason") }
				: {
						name: flagValue(args, "name"),
						failsOn: flagValue(args, "fails-on"),
						passesOn: flagValue(args, "passes-on"),
					},
	}),
	contract: (args) => ({
		record:
			args.none === true ? { none: true } : { before: flagValue(args, "before"), after: flagValue(args, "after") },
	}),
	migration: (args, _keys, file) =>
		file === undefined ? { record: { table: flagValue(args, "table") } } : withFile({}, file),
	picture: (args, _keys, file) => withFile({ why: flagValue(args, "why") }, file),
};

export const evidenceInput = (keys: EvidenceKeys, args: EvidenceArgs, file?: File) => {
	return EvidenceWriteInputSchema.parse({ ...keys, kind: args.kind, ...builders[args.kind](args, keys, file) });
};
