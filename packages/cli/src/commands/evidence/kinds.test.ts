import { expect, test } from "bun:test";
import { evidenceFloor, type PrPathFacts } from "@trellis/api";
import { type EvidenceArgs, type EvidenceKind, evidenceInput, reviewKinds, validateKindFlags } from "./kinds.ts";

const common = {
	id: "01M305F0YWET001AED2TE7AZT2",
	evidenceId: "01M3089QDPCZA0QPNTZ2MWVX0V",
	headSha: "head-sha",
};
const file = new File(["proof"], "proof.txt");
const captureFields = {
	route: "/reviews/170",
	viewport: "1440x900",
	theme: "dark",
	seed: "bun run seed",
	browser: "Aside",
};

const cases: Array<{ args: EvidenceArgs; record: object; file?: File }> = [
	{
		args: { kind: "before", file: "proof.txt", ...captureFields, base: "base-sha" },
		record: { ...captureFields, base: "base-sha" },
		file,
	},
	{ args: { kind: "after", file: "proof.txt", ...captureFields, sha: "head-sha" }, record: captureFields, file },
	{
		args: { kind: "clip", file: "proof.txt", route: captureFields.route, caption: "Open the evidence." },
		record: { route: captureFields.route, caption: "Open the evidence." },
		file,
	},
	{ args: { kind: "console", file: "proof.txt" }, record: {}, file },
	{
		args: {
			kind: "call",
			method: "POST",
			path: "/api/tickets",
			request: '{"title":"First"}',
			status: "201",
			response: '{"id":"TST-1"}',
			server: "http://127.0.0.1:4571",
		},
		record: {
			method: "POST",
			path: "/api/tickets",
			request: '{"title":"First"}',
			status: 201,
			response: '{"id":"TST-1"}',
			server: "http://127.0.0.1:4571",
		},
	},
	{
		args: {
			kind: "run",
			cmd: "trellis tickets list",
			exit: "0",
			output: "TST-1 First",
			server: "http://127.0.0.1:4571",
		},
		record: {
			command: "trellis tickets list",
			exit: 0,
			output: "TST-1 First",
			server: "http://127.0.0.1:4571",
		},
	},
	{
		args: { kind: "verify", cmd: "bun test", exit: "0", sha: "head-sha", tail: "3 pass" },
		record: { command: "bun test", exit: 0, tail: "3 pass" },
	},
	{
		args: { kind: "test", name: "stores evidence", "fails-on": "base-sha", "passes-on": "head-sha" },
		record: { name: "stores evidence", failsOn: "base-sha", passesOn: "head-sha" },
	},
	{
		args: { kind: "test", none: true, reason: "No behavior changed." },
		record: { none: true, reason: "No behavior changed." },
	},
	{ args: { kind: "contract", before: "old", after: "new" }, record: { before: "old", after: "new" } },
	{ args: { kind: "contract", none: true }, record: { none: true } },
	{ args: { kind: "migration", table: "phase | action" }, record: { table: "phase | action" } },
	{ args: { kind: "migration", file: "proof.txt" }, record: {}, file },
	{
		args: { kind: "picture", file: "proof.txt", why: "Show the call path." },
		record: { why: "Show the call path." },
		file,
	},
	{
		args: { kind: "equivalence", cmd: "bun bench", exit: "0", sha: "head-sha", tail: "same" },
		record: { command: "bun bench", exit: 0, tail: "same" },
	},
	{
		args: { kind: "capture", base: "base-sha", ...captureFields, time: "2026-09-20T20:32:08.114Z" },
		record: {
			headSha: "head-sha",
			baseSha: "base-sha",
			...captureFields,
			capturedAt: "2026-09-20T20:32:08.114Z",
		},
	},
];

for (const item of cases) {
	test(`${item.args.kind} builds the ${Object.keys(item.record).join(",") || "empty"} record`, () => {
		expect(evidenceInput(common, item.args, item.file) as unknown).toEqual({
			...common,
			kind: item.args.kind,
			record: item.record,
			...(item.file === undefined ? {} : { file: item.file }),
		});
	});
}

const valid = Object.fromEntries(cases.map((item) => [item.args.kind, item.args])) as Record<
	EvidenceKind,
	EvidenceArgs
>;
for (const kind of reviewKinds) {
	test(`${kind} refuses a flag that it does not take`, () => {
		expect(() => validateKindFlags({ ...valid[kind], time: "2026-09-20T20:32:08.114Z" })).toThrow(
			`${kind} evidence does not take --time`,
		);
	});
}

test("an alternative refuses flags from both forms", () => {
	expect(() =>
		validateKindFlags({
			kind: "test",
			name: "stores evidence",
			"fails-on": "base-sha",
			"passes-on": "head-sha",
			none: true,
			reason: "None.",
		}),
	).toThrow("test evidence needs --name --fails-on --passes-on, or --none --reason");
});

test("an exit code must be an integer", () => {
	expect(() => evidenceInput(common, { ...valid.verify, exit: "no" })).toThrow("--exit needs an integer");
	expect(() => evidenceInput(common, { ...valid.verify, exit: "" })).toThrow("--exit needs an integer");
	expect(() => evidenceInput(common, { ...valid.verify, exit: "0x10" })).toThrow("--exit needs an integer");
});

test("only one evidence text flag can read standard input", () => {
	expect(() => validateKindFlags({ kind: "contract", before: "-", after: "-" })).toThrow(
		"only one evidence text flag can read standard input",
	);
});

const fillArgs = (command: string): EvidenceArgs =>
	Object.fromEntries(
		[...command.matchAll(/--([a-z-]+)\s+(?:"([^"]*)"|(\S+))/g)].map((match) => [match[1], match[2] ?? match[3]]),
	) as EvidenceArgs;

test("every evidence fill command uses flags that its kind accepts", () => {
	const risk: PrPathFacts["risk"] = {
		api: "yes",
		cli: "yes",
		background: "yes",
		auth: "yes",
		migration: "yes",
		dependency: "yes",
		sharedType: "yes",
		deletedTest: "yes",
	};
	const floor = evidenceFloor({ kind: "mixed", risk, hasSummary: true, rows: [] });

	expect(floor.missing.map((gap) => gap.item)).toEqual([
		"after",
		"before",
		"capture",
		"console",
		"callWorking",
		"callFailing",
		"run",
		"migration",
	]);
	for (const gap of floor.missing) expect(() => validateKindFlags(fillArgs(gap.fillCommand))).not.toThrow();
});
