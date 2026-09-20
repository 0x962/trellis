import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import { BlockRow, NothingWord } from "../../review/BlockRow";

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
				<BlockRow label="Result">
					<PlainLines lines={result === "" ? [] : [result]} />
				</BlockRow>
				<BlockRow label="Files">
					<CopyableLines lines={files} onCopy={onCopy} />
				</BlockRow>
				<BlockRow label="Leave alone">
					<CopyableLines lines={leaveAlone} onCopy={onCopy} />
				</BlockRow>
				<BlockRow label="Verify">
					<CopyableLines lines={verify} onCopy={onCopy} />
				</BlockRow>
				<BlockRow label="Review focus">
					<PlainLines lines={reviewFocus} />
				</BlockRow>
				<BlockRow label="Evidence owed">
					<PlainLines lines={evidenceOwed === "" ? [] : [evidenceOwed]} />
				</BlockRow>
			</dl>
		</section>
	);
}

// Two rows can hold the same line, so the position of a line is part of its
// key.
const keyedLines = (lines: readonly string[]) => lines.map((line, index) => ({ key: `${index}:${line}`, line }));

function PlainLines({ lines }: { lines: readonly string[] }) {
	if (lines.length === 0) {
		return <NothingWord />;
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
		return <NothingWord />;
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
