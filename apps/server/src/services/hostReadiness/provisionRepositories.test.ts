import { expect, test } from "bun:test";
import { provisionHostRepositories, type HostRepositoryProvisionInput } from "./provisionRepositories.ts";

const input: HostRepositoryProvisionInput = {
	gitExecutableHostPath: "/usr/bin/git",
	repositories: [
		{
			id: "existing",
			name: "example/existing",
			cloneUrl: "https://example.com/existing.git",
			hostPath: "/home/agent/projects/existing",
			present: true,
		},
		{
			id: "fictional",
			name: "example/fictional",
			cloneUrl: "https://credential@example.com/fictional.git",
			hostPath: "/home/agent/projects/fictional",
			present: false,
		},
	],
};

test("clones each missing repository on the selected host", async () => {
	const parents: string[] = [];
	const clones: Array<{ gitExecutableHostPath: string; cloneUrl: string; hostPath: string }> = [];
	const result = await provisionHostRepositories(input, {
		ensureParent: async (path) => {
			parents.push(path);
		},
		clone: async (request) => {
			clones.push(request);
			return 0;
		},
	});
	expect(parents).toEqual(["/home/agent/projects"]);
	expect(clones).toEqual([
		{
			gitExecutableHostPath: "/usr/bin/git",
			cloneUrl: "https://credential@example.com/fictional.git",
			hostPath: "/home/agent/projects/fictional",
		},
	]);
	expect(result).toEqual([
		{
			id: "fictional",
			name: "example/fictional",
			hostPath: "/home/agent/projects/fictional",
		},
	]);
	expect(JSON.stringify(result)).not.toContain("credential@example.com");
});

test("keeps a failed clone source out of the error", async () => {
	const cloneUrl = input.repositories[1]!.cloneUrl;
	const message = await provisionHostRepositories(input, {
		ensureParent: async () => {},
		clone: async () => 1,
	}).then(
		() => "",
		(error: Error) => error.message,
	);
	expect(message).toBe("Could not provision example/fictional at /home/agent/projects/fictional on the selected host.");
	expect(message).not.toContain(cloneUrl);
});
