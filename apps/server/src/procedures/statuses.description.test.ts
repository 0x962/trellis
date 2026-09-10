import { describe, test } from "bun:test";

// The status description is the manager's rulebook for that status. Each
// case names the builder that fills it.
describe("status descriptions", () => {
	test.todo("server builder: the migration adds statuses.description as text not null default ''");
	test.todo("server builder: statuses.create stores the description and statuses.list returns it");
	test.todo("server builder: statuses.update changes the description and writes one activity row");
	test.todo("server builder: a new root project seeds a description for each default status");
	test.todo("server builder: a sub-project that takes its own set copies the descriptions");
});
