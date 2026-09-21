import { type EvidenceFloor, type EvidenceFloorItem, type PrKind, proofSentence, type TicketPr } from "@trellis/api";

export type EvidenceCheckLine = {
	item: EvidenceFloorItem;
	label: string;
	status: "present" | "MISSING" | "due";
	hint: string | null;
	command: string | null;
};

export type EvidenceCheckResult = {
	pullRequest: { number: number; url: string; headSha: string };
	ticket: { identifier: string; title: string };
	kind: PrKind;
	present: number;
	required: number;
	complete: boolean;
	items: EvidenceCheckLine[];
	checks: Pick<TicketPr, "pass" | "fail" | "pending" | "skipped" | "failedChecks">;
};

export type EvidenceCheckInput = Omit<EvidenceCheckResult, "kind" | "complete" | "items"> & {
	floor: EvidenceFloor;
	verifyCommands: string[];
};

const checkNote = ({ pass, fail, pending, failedChecks }: EvidenceCheckResult["checks"]): string => {
	if (fail > 0)
		return `${fail} ${fail === 1 ? "check" : "checks"} failed: ${failedChecks.map((check) => check.name).join(", ")}`;
	if (pending > 0) return `${pending} ${pending === 1 ? "check is" : "checks are"} pending`;
	if (pass > 0) return `${pass} ${pass === 1 ? "check" : "checks"} passed`;
	return "no checks reported";
};

export const checkText = (result: EvidenceCheckResult): string => {
	const labelWidth = Math.max(...result.items.map((line) => line.label.length));
	const hintWidth = Math.max(...result.items.map((line) => line.hint?.length ?? 0));
	const lines = result.items.map((line) => {
		const prefix = `  ${line.status.padEnd(7)}  ${line.label.padEnd(labelWidth)}`;
		return line.hint === null ? prefix.trimEnd() : `${prefix}   ${line.hint.padEnd(hintWidth)}  ${line.command}`;
	});
	return `${[
		`#${result.pullRequest.number}  ${result.ticket.identifier}  ${result.ticket.title}`,
		`${`kind: ${result.kind}`.padEnd(25)}${proofSentence(
			result.items.filter((item) => item.status !== "present").map((item) => item.item),
			result.present,
			result.required,
		)}`,
		"",
		...lines,
		`  note     ${checkNote(result.checks)}`,
	].join("\n")}\n`;
};
