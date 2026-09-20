import { type TicketContract, TicketImportContractInputSchema, type TicketImportContractOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketSummaries } from "../../db/queries/ticketSummaries.ts";
import type { Tx } from "../../db/tx.ts";
import { record } from "../activity.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { assertProjectActive } from "../refs.ts";

type ContractField = "files" | "verify" | "reviewFocus";
type EpicTicket = TicketContract & {
	id: string;
	rootId: string;
	projectId: string;
	identifier: string;
	description: string;
};
type UnresolvedLine = { ticket: string; line: string };

const fieldByHeading = new Map<string, ContractField>([
	["files", "files"],
	["review focus", "reviewFocus"],
	["verify", "verify"],
]);

const stripBackticks = (line: string) => {
	const trimmed = line.trim();
	return /^`[^`]*`$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
};

const readHeading = (line: string) => {
	const match = /^(?:#{1,6}\s+|-\s+)?(?:\*\*)?(Files|Verify|Review focus):(?:\*\*)?(?:\s*(.*))?$/i.exec(line.trim());
	if (match === null) return null;
	return { field: fieldByHeading.get(match[1]!.toLowerCase())!, inline: match[2]?.trim() ?? "" };
};

const parseDescription = (ticket: EpicTicket) => {
	const parsed: Record<ContractField, string[]> = { files: [], verify: [], reviewFocus: [] };
	const unresolved: UnresolvedLine[] = [];
	const lines = ticket.description.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const headingLine = lines[index]!.trim();
		const heading = readHeading(headingLine);
		if (heading === null) continue;

		let readLine = false;
		const addValue = (sourceLine: string, value: string) => {
			readLine = true;
			const stripped = stripBackticks(value);
			if (stripped.length === 0) unresolved.push({ ticket: ticket.identifier, line: sourceLine });
			else parsed[heading.field].push(stripped);
		};
		if (heading.inline.length > 0) addValue(headingLine, heading.inline);

		let cursor = index + 1;
		if (heading.inline.length === 0) {
			while (lines[cursor]?.trim() === "") cursor += 1;
		}
		while (cursor < lines.length) {
			const line = lines[cursor]!.trim();
			if (line.length === 0 || readHeading(line) !== null) break;
			readLine = true;
			const item = /^-\s+(.+)$/.exec(line)?.[1];
			// Files holds Markdown list items. Verify and Review focus also accept plain lines as values.
			if ((heading.field === "files" && item === undefined) || line === "-") {
				unresolved.push({ ticket: ticket.identifier, line });
			} else {
				addValue(line, item ?? line);
			}
			cursor += 1;
		}
		if (!readLine) unresolved.push({ ticket: ticket.identifier, line: headingLine });
		index = cursor - 1;
	}
	return { parsed, unresolved };
};

export const importContract = async (
	ctx: ServiceCtx,
	tx: Tx,
	rawInput: unknown,
): Promise<TicketImportContractOutput> => {
	const input = TicketImportContractInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	const tickets = await rows<EpicTicket>(
		tx,
		sql`SELECT t.id, t.root_id AS "rootId", t.project_id AS "projectId",
			root.key || '-' || t.number AS identifier, t.description, t.result, t.files,
			t.leave_alone AS "leaveAlone", t.verify, t.review_focus AS "reviewFocus"
			FROM tickets t JOIN projects root ON root.id = t.root_id
			WHERE t.epic_id = ${epic.id} ORDER BY t.number`,
	);

	const batchId = ulid();
	let filledCount = 0;
	const unresolved: UnresolvedLine[] = [];
	const imported: { id: string; fields: ContractField[] }[] = [];
	for (const ticket of tickets) {
		const fromDescription = parseDescription(ticket);
		unresolved.push(...fromDescription.unresolved);
		const contract: TicketContract = {
			result: ticket.result,
			files: ticket.files,
			leaveAlone: ticket.leaveAlone,
			verify: ticket.verify,
			reviewFocus: ticket.reviewFocus,
		};
		const fields: ContractField[] = [];
		for (const field of fieldByHeading.values()) {
			if (ticket[field].length > 0 || fromDescription.parsed[field].length === 0) continue;
			contract[field] = fromDescription.parsed[field];
			filledCount += 1;
			fields.push(field);
		}
		if (fields.length === 0) continue;

		await tx.execute(sql`UPDATE tickets SET result = ${contract.result},
			files = ${JSON.stringify(contract.files)}::jsonb,
			leave_alone = ${JSON.stringify(contract.leaveAlone)}::jsonb,
			verify = ${JSON.stringify(contract.verify)}::jsonb,
			review_focus = ${JSON.stringify(contract.reviewFocus)}::jsonb,
			version = version + 1, updated_at = ${ctx.now}
			WHERE id = ${ticket.id}`);
		await record(ctx, tx, {
			rootId: ticket.rootId,
			projectId: ticket.projectId,
			ticketId: ticket.id,
			action: "ticket.updated",
			batchId,
			changes: [{ field: "contract", from: null, to: null }],
		});
		imported.push({ id: ticket.id, fields });
	}

	const summaries = await ticketSummaries(
		tx,
		imported.map(({ id }) => id),
	);
	const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
	for (const ticket of imported) {
		ctx.emit({
			type: "ticket.updated",
			summary: summaryById.get(ticket.id)!,
			fields: ticket.fields,
			batchId,
		});
	}
	return { filledCount, unresolved };
};
