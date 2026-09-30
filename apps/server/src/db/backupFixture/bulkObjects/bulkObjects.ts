import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { blobPath } from "../../../storage/blobs.ts";
import { pageObjectPath } from "../../../storage/pageObjects.ts";
import type { backupFixture } from "../backupFixture.ts";

export const bulkObjects = async (fixture: Awaited<ReturnType<typeof backupFixture>>, count: number) => {
	const blobs: Array<{ id: string; sha256: string; size: number }> = [];
	const pages: typeof blobs = [];
	for (const [objects, pathOf, kind] of [
		[blobs, blobPath, 0],
		[pages, pageObjectPath, 1],
	] as const) {
		for (let index = 0; index < count; index++) {
			const bytes = Buffer.alloc(16 * 1024, index % 256);
			bytes.writeUInt32LE(index, 0);
			bytes.writeUInt32LE(kind, 4);
			const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
			const path = pathOf(fixture.home, sha256);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, bytes, { mode: 0o600 });
			objects.push({ id: ulid(), sha256, size: bytes.length });
		}
	}
	await fixture.newTx(async (tx) => {
		await tx.execute(sql`INSERT INTO attachments
			(id,ticket_id,filename,mime,size,sha256,actor_id,actor_name,actor_kind,created_at)
			SELECT id,${fixture.ticketId},'audit.bin','application/octet-stream',size,sha256,
			${fixture.actorId},${fixture.ctx.actor.name},${fixture.ctx.actor.kind},${fixture.at}
			FROM jsonb_to_recordset(${JSON.stringify(blobs)}::jsonb) AS object(id text,sha256 text,size bigint)`);
		await tx.execute(sql`INSERT INTO page_uploads
			(id,project_id,sha256,size,mime,original_name,actor_id,actor_name,actor_kind,created_at,expires_at)
			SELECT id,${fixture.projectId},sha256,size,'application/octet-stream','audit.bin',
			${fixture.actorId},${fixture.ctx.actor.name},${fixture.ctx.actor.kind},${fixture.at},${new Date(fixture.at.getTime() + 86400000)}
			FROM jsonb_to_recordset(${JSON.stringify(pages)}::jsonb) AS object(id text,sha256 text,size bigint)`);
	});
	return { blobs, pages };
};
