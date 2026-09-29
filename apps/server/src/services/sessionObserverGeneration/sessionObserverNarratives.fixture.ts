export type SessionObserverNarrativeFixture = {
	name: string;
	expected: "accept" | "reject";
	text: string;
};

export const sessionObserverNarrativeFixtures: SessionObserverNarrativeFixture[] = [
	{
		name: "recent action log",
		expected: "reject",
		text: `The release is healthy. Several unrelated feature checks pass. PR 564 and PR 565 have new states, and their workers have assignments. The next queue item can start.`,
	},
	{
		name: "source work before release",
		expected: "accept",
		text: `Trellis is making long agent sessions understandable without a person reading the full transcript. The old status system interrupts the worker and often returns an activity log instead of a project account.

The observer pieces now exist separately, but they have not yet produced one coherent account from real work. The agent now connects them because separate storage and provider results do not prove that the human receives a useful narrative while the worker continues.

The next expected result is a representative observer account that explains the project, preserves corrections, and appears without a worker prompt. Review, merge, and installed acceptance remain later stages.`,
	},
	{
		name: "human input",
		expected: "accept",
		text: `The project moves the current Trellis data to a remote Linux host without losing sessions, Pages, attachments, or worktrees. The transfer design and source inventory exist, but no live move can start until the person supplies the destination machine and chooses a disposition for unsupported items.

The agent has stopped before cutover because that choice changes which data reaches the new host. The next expected result is the person's destination and disposition decision. The agent can then prepare a read-only migration preview.`,
	},
	{
		name: "installed acceptance",
		expected: "accept",
		text: `The release gives each internal page its own saved tab and navigation history. The source, focused checks, and Review passed before the release owner merged the change.

The installed app now restores the tabs after a restart and keeps Back and Forward history separate in each tab. The acceptance check covered the installed package, so this result is product proof and not only source proof. Native external-link behavior remains outside this result. The agent now checks it in the installed app because the current acceptance did not cover it. The next expected result is separate installed proof for that behavior.`,
	},
];
