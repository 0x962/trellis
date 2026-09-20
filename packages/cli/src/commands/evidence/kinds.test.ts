import { expect, test } from "bun:test";
import { fileAt } from "./evidence.ts";
import { type AddEvidenceKind, type EvidenceArgs, evidenceInput, evidenceKinds, validateKindFlags } from "./kinds.ts";

const common = {
	id: "01M305F0YWET001AED2TE7AZT2",
	evidenceId: "01M3089QDPCZA0QPNTZ2MWVX0V",
	headSha: "head-sha",
};
const file = new File(["proof"], "proof.txt");
const capture = {
	route: "/reviews/170",
	viewport: "1440x900",
	theme: "dark",
	seed: "bun run seed",
	browser: "Aside",
};

const cases: Array<{ args: EvidenceArgs; record: object; file?: File }> = [
	{
		args: { kind: "before", file: "proof.txt", ...capture, base: "base-sha" },
		record: { ...capture, base: "base-sha" },
		file,
	},
	{ args: { kind: "after", file: "proof.txt", ...capture, sha: "head-sha" }, record: capture, file },
	{
		args: { kind: "clip", file: "proof.txt", route: capture.route, caption: "Open the evidence." },
		record: { route: capture.route, caption: "Open the evidence." },
		file,
	},
	{ args: { kind: "console", file: "proof.txt" }, record: {}, file },
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
		args: { kind: "capture", base: "base-sha", ...capture, time: "2026-09-20T20:32:08.114Z" },
		record: { headSha: "head-sha", baseSha: "base-sha", ...capture, capturedAt: "2026-09-20T20:32:08.114Z" },
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
	AddEvidenceKind,
	EvidenceArgs
>;
for (const kind of evidenceKinds) {
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
});

test("a missing evidence file is one NOT_FOUND failure", () => {
	expect(() => fileAt("/tmp/trellis-trl-194-no-such-file")).toThrow("No file at /tmp/trellis-trl-194-no-such-file.");
});
