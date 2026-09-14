import type { EvidenceCheck } from "@trellis/api";
import type { RuntimeSession } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeClient } from "../../agents/native/connection.ts";
import { rows } from "../../db/queries/support.ts";
import { revision } from "./revision.ts";
import type { EvidenceCtx } from "./types.ts";

export const finishCheck = async (
	ctx: EvidenceCtx,
	record: Omit<EvidenceCheck, "current">,
	workspace: string,
	session: RuntimeSession | null,
	error: string | null = null,
) => {
	let output = "";
	let truncated = false;
	let finishedFingerprint: string | null = null;
	let state: EvidenceCheck["state"] = "unknown";
	let exitCode: number | null = null;
	try {
		if (session?.status === "exited") {
			const client = nativeClient(ctx.home);
			const [result, stderr] = await Promise.all([client.output(record.id), client.output(record.id, 0, "stderr")]);
			const bytes = Buffer.concat([
				Buffer.from(result.data, "base64"),
				...(stderr.data ? [Buffer.from("\n[stderr]\n"), Buffer.from(stderr.data, "base64")] : []),
			]);
			output = bytes.subarray(Math.max(0, bytes.length - 262144)).toString("utf8");
			truncated = result.truncated || stderr.truncated || bytes.length > 262144;
			exitCode = session.exitCode;
			error = session.error;
			state = error?.startsWith("Process timed out after ")
				? "timed_out"
				: exitCode === 0 && error === null
					? "passed"
					: "failed";
			finishedFingerprint = (await revision(workspace)).fingerprint;
		} else error ??= session?.error ?? "The check process is unavailable. Run a new check explicitly.";
	} catch (cause) {
		state = "unknown";
		error = cause instanceof Error ? cause.message : String(cause);
	}
	const document = {
		...record,
		state,
		exitCode,
		output,
		truncated,
		error,
		finishedFingerprint,
		finishedAt: new Date().toISOString(),
	};
	return ctx.newTx(async (tx) => {
		await tx.execute(
			sql`UPDATE evidence_checks SET document = ${JSON.stringify(document)}::jsonb, finished_at = ${document.finishedAt} WHERE id = ${record.id} AND finished_at IS NULL`,
		);
		const [stored] = await rows<{ document: Omit<EvidenceCheck, "current"> }>(
			tx,
			sql`SELECT document FROM evidence_checks WHERE id = ${record.id}`,
		);
		return stored!.document;
	});
};
