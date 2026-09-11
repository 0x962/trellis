// The prose and the examples the post-processed OpenAPI document carries,
// so an agent that reads /api/openapi.json alone can work.

export const ACTOR_HEADER_DESCRIPTION =
	"Who acts, as <human|agent>:<name>. The name is 1 to 64 printable ASCII characters without a colon. Required on every request whose method is not GET.";

export const ACTOR_HEADER_EXAMPLE = "agent:claude-code";

// The default address of the local server. A gateway or a proxy in front of it
// serves the same API under the name TRELLIS_PUBLIC_URL carries.
export const SERVERS = [{ url: "http://127.0.0.1:4521/api", description: "The local server" }];

export const TAGS = [
	{ name: "personas", description: "Saved personas. Each persona has a name and an instruction." },
	{ name: "projects", description: "The project tree. A root has a key; a sub-project has a parent and a slug." },
	{ name: "statuses", description: "The status set of a project. A sub-project inherits the nearest owner's set." },
	{ name: "tickets", description: "Tickets: list, board, counts, one ticket, and every write." },
	{ name: "timeline", description: "Comments and activity of one ticket, newest first." },
	{ name: "comments", description: "Comments on a ticket." },
	{ name: "attachments", description: "Files on a ticket. The bytes are served at GET /api/attachments/{id}/file." },
	{ name: "pull requests", description: "GitHub pull requests linked to a ticket, with their CI state." },
	{ name: "search", description: "Full text search over tickets and projects." },
	{ name: "inbox", description: "The Needs you sections: reviews, failing CI, stalled work, and agent completions." },
	{ name: "brief", description: "The markdown brief an agent starts from." },
	{ name: "actors", description: "Every human and agent a mutation has carried." },
	{ name: "settings", description: "The server settings." },
	{ name: "system", description: "Health, the gh state, and backups." },
	{
		name: "agents",
		description: "The manager, builder, and reviewer agents of a project, their inbox, and the agent settings.",
	},
	{
		name: "agent runs",
		description: "The agents a persona starts on a ticket or a project, their output, and their follow-ups.",
	},
];

export const DESCRIPTION = `trellis is a local ticket tracker for agent-driven work. No auth, no assignees. Every action carries an actor.

## The actor header

Every non-GET request needs the header \`x-trellis-actor: <human|agent>:<name>\`. A GET request ignores the header. A request without it answers 400 ACTOR_REQUIRED; a malformed one answers 400 ACTOR_INVALID. The optional header \`x-trellis-session: <id>\` is stored with the activity a request writes.

## Refs

Every ref is case-insensitive on the way in and canonical on the way out.

| ref | grammar | example |
|---|---|---|
| TicketRef | a ULID or \`KEY-n\` | \`CDE-42\` |
| ProjectRef | a ULID, \`KEY\`, or \`KEY.slug(.slug)*\` | \`CDE\`, \`CDE.web.auth\` |
| StatusRef | a ULID, a slug, a name, or \`category:<category>\` | \`in-progress\`, \`In Progress\`, \`category:review\` |

## The list grammar

\`GET /api/tickets\` takes flat query parameters. A parameter that takes several values takes a comma list. \`parent=none\` keeps top-level tickets only. \`sort\` takes \`[-]updatedAt\`, \`createdAt\`, \`priority\`, \`number\`, \`status\`, or \`position\`; the default is \`-updatedAt\`. \`limit\` is 1 to 200; \`cursor\` continues a page and belongs to one filter and sort.

Example: \`GET /api/tickets?project=CDE&status=in-progress,agent-review&parent=none&ci=fail&sort=-updatedAt\`

## Rules for agents

An agent never moves a ticket to a done status without \`force\`. A human does that. An agent never deletes a ticket or a project without \`force\`. The server enforces both rules: 403 AGENT_CANNOT_COMPLETE and 403 AGENT_CANNOT_DELETE.

## Two calls

Create a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"CDE","title":"First"}'

Move it to In Progress:
curl -X POST http://127.0.0.1:4521/api/tickets/CDE-1/move -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"status":"in-progress"}'

## Versions and errors

Every response carries \`x-trellis-api-version\`. Every error is JSON with \`code\`, \`status\`, \`message\`, and \`data\`; the codes are listed on each operation.
`;

// One example per request body, keyed by `<METHOD> <path>`.
export const BODY_EXAMPLES: Record<string, unknown> = {
	"POST /personas": { name: "Reviewer", instruction: "Read the diff. Report defects with evidence." },
	"PATCH /personas/{id}": {
		name: "Code reviewer",
		instruction: "Read each changed file. Report defects with evidence.",
	},
	"POST /projects": { key: "CDE", name: "Code" },
	"PATCH /projects/{project}": { name: "Code, renamed", description: "The desktop app." },
	"POST /projects/{project}/move": { parent: "CDE", after: "CDE.web" },
	"PUT /projects/{project}/repos": { repos: [{ owner: "acme", repo: "web" }] },
	"POST /projects/{project}/statuses": { name: "Blocked", category: "started", color: "amber" },
	"PATCH /projects/{project}/statuses/{status}": { name: "Doing" },
	"PUT /projects/{project}/statuses/order": {
		statuses: ["01J9Z0000000000000000000A1", "01J9Z0000000000000000000A2"],
	},
	"POST /tickets": {
		project: "CDE",
		title: "Add dark mode",
		description: "Follow the system setting.",
		priority: "high",
	},
	"PATCH /tickets/{ticket}": { title: "Add dark mode", priority: "urgent", expectedVersion: 3 },
	"POST /tickets/{ticket}/move": { status: "in-progress", after: "CDE-41" },
	"POST /tickets/update-many": { tickets: ["CDE-1", "CDE-2"], priority: "low" },
	"POST /tickets/delete-many": { tickets: ["CDE-1", "CDE-2"] },
	"POST /tickets/{ticket}/comments": { body: "Tests pass. Ready for review." },
	"POST /comments/{id}/resolve": { resolved: true },
	"PATCH /comments/{id}": { body: "Tests pass. Ready for a human review." },
	"POST /tickets/{ticket}/attachments": { file: "<the file bytes as one multipart part named file>", name: "shot.png" },
	"POST /tickets/{ticket}/prs": { url: "https://github.com/acme/web/pull/12" },
	"PUT /settings": {
		defaultActorName: "dana",
		stalledHours: 24,
		diffUrlTemplate: "{url}/files",
	},
	"POST /agent-runs": { personaId: "01J9Z0000000000000000000A1", ticket: "CDE-42" },
	"POST /agent-runs/{id}/send": { text: "The CI run is red. Read the failing step and fix it." },
	"POST /agents/inbox": { project: "CDE" },
	"POST /agents/register": {
		role: "builder",
		project: "CDE",
		ticket: "CDE-42",
		workspaceId: "ws-7f3a",
		terminalId: "term-1",
		claudeSessionId: "9b1f0c3e-2d4a-4f7b-8c6d-1a2b3c4d5e6f",
	},
	"POST /agents/builder": { ticket: "CDE-42" },
	"POST /agents/reviewer": { ticket: "CDE-42", prUrl: "https://github.com/acme/web/pull/12" },
	"POST /agents/wake": { project: "CDE", text: "trellis: 2 changes in CDE. Run: trellis agents inbox --project CDE" },
	"POST /agents/manager/retry": { project: "CDE" },
	"PUT /agents/settings": {
		runner: "superset",
		enabled: true,
		projects: [
			{
				projectId: "01J9Z0000000000000000000P1",
				enabled: true,
				supersetProjectId: null,
				baseBranch: "main",
				maxConcurrent: 3,
				removeWorkspaceOnDone: true,
			},
		],
	},
};
