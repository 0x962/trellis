import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../../../db/tx";

const actorId = sql`(SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY['human', 'Policy'])`;

export const reviewFixture = async (tx: Tx) => {
	const project = ulid();
	const projectKey = `P${project.slice(-9)}`;
	const owner = project.toLowerCase();
	const ticket = ulid();
	const flow = ulid();
	const pull = ulid();
	const statusId = ulid();
	const at = new Date("2026-09-29T10:00:00Z");
	await tx.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES (${project},${projectKey},${projectKey.toLowerCase()},'Policy',${at},${at})`);
	await tx.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${statusId},${project},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	await tx.execute(sql`INSERT INTO tickets (id,project_id,number,title,status_id,position,created_at,updated_at)
		VALUES (${ticket},${project},1,'Policy',${statusId},0,${at},${at})`);
	await tx.execute(sql`INSERT INTO flows (id,project_id,slug,name,created_at,updated_at)
		VALUES (${flow},${project},${flow.toLowerCase()},'Review',${at},${at})`);
	await tx.execute(sql`INSERT INTO pull_requests
		(id,owner,repo,number,url,state,head_sha,local_state,mergeable,ci_state,created_at,updated_at)
		VALUES (${pull},${owner},'app',1,${`https://github.com/${owner}/app/pull/1`},'open','old-head',
		'ready','mergeable','pass',${at},${at})`);
	await tx.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id,pull_request_id,source,actor_id,actor_name,actor_kind,created_at)
		VALUES (${ticket},${pull},'manual',${actorId},'Policy','human',${at})`);
	await tx.execute(sql`INSERT INTO pr_summaries (pull_request_id,head_sha,headline,why,watch,created_at,updated_at)
		VALUES (${pull},'old-head','Review the change.','The change needs review.','nothing',${at},${at})`);
	await tx.execute(sql`INSERT INTO pr_evidence_documents (pull_request_id,head_sha,body,actor_id,actor_name,actor_kind,created_at,updated_at)
		VALUES (${pull},'old-head','The fixture supplies evidence.',${actorId},'Policy','human',${at},${at})`);
	let sequence = 0;
	const insertRun = async (tx: Tx, status: "succeeded" | "failed" | "waiting") => {
		const id = ulid();
		const createdAt = new Date(at.getTime() + ++sequence);
		await tx.execute(sql`INSERT INTO flow_executions
			(id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,head_sha,doc,state,revision,created_at,updated_at,diff_id)
			VALUES (${id},${flow},${ticket},${project},'human','Policy',${crypto.randomUUID()},'{}','old-head',
			${{ flow: { id: flow, slug: flow.toLowerCase(), name: "Review" } }},
			${{ flowId: flow, status }},1,${createdAt},${createdAt},${pull})`);
		return { id };
	};
	return { project, ticket, flow, pull, at, insertRun };
};
