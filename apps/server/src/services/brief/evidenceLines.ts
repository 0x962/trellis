// The two lines of the brief that tell the agent what a pull request needs
// before `trellis pr add` and `trellis ready` accept it.
export const evidenceLines = [
	"## Evidence",
	"",
	"Write the explanation with trellis summary write <pr>, and write the evidence document with trellis evidence write <pr> --body -.",
	"When the pull request adds or changes data models, include a mermaid `erDiagram` in the explanation. Show the added or changed tables, key fields with types, and relations to the models they touch. Mark new and changed parts.",
	"trellis pr add and trellis ready <pr> exit with code 1 until the pull request has both, and they name the missing one with its command.",
];
