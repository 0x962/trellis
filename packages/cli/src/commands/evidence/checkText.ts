import { type EvidenceFloor, type EvidenceFloorItem, evidenceWords, type PrKind, type TicketPr } from "@trellis/api";

export type EvidenceCheckItem = {
	item: EvidenceFloorItem;
	label: string;
	status: "present" | "MISSING" | "due";
	note: string | null;
	command: string | null;
};

export type EvidenceCheckResult = {
	pullRequest: { number: number; url: string; headSha: string };
	ticket: { identifier: string; title: string };
	kind: PrKind;
	present: number;
	required: number;
	complete: boolean;
	items: EvidenceCheckItem[];
	checks: Pick<TicketPr, "pass" | "fail" | "pending" | "skipped" | "failedChecks">;
};

type EvidenceCheckInput = Omit<EvidenceCheckResult, "present" | "required" | "complete" | "items"> & {
	floor: EvidenceFloor;
	verifyCommands: string[];
};

const labelOf = (item: EvidenceFloorItem): string => (item === "contract" ? "contract" : evidenceWords[item]);

const noteOf = (item: EvidenceFloorItem, verifyCommands: string[]): string => {
	switch (item) {
		case "summary":
			return "write the STE summary:";
		case "after":
			return "capture the head route:";
		case "before":
			return "capture the merge base route:";
		case "capture":
			return "record the capture conditions:";
		case "console":
			return "attach the console list:";
		case "verify":
			return verifyCommands.length === 0
				? "the ticket has no parsed Verify command:"
				: `run each Verify command (${verifyCommands.join("; ")}):`;
		case "test":
			return "name each new test:";
		case "contract":
			return "write the before and after table, or:";
		case "migration":
			return "attach the migration plan:";
		case "picture":
			return "add one picture:";
		case "equivalence":
			return "prove equivalent coverage:";
	}
};

const fillCommand = (command: string, number: number, headSha: string): string =>
	command.replaceAll("<pr>", String(number)).replaceAll("<head>", headSha);

export const evidenceCheckResult = ({ floor, verifyCommands, ...input }: EvidenceCheckInput): EvidenceCheckResult => {
	const gaps = new Map(floor.missing.map((gap) => [gap.item, gap]));
	return {
		...input,
		present: floor.present.length,
		required: floor.required.length,
		complete: floor.missing.length === 0,
		items: floor.required.map((item) => {
			const gap = gaps.get(item);
			return {
				item,
				label: labelOf(item),
				status: gap === undefined ? "present" : item === "picture" ? "due" : "MISSING",
				note: gap === undefined ? null : noteOf(item, verifyCommands),
				command:
					gap === undefined ? null : fillCommand(gap.fillCommand, input.pullRequest.number, input.pullRequest.headSha),
			};
		}),
	};
};

const checkNote = ({ pass, fail, pending, failedChecks }: EvidenceCheckResult["checks"]): string => {
	if (fail > 0)
		return `${fail} ${fail === 1 ? "check" : "checks"} failed: ${failedChecks.map((check) => check.name).join(", ")}`;
	if (pending > 0) return `${pending} ${pending === 1 ? "check is" : "checks are"} pending`;
	if (pass > 0) return `${pass} ${pass === 1 ? "check" : "checks"} passed`;
	return "no checks reported";
};

export const checkText = (result: EvidenceCheckResult): string => {
	const labelWidth = Math.max(...result.items.map((item) => item.label.length));
	const lines = result.items.map((item) => {
		const prefix = `  ${item.status.padEnd(7)}  ${item.label.padEnd(labelWidth)}`;
		return item.note === null ? prefix.trimEnd() : `${prefix}   ${item.note}  ${item.command}`;
	});
	return `${[
		`#${result.pullRequest.number}  ${result.ticket.identifier}  ${result.ticket.title}`,
		`${`kind: ${result.kind}`.padEnd(25)}${result.present} of ${result.required} required present`,
		"",
		...lines,
		`  note     ${checkNote(result.checks)}`,
	].join("\n")}\n`;
};
