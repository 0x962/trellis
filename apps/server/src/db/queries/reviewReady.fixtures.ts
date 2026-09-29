import { createHash } from "node:crypto";
import {
	executionViewV1Example,
	type FlowExecutionViewV1,
	FlowExecutionViewV1Schema,
	publicationV1Example,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../client.ts";

export const reviewFixture = async (db: Db) => {
	const project = ulid();
	const ticket = ulid();
	const flow = ulid();
	const pull = ulid();
	const publicationId = ulid();
	const statusId = ulid();
	const at = new Date("2026-09-29T10:00:00Z");
	await db.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES (${project},${project},${project},'Policy',${at},${at})`);
	await db.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES (${statusId},${project},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	await db.execute(sql`INSERT INTO tickets (id,project_id,number,title,status_id,position,created_at,updated_at)
		VALUES (${ticket},${project},1,'Policy',${statusId},0,${at},${at})`);
	await db.execute(sql`INSERT INTO flows (id,project_id,slug,name,created_at,updated_at)
		VALUES (${flow},${project},${flow},'Review',${at},${at})`);
	await db.execute(sql`INSERT INTO pull_requests
		(id,owner,repo,number,url,state,head_sha,local_state,mergeable,ci_state,created_at,updated_at)
		VALUES (${pull},${project},'app',1,${`https://github.com/${project}/app/pull/1`},'open','old-head',
		'ready','mergeable','pass',${at},${at})`);
	await db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id,pull_request_id,source,actor_name,actor_kind,created_at)
		VALUES (${ticket},${pull},'manual','Policy','human',${at})`);
	await db.execute(sql`INSERT INTO pr_summaries (pull_request_id,head_sha,headline,why,watch,created_at,updated_at)
		VALUES (${pull},'old-head','Review the change.','The change needs review.','nothing',${at},${at})`);
	await db.execute(sql`INSERT INTO pr_evidence_documents (pull_request_id,head_sha,body,actor_name,actor_kind,created_at,updated_at)
		VALUES (${pull},'old-head','The fixture supplies evidence.','Policy','human',${at},${at})`);
	const source = Buffer.from("{}");
	const documentHash = createHash("sha256").update(source).digest("hex");
	const snapshot = {
		...executionViewV1Example.snapshot,
		flow: { ...executionViewV1Example.snapshot.flow, id: flow },
		documentHash,
	};
	const publication = { ...publicationV1Example, publicationId, flowId: flow, documentHash };
	await db.execute(sql`INSERT INTO langflow_document_revisions
		(flow_id,revision,document_hash,component_manifest_hash,source_bytes,snapshot,saved_at)
		VALUES (${flow},2,${documentHash},${publication.componentManifestHash},${source},${snapshot},${at})`);
	await db.execute(sql`INSERT INTO langflow_document_publications
		(publication_id,flow_id,revision,document_hash,component_manifest_hash,publication)
		VALUES (${publicationId},${flow},2,${documentHash},${publication.componentManifestHash},${publication})`);
	let sequence = 0;
	const insertRun = async (engine: "legacy" | "langflow", status: FlowExecutionViewV1["status"]) => {
		const id = ulid();
		const createdAt = new Date(at.getTime() + ++sequence);
		const view = FlowExecutionViewV1Schema.parse({
			...executionViewV1Example,
			id,
			flowId: flow,
			projectId: project,
			ticketId: ticket,
			diffId: pull,
			reviewedHead: "old-head",
			snapshot,
			publication,
			status,
			createdAt: createdAt.toISOString(),
			updatedAt: createdAt.toISOString(),
		});
		if (engine === "legacy") {
			await db.execute(sql`INSERT INTO flow_executions
				(id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,head_sha,doc,state,revision,created_at,updated_at,diff_id)
				VALUES (${id},${flow},${ticket},${project},'human','Policy',${crypto.randomUUID()},'{}','old-head',
				${{ flow: { name: "Review" } }},${{ status }},1,${createdAt},${createdAt},${pull})`);
		} else {
			await db.execute(sql`INSERT INTO langflow_executions
				(execution_id,flow_id,ticket_id,project_id,diff_id,reviewed_head,publication_id,publication_record_id,publication,snapshot,host_id,
				actor_kind,actor_name,request_id,request_bytes,submission_bytes,submission,admission,revision,created_at)
				VALUES (${id},${flow},${ticket},${project},${pull},'old-head',${publicationId},${publicationId},${publication},${snapshot},'host',
				'human','Policy',${crypto.randomUUID()},'{}','{}','{}','{}',1,${createdAt})`);
			await db.execute(sql`INSERT INTO langflow_execution_projections
				(execution_id,view,revision,last_event_seq,first_available_seq)
				VALUES (${id},${view},1,5,1)`);
		}
		return view;
	};
	return { project, ticket, flow, pull, at, insertRun };
};
