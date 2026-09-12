import { reviewRef } from "@trellis/api";
import { invalidInput } from "../../errors";
export type RunInput = {
	pr: string;
	action: "list" | "start" | "show" | "node" | "resume" | "retry" | "answer";
	runId?: string;
	nodeId?: string;
	cwd?: string;
	approve?: boolean;
	note?: string;
};
export function runRequest(input: RunInput) {
	const ref = reviewRef(input.pr);
	if (input.action === "list") return { path: "", method: "GET", body: undefined };
	if (input.action === "start") {
		if (!input.cwd?.startsWith("/")) throw invalidInput("cwd", "Select an absolute checkout path.");
		return { path: "", method: "POST", body: { target: ref.url, cwd: input.cwd } };
	}
	if (!input.runId || !/^[\w-]+$/.test(input.runId)) throw invalidInput("runId", "Use an executor run identifier.");
	const path = `/${input.runId}`;
	if (input.action === "show") return { path, method: "GET", body: undefined };
	if (input.action === "resume") return { path: `${path}/resume`, method: "POST", body: {} };
	if (!input.nodeId || !/^[\w-]+$/.test(input.nodeId)) throw invalidInput("nodeId", "Select a node in this run.");
	if (input.action === "node") return { path: `${path}/node/${input.nodeId}`, method: "GET", body: undefined };
	if (input.action === "retry") return { path: `${path}/retry-node`, method: "POST", body: { nodeId: input.nodeId } };
	if (input.approve === undefined) throw invalidInput("approve", "Choose approval or rejection.");
	return {
		path: `${path}/answer`,
		method: "POST",
		body: { nodeId: input.nodeId, approve: input.approve, note: input.note },
	};
}
