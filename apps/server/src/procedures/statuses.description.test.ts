import { describe, test } from "bun:test";

// The status description is the manager's rulebook for that status. Each
// case names the builder that fills it. `bun test --todo` runs each case,
// and each one fails until the builder writes it.
const todo = (name: string) =>
	test.todo(name, () => {
		throw new Error(`Not written: ${name}`);
	});

describe("status descriptions", () => {
	todo("server builder: the migration adds statuses.description as text not null default ''");
	todo("server builder: statuses.create stores the description and statuses.list returns it");
	todo("server builder: statuses.update changes the description and writes one activity row");
	todo("server builder: a new root project seeds a description for each default status");
	todo("server builder: a sub-project that takes its own set copies the descriptions");
});
