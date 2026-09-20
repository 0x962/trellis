import { OutputBlock } from "../../primitives/OutputBlock";
import { cx } from "../../utils/cx";
import { dotted } from "../../utils/dotted";
import { BlockRow } from "../BlockRow";
import { CopyLine } from "../CopyLine";
import { desktopRatio, EvidenceFigure } from "../EvidenceFigure";

export type VerifyRun = {
	// The identifier of the record this line draws.
	id: string;
	// One Verify command of the ticket, as the agent ran it.
	command: string;
	// The exit code of the command. Null says the record holds no exit code,
	// and the component then prints no exit line.
	exit: number | null;
	// The last lines the command printed. The component prints the text
	// without a change.
	tail: string;
};

export type TestProof =
	| {
			id: string;
			state: "named";
			name: string;
			// The SHA where the test fails and the SHA where it passes. The
			// caller shortens both.
			failsOn: string | null;
			passesOn: string | null;
	  }
	| {
			id: string;
			state: "none";
			reason: string;
	  };

export type ContractChange =
	| {
			id: string;
			state: "changed";
			// One contract as it reads on the base, and as it reads on the
			// head. A contract is a request shape, a column set, an event, an
			// error code, a configuration key, or a permission check.
			before: string;
			after: string;
	  }
	| { id: string; state: "none" };

export type MigrationPlan = {
	// The plan text the agent wrote for the database change. The component
	// prints the text without a change.
	plan: string | null;
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
	onCopy: (text: string) => void;
};

export function BackendEvidence({ verify, tests, contracts, migration, picture, onCopy }: BackendEvidenceProps) {
	const rowCount = verify.length + tests.length + contracts.length + (migration === null ? 0 : 1);
	return (
		<div className="flex min-w-0 flex-col gap-3">
			{rowCount > 0 && (
				<dl className="flex min-w-0 flex-col">
					{verify.length > 0 && (
						<BlockRow label="verify record">
							{verify.map((run) => (
								<VerifyLine key={run.id} run={run} onCopy={onCopy} />
							))}
						</BlockRow>
					)}
					{tests.length > 0 && (
						<BlockRow label="test proof">
							{tests.map((proof) => (
								<TestLine key={proof.id} proof={proof} />
							))}
						</BlockRow>
					)}
					{contracts.length > 0 && (
						<BlockRow label="contract table">
							{contracts.map((change) => (
								<ContractLines key={change.id} change={change} onCopy={onCopy} />
							))}
						</BlockRow>
					)}
					{migration !== null && (
						<BlockRow label="migration plan">
							<MigrationLines migration={migration} onCopy={onCopy} />
						</BlockRow>
					)}
				</dl>
			)}
			{picture !== null && (
				<EvidenceFigure url={picture.url} alt={picture.why} caption={picture.why} ratio={desktopRatio} />
			)}
		</div>
	);
}

// A command that ended on any code but 0 draws its code in the danger color,
// because a reviewer stops at that line.
function VerifyLine({ run, onCopy }: { run: VerifyRun; onCopy: (text: string) => void }) {
	return (
		<div className="flex min-w-0 flex-col py-0.5">
			<CopyLine text={run.command} onCopy={onCopy} />
			{run.exit !== null && (
				<span className={cx("text-sm tabular", run.exit === 0 ? "text-fg-muted" : "text-danger")}>exit {run.exit}</span>
			)}
			{run.tail !== "" && <OutputBlock text={run.tail} maxHeight="max-h-40" className="mt-1" />}
		</div>
	);
}

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

function ContractLines({ change, onCopy }: { change: ContractChange; onCopy: (text: string) => void }) {
	if (change.state === "none") {
		return <span className="text-sm text-fg-muted">no contract changed</span>;
	}
	return (
		<div className="flex min-w-0 flex-col py-0.5">
			<ContractSide label="before" text={change.before} onCopy={onCopy} />
			<ContractSide label="after" text={change.after} onCopy={onCopy} />
		</div>
	);
}

function ContractSide({ label, text, onCopy }: { label: string; text: string; onCopy: (text: string) => void }) {
	return (
		<span className="flex min-w-0 gap-2">
			<span className="w-12 shrink-0 text-sm text-fg-faint">{label}</span>
			<CopyLine text={text} onCopy={onCopy} />
		</span>
	);
}

function MigrationLines({ migration, onCopy }: { migration: MigrationPlan; onCopy: (text: string) => void }) {
	return (
		<div className="flex min-w-0 flex-col py-0.5">
			{migration.filename !== null && <CopyLine text={migration.filename} onCopy={onCopy} />}
			{migration.plan !== null && <OutputBlock text={migration.plan} maxHeight="max-h-40" className="mt-1" />}
		</div>
	);
}
