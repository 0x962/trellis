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
			"attachments.delete DELETE /attachments/{id}",
			"attachments.get GET /attachments/{id}",
			"attachments.list GET /tickets/{ticket}/attachments",
			"attachments.upload POST /tickets/{ticket}/attachments",
			"brief.get GET /tickets/{ticket}/brief",
			"comments.create POST /tickets/{ticket}/comments",
			"comments.delete DELETE /comments/{id}",
			"comments.update PATCH /comments/{id}",
			"inbox.get GET /inbox",
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
			"system.gh GET /gh",
			"system.health GET /health",
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
		expect(table).toHaveLength(46);
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
