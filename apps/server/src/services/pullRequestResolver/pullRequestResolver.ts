import { UlidSchema } from "@trellis/api";
import { reviewRef } from "@trellis/api/client";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { notFound, type ServiceCtx } from "../support.ts";

export const resolve = async (_ctx: ServiceCtx, tx: Tx, input: { ref: string }) => {
	if (UlidSchema.safeParse(input.ref).success) {
		const [found] = await rows<{ id: string; url: string }>(
			tx,
			sql`SELECT id, url FROM pull_requests WHERE id = ${input.ref}`,
		);
		if (found === undefined) throw notFound("pull request", input.ref);
		return found;
	}
	if (/^\d+$/.test(input.ref)) {
		const found = await rows<{ id: string; url: string }>(
			tx,
			sql`SELECT id, url FROM pull_requests WHERE number = ${Number(input.ref)} ORDER BY owner, repo, id`,
		);
		if (found.length === 0) throw notFound("pull request", input.ref);
		if (found.length > 1)
			throw invalidInput(
				"ref",
				`Pull request ${input.ref} matches more than one repository. Use owner/repo#${input.ref}.`,
			);
		return found[0]!;
	}
	let ref: ReturnType<typeof reviewRef>;
	try {
		ref = reviewRef(input.ref);
	} catch {
		throw invalidInput("ref", "Use a GitHub PR URL or owner/repo#123.");
	}
	const [found] = await rows<{ id: string; url: string }>(
		tx,
		sql`SELECT id, url FROM pull_requests WHERE owner = ${ref.owner} AND repo = ${ref.repo} AND number = ${ref.number}`,
	);
	if (found === undefined) throw notFound("pull request", `${ref.owner}/${ref.repo}#${ref.number}`);
	return found;
};
