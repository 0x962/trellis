import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { resolveActorId } from "../../services/actorIdentity";
import { prepareUpload, upload } from "../../services/attachments.ts";
import { pageHomeFixture } from "../pageHomeFixture.ts";

export const backupFixture = async (key = "BACK") => {
	const fixture = await pageHomeFixture();
	const projectId = await fixture.project(key);
	const statusId = ulid();
	const ticketId = ulid();
	const actorId = await fixture.newTx(async (tx) => {
		const actorId = await resolveActorId(fixture.core, tx, fixture.ctx.actor);
		await tx.execute(sql`INSERT INTO statuses
			(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
			VALUES (${statusId},${projectId},'Todo','todo','todo','fg-muted',0,true,${fixture.at},${fixture.at})`);
		await tx.execute(sql`INSERT INTO tickets
			(id,project_id,number,title,status_id,position,created_at,updated_at)
			VALUES (${ticketId},${projectId},1,'Before backup',${statusId},0,${fixture.at},${fixture.at})`);
		return actorId;
	});
	await fixture.newTx(fixture.core.cache.rebuild);
	await mkdir(join(fixture.home, "attachments", "tmp"), { recursive: true });
	const attach = async (body: string) => {
		const input = await prepareUpload(fixture.ctx, {
			ticket: ticketId,
			file: new File([body], "attachment.txt", { type: "text/plain" }),
		});
		return (await fixture.newTx((tx) => upload(fixture.ctx, tx, input))).attachment;
	};
	return { ...fixture, projectId, ticketId, actorId, attach };
};
