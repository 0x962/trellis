export const editorOperations = [
	"document:read",
	"document:save",
	"component-manifest:read",
	"draft:execute",
	"playground:open",
	"share:write",
	"python:execute",
	"flow:import",
	"provider-key:write",
	"component:replace",
	"decision:submit",
] as const;

export type EditorOperation = (typeof editorOperations)[number];
export type AllowedEditorOperation = Extract<
	EditorOperation,
	"document:read" | "document:save" | "component-manifest:read"
>;

export type EditorGrant = {
	actor: string;
	hostId: string;
	flowId: string;
	projectId: string | null;
	revision: number;
	allowedOperations: readonly AllowedEditorOperation[];
	expiresAt: string;
};

export type EditorRequest = {
	actor: string;
	hostId: string;
	flowId: string;
	projectId: string | null;
	revision: number;
	operation: EditorOperation;
	now: string;
};

export type EditorAuthorization =
	| { allowed: true }
	| {
			allowed: false;
			reason:
				| "actor_mismatch"
				| "host_mismatch"
				| "flow_mismatch"
				| "project_mismatch"
				| "revision_mismatch"
				| "operation_denied"
				| "grant_expired";
	  };

export function authorizeEditorRequest(grant: EditorGrant, request: EditorRequest): EditorAuthorization {
	if (request.actor !== grant.actor) return { allowed: false, reason: "actor_mismatch" };
	if (request.hostId !== grant.hostId) return { allowed: false, reason: "host_mismatch" };
	if (request.flowId !== grant.flowId) return { allowed: false, reason: "flow_mismatch" };
	if (request.projectId !== grant.projectId) return { allowed: false, reason: "project_mismatch" };
	if (request.revision !== grant.revision) return { allowed: false, reason: "revision_mismatch" };
	if (!grant.allowedOperations.includes(request.operation as AllowedEditorOperation)) {
		return { allowed: false, reason: "operation_denied" };
	}
	if (Date.parse(request.now) >= Date.parse(grant.expiresAt)) return { allowed: false, reason: "grant_expired" };
	return { allowed: true };
}
