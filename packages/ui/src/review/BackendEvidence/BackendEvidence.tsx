import { OutputBlock } from "../../primitives/OutputBlock";
import { cx } from "../../utils/cx";
import { dotted } from "../../utils/dotted";
import { BlockRow } from "../BlockRow";
import { CopyLine } from "../CopyLine";
import { desktopRatio, EvidenceFigure } from "../EvidenceFigure";

export type VerifyRun = {
	// The identifier of the record this line draws.
	id: string;
	label: string;
	// One Verify command of the ticket, as the agent ran it.
	command: string;
	// The exit code of the command. Null says the record holds no exit code,
	// and the component then prints no exit line.
	exit: number | null;
	// The last lines the command printed. The component prints the text
	// without a change.
	tail: string;
};

export type CallProof = {
	id: string;
	method: string;
	path: string;
	request: string;
	status: number | null;
	response: string;
	server: string;
};

export type ProductRun = {
	id: string;
	command: string;
	exit: number | null;
	output: string;
	server: string;
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
	calls: readonly CallProof[];
	runs: readonly ProductRun[];
	verify: readonly VerifyRun[];
	tests: readonly TestProof[];
	contracts: readonly ContractChange[];
	migration: MigrationPlan | null;
	// A backend change owes one picture and never a second one, so the
	// component holds room for one.
	picture: EvidencePicture | null;
	onCopy: (text: string) => void;
};

export function BackendEvidence({
	calls,
	runs,
	verify,
	tests,
	contracts,
	migration,
	picture,
	onCopy,
}: BackendEvidenceProps) {
	const proofCount = calls.length + runs.length + (migration === null ? 0 : 1);
	const verificationCount = verify.length + tests.length + contracts.length;
	return (
		<div className="flex min-w-0 flex-col gap-3">
			{proofCount > 0 && (
				<dl className="flex min-w-0 flex-col">
					{calls.length > 0 && (
						<BlockRow label="call">
							{calls.map((call) => (
								<CallLine key={call.id} call={call} onCopy={onCopy} />
							))}
						</BlockRow>
					)}
					{runs.length > 0 && (
						<BlockRow label="run">
							{runs.map((run) => (
								<ProductRunLine key={run.id} run={run} onCopy={onCopy} />
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
			{verificationCount > 0 && (
				<details className="group rounded-sm border border-border px-3 py-2">
					<summary className="cursor-pointer text-sm font-medium text-fg">Verification</summary>
					<dl className="mt-2 flex min-w-0 flex-col">
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
					</dl>
				</details>
			)}
		</div>
	);
}

function CallLine({ call, onCopy }: { call: CallProof; onCopy: (text: string) => void }) {
	const status = call.status === null ? "status not recorded" : `status ${call.status}`;
	return (
		<div className="flex min-w-0 flex-col gap-1 py-1">
			<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
				<span className="font-mono text-fg">{call.method}</span>
				<CopyLine text={call.path} onCopy={onCopy} />
				<span className="text-fg-muted tabular">{status}</span>
				<span className="text-fg-faint">{call.server}</span>
			</div>
			<OutputBlock text={call.request} maxHeight="max-h-32" />
			<OutputBlock text={call.response} maxHeight="max-h-40" />
		</div>
	);
}

function ProductRunLine({ run, onCopy }: { run: ProductRun; onCopy: (text: string) => void }) {
	return (
		<div className="flex min-w-0 flex-col py-1">
			<CopyLine text={run.command} onCopy={onCopy} />
			<span className={cx("text-sm tabular", run.exit === 0 ? "text-fg-muted" : "text-danger")}>
				{run.exit === null ? "exit not recorded" : `exit ${run.exit}`} · {run.server}
			</span>
			{run.output !== "" && <OutputBlock text={run.output} maxHeight="max-h-40" className="mt-1" />}
		</div>
	);
}

// A command that ended on any code but 0 draws its code in the danger color,
// because a reviewer stops at that line.
function VerifyLine({ run, onCopy }: { run: VerifyRun; onCopy: (text: string) => void }) {
	return (
		<div className="flex min-w-0 flex-col py-0.5">
			<span className="text-xs text-fg-faint">{run.label}</span>
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
