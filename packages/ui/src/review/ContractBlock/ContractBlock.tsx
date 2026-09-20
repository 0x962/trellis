import type { ReactNode } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";

export type ContractBlockProps = {
	// One sentence that says what the ticket delivers.
	result: string;
	// The paths the ticket writes. Each path prints on its own line.
	files: readonly string[];
	// The paths the ticket must not write. A line also names the ticket that
	// owns the path, so the line wraps and never loses a word.
	leaveAlone: readonly string[];
	// The shell commands that prove the work, one per line.
	verify: readonly string[];
	// The sentences a reviewer reads first, one per line.
	reviewFocus: readonly string[];
	// One sentence that names the evidence this ticket owes. The caller
	// computes it from `files`.
	evidenceOwed: string;
	// A click on a path or on a command calls this with that text.
	onCopy: (text: string) => void;
};

// The six clauses of a ticket contract, in one order. Each clause prints
// every line the contract holds. A path or a command is a button that copies
// itself, because the agent and the person both retype these by hand.
export function ContractBlock({
	result,
	files,
	leaveAlone,
	verify,
	reviewFocus,
	evidenceOwed,
	onCopy,
}: ContractBlockProps) {
	const lineCount = files.length + leaveAlone.length + verify.length + reviewFocus.length;
	if (result === "" && lineCount === 0) {
		return (
			<section aria-label="The contract" className="flex min-w-0 flex-col">
				<SectionHeader title="THE CONTRACT" />
				<EmptyState description="The ticket names no contract." />
			</section>
		);
	}
	return (
		<section aria-label="The contract" className="flex min-w-0 flex-col">
			<SectionHeader title="THE CONTRACT" />
			<dl className="flex min-w-0 flex-col">
				<ClauseRow label="Result">
					<Sentences lines={result === "" ? [] : [result]} />
				</ClauseRow>
				<ClauseRow label="Files">
					<CopyLines lines={files} onCopy={onCopy} />
				</ClauseRow>
				<ClauseRow label="Leave alone">
					<CopyLines lines={leaveAlone} onCopy={onCopy} />
				</ClauseRow>
				<ClauseRow label="Verify">
					<CopyLines lines={verify} onCopy={onCopy} />
				</ClauseRow>
				<ClauseRow label="Review focus">
					<Sentences lines={reviewFocus} />
				</ClauseRow>
				<ClauseRow label="Evidence owed">
					<Sentences lines={evidenceOwed === "" ? [] : [evidenceOwed]} />
				</ClauseRow>
			</dl>
		</section>
	);
}

// One clause: the label, then every line of the clause. The label column is
// 112 px, because "Evidence owed" takes two lines in the 84 px column of
// `PropertyRow`.
function ClauseRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 items-start gap-2 py-1.75">
			<dt className="w-28 shrink-0 text-sm text-fg-muted">{label}</dt>
			<dd className="flex min-w-0 flex-1 flex-col">{children}</dd>
		</div>
	);
}

// Two clauses can hold the same line, so the position of a line is part of
// its key.
const numbered = (lines: readonly string[]) => lines.map((line, index) => ({ key: `${index}:${line}`, line }));

// A clause that holds no line prints one faint word, so the reader sees an
// empty clause and not a missing one.
function Sentences({ lines }: { lines: readonly string[] }) {
	if (lines.length === 0) {
		return <span className="text-sm text-fg-faint">none</span>;
	}
	return numbered(lines).map((item) => (
		<span key={item.key} className="text-sm text-fg">
			{item.line}
		</span>
	));
}

// Each line is a button, because a path and a command are text that the
// reader takes to a terminal.
function CopyLines({ lines, onCopy }: { lines: readonly string[]; onCopy: (text: string) => void }) {
	if (lines.length === 0) {
		return <span className="text-sm text-fg-faint">none</span>;
	}
	return numbered(lines).map((item) => (
		<button
			key={item.key}
			type="button"
			aria-label={`Copy ${item.line}`}
			onClick={() => onCopy(item.line)}
			className="-mx-1 max-w-full cursor-pointer self-start rounded-sm px-1 py-0.5 text-left font-mono text-xs break-words text-fg transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:py-2"
		>
			{item.line}
		</button>
	));
}
