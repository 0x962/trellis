import { cx } from "../../utils/cx";
import { BlockRow } from "../BlockRow";

export type VerifyRun = {
	// One Verify command of the ticket, as the agent ran it.
	command: string;
	// The exit code of that command. 0 says the command passed.
	exit: number | null;
	// The last lines the command printed. The component prints the text
	// without a change.
	tail: string;
};

export type TestProof =
	| {
			state: "named";
			// The name of one test the pull request adds.
			name: string;
			// The SHA where the test fails and the SHA where it passes. The
			// caller shortens both.
			failsOn: string | null;
			passesOn: string | null;
	  }
	| {
			state: "none";
			// The sentence the agent wrote to say why the change adds no test.
			reason: string;
	  };

export type ContractChange =
	| {
			state: "changed";
			// One contract as it reads on the base, and as it reads on the
			// head. A contract is a request shape, a column set, an event, an
			// error code, a configuration key, or a permission check.
			before: string;
			after: string;
	  }
	| { state: "none" };

export type MigrationPlan = {
	// The plan the agent wrote: the phase, the two-way compatibility, the lock
	// cost, the backfill and the rollback. The component prints the text
	// without a change.
	table: string | null;
	// The name of the migration file, when the agent attached one.
	filename: string | null;
};

export type EvidencePicture = {
	url: string;
	// The sentence that says what the picture shows and why the change owes
	// one.
	why: string;
};

export type BackendEvidenceProps = {
	verify: readonly VerifyRun[];
	tests: readonly TestProof[];
	contracts: readonly ContractChange[];
	migration: MigrationPlan | null;
	// A backend change owes one picture and never a second one, so the
	// component holds room for one.
	picture: EvidencePicture | null;
};

// A record carries no name of its own here, and two records can hold the same
// words, so the place of a record in its list is its key.
const keyed = <T,>(items: readonly T[]) => items.map((item, index) => ({ key: `${index}`, item }));

// The shape of the box that holds the picture. The box keeps that shape
// before the file arrives, so the lines under it stay where they are when the
// bytes come in.
const pictureBox = "aspect-[16/10] w-full overflow-hidden rounded-md border border-border";

// The backend records of one pull request, in the order a reviewer reads
// them: what the agent ran, what it proved, what it changed for a caller,
// what it does to the database, and the one picture.
export function BackendEvidence({ verify, tests, contracts, migration, picture }: BackendEvidenceProps) {
	const rowCount = verify.length + tests.length + contracts.length + (migration === null ? 0 : 1);
	return (
		<div className="flex min-w-0 flex-col gap-3">
			{rowCount > 0 && (
				<dl className="flex min-w-0 flex-col">
					{verify.length > 0 && (
						<BlockRow label="verify record">
							{keyed(verify).map((entry) => (
								<VerifyLine key={entry.key} run={entry.item} />
							))}
						</BlockRow>
					)}
					{tests.length > 0 && (
						<BlockRow label="test proof">
							{keyed(tests).map((entry) => (
								<TestLine key={entry.key} proof={entry.item} />
							))}
						</BlockRow>
					)}
					{contracts.length > 0 && (
						<BlockRow label="contract table">
							{keyed(contracts).map((entry) => (
								<ContractLines key={entry.key} change={entry.item} />
							))}
						</BlockRow>
					)}
					{migration !== null && (
						<BlockRow label="migration plan">
							<MigrationLines plan={migration} />
						</BlockRow>
					)}
				</dl>
			)}
			{picture !== null && (
				<figure className="flex min-w-0 flex-col gap-1">
					<div className={pictureBox}>
						<img src={picture.url} alt={picture.why} className="size-full object-contain" />
					</div>
					<figcaption className="text-sm text-fg">{picture.why}</figcaption>
				</figure>
			)}
		</div>
	);
}

// The text a command printed, or the plan the agent wrote. A long text scrolls
// inside this box, so it never pushes the rest of the page down.
function Output({ text }: { text: string }) {
	return (
		<pre className="mt-1 max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-fg-muted">
			{text}
		</pre>
	);
}

// A command that ended on any code but 0 draws its code in the danger color,
// because a reviewer stops at that line.
function VerifyLine({ run }: { run: VerifyRun }) {
	return (
		<div className="flex min-w-0 flex-col py-0.5">
			<span className="min-w-0 font-mono text-xs break-words text-fg">{run.command}</span>
			{run.exit !== null && (
				<span className={cx("text-sm tabular", run.exit === 0 ? "text-fg-muted" : "text-danger")}>exit {run.exit}</span>
			)}
			{run.tail !== "" && <Output text={run.tail} />}
		</div>
	);
}

// A field the record does not hold drops out of its line, so the line never
// prints two separators with nothing between them.
const dotted = (parts: readonly (string | null)[]) => parts.filter((part) => part !== null).join(" · ");

function TestLine({ proof }: { proof: TestProof }) {
	if (proof.state === "none") {
		return <span className="text-sm text-fg-muted">no new test · {proof.reason}</span>;
	}
	const shas = dotted([proof.failsOn && `fails on ${proof.failsOn}`, proof.passesOn && `passes on ${proof.passesOn}`]);
	return (
		<span className="min-w-0 text-sm break-words text-fg">
			{proof.name}
			{shas !== "" && <span className="text-fg-muted tabular"> · {shas}</span>}
		</span>
	);
}

function ContractLines({ change }: { change: ContractChange }) {
	if (change.state === "none") {
		return <span className="text-sm text-fg-muted">no contract changed</span>;
	}
	return (
		<div className="flex min-w-0 flex-col py-0.5">
			<ContractSide word="before" text={change.before} />
			<ContractSide word="after" text={change.after} />
		</div>
	);
}

function ContractSide({ word, text }: { word: string; text: string }) {
	return (
		<span className="flex min-w-0 gap-2">
			<span className="w-12 shrink-0 text-sm text-fg-faint">{word}</span>
			<span className="min-w-0 font-mono text-xs break-words text-fg">{text}</span>
		</span>
	);
}

function MigrationLines({ plan }: { plan: MigrationPlan }) {
	return (
		<div className="flex min-w-0 flex-col py-0.5">
			{plan.filename !== null && <span className="min-w-0 font-mono text-xs break-words text-fg">{plan.filename}</span>}
			{plan.table !== null && <Output text={plan.table} />}
		</div>
	);
}
