import { describe, test } from "bun:test";

// The agents procedures over app.request. Each case names the builder that
// fills it. The runner in these tests is the fake `superset` binary from
// TRELLIS_SUPERSET_BIN, which records its argument lists. `bun test --todo`
// runs each case, and each one fails until the builder writes it.
const todo = (name: string) =>
	test.todo(name, () => {
		throw new Error(`Not written: ${name}`);
	});

describe("agents procedures", () => {
	todo(
		"server builder: agents.register stores the session and returns it; a second call for the same terminal updates the row",
	);
	todo("server builder: agents.sessions lists the sessions of a project, and of one ticket");
	todo(
		"server builder: agents.inbox returns the activity after the stored cursor with ticket summaries and comment bodies, then advances the cursor",
	);
	todo(
		"server builder: agents.inbox leaves out the rows the manager wrote, and a second call right after returns no events",
	);
	todo(
		"server builder: agents.inbox with more rows than the limit returns the limit, more: true, and the cursor of the last row",
	);
	todo(
		"server builder: agents.startBuilder creates the ticket workspace through the runner and returns a starting builder session",
	);
	todo(
		"server builder: agents.startBuilder a second time for the same ticket returns the same session and creates no workspace",
	);
	todo(
		"server builder: agents.startBuilder at maxConcurrent answers CONCURRENCY_LIMIT with the limit and the running count",
	);
	todo(
		"server builder: agents.startBuilder answers RUNNER_UNAVAILABLE disabled when the global or the project switch is off",
	);
	todo(
		"server builder: agents.startBuilder answers RUNNER_UNAVAILABLE missing when the superset binary does not exist",
	);
	todo(
		"server builder: agents.startReviewer opens a reviewer terminal in the builder's workspace and answers INVALID_PR_URL for another URL",
	);
	todo("server builder: agents.stop sets the state to stopped and emits agents.session");
	todo(
		"server builder: agents.wake sends the text to the manager's terminal, sets lastWokenAt, and emits agents.session",
	);
	todo(
		"server builder: agents.settings returns runner superset, enabled false, and no projects before the first setSettings",
	);
	todo("server builder: agents.setSettings replaces the settings and agents.settings returns them");
	todo(
		"server builder: agents.runnerProjects lists the projects of superset projects list and matches each trellis project by its declared repo",
	);
	todo(
		"server builder: agents.runnerProjects answers RUNNER_UNAVAILABLE missing when the superset binary does not exist",
	);
});
