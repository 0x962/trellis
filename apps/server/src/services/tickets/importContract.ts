import { EpicRefStringSchema, type TicketContract } from "@trellis/api";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveEpic } from "../epics/resolve.ts";
import { assertProjectActive } from "../refs.ts";
import { setContract } from "./contract.ts";

const InputSchema = z.strictObject({ epic: EpicRefStringSchema });

type Field = "files" | "verify" | "reviewFocus";
type EpicTicket = TicketContract & {
	identifier: string;
	description: string;
};
type UnresolvedLine = { ticket: string; line: string };
type ImportContractOutput = { filledCount: number; unresolved: UnresolvedLine[] };

const headings = new Map<string, Field>([
	["Files", "files"],
	["Review focus", "reviewFocus"],
	["Verify", "verify"],
]);

const lineValue = (line: string) => {
	const trimmed = line.trim();
	return /^`[^`]*`$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
};

const parseDescription = (ticket: EpicTicket) => {
	const parsed: Record<Field, string[]> = { files: [], verify: [], reviewFocus: [] };
	const unresolved: UnresolvedLine[] = [];
	const lines = ticket.description.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const heading = /^(Files|Verify|Review focus):(?:\s*(.*))?$/.exec(lines[index]!.trim());
		if (heading === null) continue;
		const field = headings.get(heading[1]!)!;
		if (heading[2]) {
			parsed[field].push(lineValue(heading[2]));
			continue;
		}
		let hadLines = false;
		while (lines[index + 1]?.trim()) {
			index += 1;
			hadLines = true;
			const line = lines[index]!.trim();
			const item = /^-\s+(.+)$/.exec(line)?.[1];
			if ((field === "files" && item === undefined) || line === "-")
				unresolved.push({ ticket: ticket.identifier, line });
			else parsed[field].push(lineValue(item ?? line));
		}
		if (!hadLines) unresolved.push({ ticket: ticket.identifier, line: lines[index]!.trim() });
	}
	return { parsed, unresolved };
};

export const importContract = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<ImportContractOutput> => {
	const input = InputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	assertProjectActive(ctx, epic.project_id);
	const tickets = await rows<EpicTicket>(
		tx,
		sql`SELECT root.key || '-' || t.number AS identifier, t.description, t.result, t.files,
			t.leave_alone AS "leaveAlone", t.verify, t.review_focus AS "reviewFocus"
			FROM tickets t JOIN projects root ON root.id = t.root_id
			WHERE t.epic_id = ${epic.id} ORDER BY t.number`,
	);

	let filledCount = 0;
	const unresolved: UnresolvedLine[] = [];
	for (const ticket of tickets) {
		const result = parseDescription(ticket);
		unresolved.push(...result.unresolved);
		const contract: TicketContract = {
			result: ticket.result,
			files: ticket.files,
			leaveAlone: ticket.leaveAlone,
			verify: ticket.verify,
			reviewFocus: ticket.reviewFocus,
		};
		let changed = false;
		for (const field of headings.values()) {
			if (ticket[field].length > 0 || result.parsed[field].length === 0) continue;
			contract[field] = result.parsed[field];
			filledCount += 1;
			changed = true;
		}
		if (changed) await setContract(ctx, tx, { ticket: ticket.identifier, ...contract });
	}
	return { filledCount, unresolved };
};
