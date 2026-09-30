import { sql } from "drizzle-orm";
import type { Tx } from "../../../tx";

export type CandidateCase = {
	id: string;
	status: string;
	steps: unknown[];
	tasks: { open: boolean; result: boolean }[];
};

export async function seed(tx: Tx, input: { history: number; cases: CandidateCase[] }) {
	await tx.execute(sql`INSERT INTO projects (id,key,slug,name,created_at,updated_at)
		VALUES ('project','FC','flow-candidates','Flow candidates',now(),now())`);
	await tx.execute(sql`INSERT INTO statuses
		(id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
		VALUES ('status','project','Todo','todo','todo','fg-muted',0,true,now(),now())`);
	await tx.execute(sql`INSERT INTO tickets
		(id,project_id,number,title,status_id,position,created_at,updated_at)
		VALUES ('ticket','project',1,'Read this ticket','status',0,now(),now())`);
	await tx.execute(sql`INSERT INTO flow_executions
		(id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,doc,state,revision,created_at,updated_at)
		SELECT 'history-'||i,'flow','ticket','project','agent','Test','history-'||i,'{}','{}',
			jsonb_build_object('status', (ARRAY['succeeded','failed','canceled'])[1+i%3],
				'steps', (SELECT jsonb_agg(jsonb_build_object('nodeId','step-'||n,'status','succeeded',
					'needsStop',false)) FROM generate_series(1,24) n)),
			1, '2026-09-01'::timestamptz + i * interval '1 second', '2026-09-01'
		FROM generate_series(1,${input.history}::integer) i`);
	await tx.execute(sql`INSERT INTO flow_executions
		(id,flow_id,ticket_id,project_id,actor_kind,actor_name,request_id,request,doc,state,revision,created_at,updated_at)
		SELECT id,'flow','ticket','project','agent','Test',id,'{}','{}',
			jsonb_build_object('status',status,'steps',steps),1,'2026-09-02','2026-09-02'
		FROM jsonb_to_recordset(${JSON.stringify(input.cases)}::jsonb) AS c(id text,status text,steps jsonb)`);
	const tasks = input.cases.flatMap((c) =>
		c.tasks.map((task, i) => ({ execution: c.id, key: String(i), run: `${c.id}-${i}`, ...task })),
	);
	await tx.execute(sql`CREATE TEMP TABLE candidate_tasks AS
		SELECT id AS execution, n::text AS key, id||'-'||n AS run, false AS open, true AS result
		FROM flow_executions CROSS JOIN generate_series(1,4) n WHERE id LIKE 'history-%'
		UNION ALL SELECT * FROM jsonb_to_recordset(${JSON.stringify(tasks)}::jsonb)
			AS t(execution text,key text,run text,open boolean,result boolean)`);
	await tx.execute(sql`INSERT INTO agent_runs
		(id,name,kind,instruction,project_key,closed_at,created_at,updated_at)
		SELECT run,run,'flow','','FC',CASE WHEN open THEN NULL ELSE '2026-09-02'::timestamptz END,
			'2026-09-01','2026-09-02' FROM candidate_tasks`);
	await tx.execute(sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at)
		SELECT run||'-attempt',run,1,run,'2026-09-01' FROM candidate_tasks`);
	await tx.execute(sql`INSERT INTO flow_execution_tasks (execution_id,key,run_id,attempt_id,result_id,created_at)
		SELECT execution,key,run,run||'-attempt',CASE WHEN result THEN run||'-result' ELSE NULL END,
			'2026-09-01' FROM candidate_tasks`);
	await tx.execute(sql`DROP TABLE candidate_tasks`);
}
