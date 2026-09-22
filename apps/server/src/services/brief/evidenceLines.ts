// The two lines of the brief that tell the agent what a pull request needs
// before `trellis pr add` and `trellis ready` accept it.
export const evidenceLines = [
	"## Evidence",
	"",
	"Write the explanation with trellis summary write <pr>, and write the evidence document with trellis evidence write <pr> --body -.",
	"trellis pr add and trellis ready <pr> exit with code 1 until the pull request has both, and they name the missing one with its command.",
];
