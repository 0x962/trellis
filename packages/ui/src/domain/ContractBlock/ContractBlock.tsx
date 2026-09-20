import type { ReactNode } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { PropertyRow } from "../../primitives/PropertyRow";
import { SectionHeader } from "../../primitives/SectionHeader";

export type ContractBlockProps = {
	// One sentence that says what the ticket delivers.
	result: string;
	// The paths the ticket writes.
	files: readonly string[];
	// The paths the ticket must not write. A line also names the ticket that
	// owns the path, so the line wraps and never loses a word.
	leaveAlone: readonly string[];
	// The shell commands that prove the work.
	verify: readonly string[];
	// The sentences a reviewer reads first.
	reviewFocus: readonly string[];
	// One sentence that names the evidence this ticket owes. The caller
	// computes it from `files`.
	evidenceOwed: string;
	onCopy: (text: string) => void;
};

// The six clauses of a ticket contract, in one order.
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
					<PlainLines lines={result === "" ? [] : [result]} />
				</ClauseRow>
				<ClauseRow label="Files">
					<CopyableLines lines={files} onCopy={onCopy} />
				</ClauseRow>
				<ClauseRow label="Leave alone">
					<CopyableLines lines={leaveAlone} onCopy={onCopy} />
				</ClauseRow>
				<ClauseRow label="Verify">
					<CopyableLines lines={verify} onCopy={onCopy} />
				</ClauseRow>
				<ClauseRow label="Review focus">
					<PlainLines lines={reviewFocus} />
				</ClauseRow>
				<ClauseRow label="Evidence owed">
					<PlainLines lines={evidenceOwed === "" ? [] : [evidenceOwed]} />
				</ClauseRow>
			</dl>
		</section>
	);
}

// The `dd` of `PropertyRow` lays its children in a row, and a clause holds a
// column of lines.
function ClauseRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<PropertyRow label={label} align="start" labelWidth="wide">
			<div className="flex min-w-0 flex-1 flex-col">{children}</div>
		</PropertyRow>
	);
}

// Two clauses can hold the same line, so the position of a line is part of
// its key.
const keyedLines = (lines: readonly string[]) => lines.map((line, index) => ({ key: `${index}:${line}`, line }));

// A clause that holds no line prints one faint word, so the reader sees an
// empty clause and not a missing one.
function PlainLines({ lines }: { lines: readonly string[] }) {
	if (lines.length === 0) {
		return <span className="text-sm text-fg-faint">none</span>;
	}
	return keyedLines(lines).map((item) => (
		<span key={item.key} className="text-sm text-fg">
			{item.line}
		</span>
	));
}

// Each line is a button, because a path and a command are text that the
// reader takes to a terminal.
function CopyableLines({ lines, onCopy }: { lines: readonly string[]; onCopy: (text: string) => void }) {
	if (lines.length === 0) {
		return <span className="text-sm text-fg-faint">none</span>;
	}
	return keyedLines(lines).map((item) => (
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
