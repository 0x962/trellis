import { describe, expect, test } from "bun:test";
import { type AnyContractRouter, isContractProcedure } from "@orpc/contract";
import { errors } from "../errors.ts";
import { contract } from "./index.ts";

type Procedure = {
	name: string;
	route: { method?: string; path?: string };
	errorMap: Record<string, { status?: number }>;
};

// Walks the router tree. Every leaf is a contract procedure; every branch is a
// plain object of procedures, so the dotted name is the object path.
const procedures = (router: AnyContractRouter, prefix: string[] = []): Procedure[] => {
	if (isContractProcedure(router)) {
		const { route, errorMap } = router["~orpc"];
		return [{ name: prefix.join("."), route, errorMap: errorMap as Procedure["errorMap"] }];
	}
	return Object.entries(router).flatMap(([key, child]) => procedures(child as AnyContractRouter, [...prefix, key]));
};

const byName = (a: Procedure, b: Procedure) => a.name.localeCompare(b.name);

describe("contract", () => {
	// Paths are relative to the `/api` mount of the OpenAPI handler.
	test("every procedure has a method and a path and the sorted route table matches the plan", () => {
		const table = procedures(contract)
			.sort(byName)
			.map(({ name, route }) => `${name} ${route.method} ${route.path}`);
		expect(table).toEqual([
			"actors.default GET /actors/default",
			"actors.list GET /actors",
			"agentRuns.harness GET /agent-runs/{id}/harness",
			"agentRuns.list GET /agent-runs",
			"agentRuns.output GET /agent-runs/{id}/output",
			"agentRuns.permission POST /agent-runs/{id}/permission",
			"agentRuns.refresh POST /agent-runs/{id}/refresh",
			"agentRuns.resize POST /agent-runs/{id}/terminal/resize",
			"agentRuns.send POST /agent-runs/{id}/send",
			"agentRuns.session GET /agent-runs/{id}/session",
			"agentRuns.start POST /agent-runs",
			"agentRuns.stop POST /agent-runs/{id}/stop",
			"agentRuns.terminalInput POST /agent-runs/{id}/terminal/input",
			"agentRuns.terminalOutput GET /agent-runs/{id}/terminal/output",
			"attachments.delete DELETE /attachments/{id}",
			"attachments.get GET /attachments/{id}",
			"attachments.list GET /tickets/{ticket}/attachments",
			"attachments.upload POST /tickets/{ticket}/attachments",
			"brief.get GET /tickets/{ticket}/brief",
			"comments.create POST /tickets/{ticket}/comments",
			"comments.delete DELETE /comments/{id}",
			"comments.resolve POST /comments/{id}/resolve",
			"comments.thread GET /comments/{id}/thread",
			"comments.update PATCH /comments/{id}",
			"controller.list GET /manager-dispatches",
			"controller.resolveUnknown POST /manager-dispatches/{id}/received",
			"controller.retry POST /manager-dispatches/{id}/retry",
			"evidence.check POST /agent-runs/{runId}/checks",
			"evidence.file GET /agent-runs/{runId}/workspace/file",
			"evidence.list GET /agent-runs/{runId}/evidence",
			"evidence.register POST /agent-runs/{runId}/artifacts",
			"evidence.workspace GET /agent-runs/{runId}/workspace",
			"flowExecutions.cancel POST /flow-executions/{id}/cancel",
			"flowExecutions.decide POST /flow-executions/{id}/decision",
			"flowExecutions.get GET /flow-executions/{id}",
			"flowExecutions.list GET /flow-executions",
			"flowExecutions.start POST /flow-executions",
			"flows.create POST /flows",
			"flows.delete DELETE /flows/{flow}",
			"flows.get GET /flows/{flow}",
			"flows.list GET /flows",
			"flows.save PUT /flows/{flow}/graph",
			"flows.update PATCH /flows/{flow}",
			"inbox.get GET /inbox",
			"personas.create POST /personas",
			"personas.delete DELETE /personas/{id}",
			"personas.list GET /personas",
			"personas.update PATCH /personas/{id}",
			"projects.create POST /projects",
			"projects.delete DELETE /projects/{project}",
			"projects.get GET /projects/{project}",
			"projects.list GET /projects",
			"projects.move POST /projects/{project}/move",
			"projects.setRepos PUT /projects/{project}/repos",
			"projects.update PATCH /projects/{project}",
			"pullRequests.diff GET /prs/{id}/diff",
			"pullRequests.link POST /tickets/{ticket}/prs",
			"pullRequests.list GET /tickets/{ticket}/prs",
			"pullRequests.refresh POST /prs/{id}/refresh",
			"pullRequests.unlink DELETE /tickets/{ticket}/prs/{id}",
			"reviews.action POST /reviews/action",
			"reviews.add POST /reviews/threads",
			"reviews.edit PATCH /reviews/messages/{id}",
			"reviews.export GET /reviews/export",
			"reviews.file POST /reviews/file",
			"reviews.history GET /reviews/submissions",
			"reviews.importMargin POST /reviews/import-margin",
			"reviews.inbox POST /reviews/inbox",
			"reviews.list GET /reviews/threads",
			"reviews.metadata POST /reviews/metadata",
			"reviews.mine POST /reviews/mine",
			"reviews.open POST /reviews/open",
			"reviews.prs GET /reviews/prs",
			"reviews.reaction POST /reviews/messages/{id}/reaction",
			"reviews.read POST /reviews/submissions/{id}/read",
			"reviews.refresh POST /reviews/refresh",
			"reviews.reply POST /reviews/threads/{id}/reply",
			"reviews.resend POST /reviews/deliveries/{id}/resend",
			"reviews.resolve POST /reviews/threads/{id}/resolve",
			"reviews.revision GET /reviews/revision",
			"reviews.runs POST /reviews/runs",
			"reviews.show GET /reviews/submissions/{id}",
			"reviews.status POST /reviews/status",
			"reviews.submit POST /reviews/submit",
			"reviews.thread GET /reviews/threads/{id}",
			"search.query GET /search",
			"settings.get GET /settings",
			"settings.set PUT /settings",
			"statuses.clear DELETE /projects/{project}/statuses",
			"statuses.create POST /projects/{project}/statuses",
			"statuses.delete DELETE /projects/{project}/statuses/{status}",
			"statuses.list GET /projects/{project}/statuses",
			"statuses.reorder PUT /projects/{project}/statuses/order",
			"statuses.update PATCH /projects/{project}/statuses/{status}",
			"system.backup POST /backup",
			"system.chooseDirectory POST /choose-directory",
			"system.doctor GET /doctor",
			"system.gh GET /gh",
			"system.health GET /health",
			"system.nativeWork GET /native-work",
			"system.resumeNativeWork POST /native-work/resume",
			"system.stopNativeWork POST /native-work/stop",
			"tickets.board GET /tickets/board",
			"tickets.counts GET /tickets/counts",
			"tickets.create POST /tickets",
			"tickets.delete DELETE /tickets/{ticket}",
			"tickets.deleteMany POST /tickets/delete-many",
			"tickets.get GET /tickets/{ticket}",
			"tickets.list GET /tickets",
			"tickets.move POST /tickets/{ticket}/move",
			"tickets.update PATCH /tickets/{ticket}",
			"tickets.updateMany POST /tickets/update-many",
			"timeline.list GET /tickets/{ticket}/timeline",
		]);
		expect(table).toHaveLength(113);
	});

	// A client narrows on `error.code`, so a code that is not in `errors` has
	// no type and no status the client can trust.
	test("declared errors per procedure come from the shared error map and cover the plan's cases", () => {
		const all = procedures(contract);
		const declared = new Map(all.map((procedure) => [procedure.name, procedure.errorMap]));
		for (const { name, errorMap } of all) {
			for (const code of ["ACTOR_REQUIRED", "ACTOR_INVALID", "INPUT_VALIDATION_FAILED", "NOT_FOUND"]) {
				expect(errorMap, `${name} declares ${code}`).toHaveProperty(code);
			}
			for (const [code, definition] of Object.entries(errorMap)) {
				expect(errors, `${name} declares unknown code ${code}`).toHaveProperty(code);
				expect(definition.status, `${name} ${code} status`).toBe(errors[code as keyof typeof errors].status);
			}
		}
		const expects = (name: string, codes: string[]) => {
			for (const code of codes) {
				expect(declared.get(name), `${name} declares ${code}`).toHaveProperty(code);
			}
		};
		expects("tickets.move", ["AGENT_CANNOT_COMPLETE", "INVALID_ANCHOR", "VERSION_CONFLICT", "PROJECT_ARCHIVED"]);
		expects("tickets.delete", ["AGENT_CANNOT_DELETE"]);
		expects("projects.delete", ["AGENT_CANNOT_DELETE"]);
		expects("tickets.list", ["INVALID_CURSOR"]);
		expects("pullRequests.link", ["INVALID_PR_URL", "GH_UNAVAILABLE"]);
		expects("attachments.upload", ["PAYLOAD_TOO_LARGE"]);
	});
});
