import { expect, test } from "bun:test";
import {
	provisionHostRepositories,
	type HostRepositoryProvisionInput,
	type HostRepositoryProvisionLogContext,
} from "./provisionRepositories.ts";

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
			cloneUrl: "https://example.com/fictional.git",
			hostPath: "/home/agent/projects/fictional",
			present: false,
		},
	],
};

test("clones each missing repository on the selected host", async () => {
	const parents: string[] = [];
	const clones: Array<{ gitExecutableHostPath: string; cloneUrl: string; hostPath: string }> = [];
	const logs: Array<{ message: string; context: HostRepositoryProvisionLogContext }> = [];
	const result = await provisionHostRepositories(
		input,
		(message, context) => logs.push({ message, context }),
		{
			ensureParent: async (path) => {
				parents.push(path);
			},
			clone: async (request) => {
				clones.push(request);
				return { exitCode: 0, failure: null };
			},
		},
	);
	expect(parents).toEqual(["/home/agent/projects"]);
	expect(clones).toEqual([
		{
			gitExecutableHostPath: "/usr/bin/git",
			cloneUrl: "https://example.com/fictional.git",
			hostPath: "/home/agent/projects/fictional",
		},
	]);
	expect(logs).toEqual([
		{
			message: "host repository provision",
			context: {
				repositoryId: "fictional",
				hostPath: "/home/agent/projects/fictional",
				gitExecutableHostPath: "/usr/bin/git",
				action: "clone",
				exitCode: 0,
				detail: null,
			},
		},
	]);
	expect(result).toEqual([
		{
			id: "fictional",
			name: "example/fictional",
			hostPath: "/home/agent/projects/fictional",
		},
	]);
});

test("keeps a failed clone source out of the log and error", async () => {
	const logs: HostRepositoryProvisionLogContext[] = [];
	const message = await provisionHostRepositories(
		input,
		(_message, context) => logs.push(context),
		{
			ensureParent: async () => {},
			clone: async () => ({ exitCode: 128, failure: "authentication" }),
		},
	).then(
		() => "",
		(error: Error) => error.message,
	);
	expect(logs).toEqual([
		{
			repositoryId: "fictional",
			hostPath: "/home/agent/projects/fictional",
			gitExecutableHostPath: "/usr/bin/git",
			action: "clone",
			exitCode: 128,
			detail: "Git reported an authentication failure.",
		},
	]);
	expect(message).toBe(
		"Could not provision example/fictional at /home/agent/projects/fictional on the selected host. Git exited with code 128. Git reported an authentication failure.",
	);
	expect(JSON.stringify({ logs, message })).not.toContain(input.repositories[1]!.cloneUrl);
});

test("rejects credentials before the clone process starts", async () => {
	const cloneUrls: string[] = [];
	const message = await provisionHostRepositories(
		{
			...input,
			repositories: [
				{
					...input.repositories[1]!,
					cloneUrl: "https://credential@example.com/fictional.git",
				},
			],
		},
		() => {},
		{
			ensureParent: async () => {},
			clone: async (request) => {
				cloneUrls.push(request.cloneUrl);
				return { exitCode: 0, failure: null };
			},
		},
	).then(
		() => "",
		(error: Error) => error.message,
	);
	expect(cloneUrls).toEqual([]);
	expect(message).toBe("Repository fictional needs a credential-free HTTPS clone URL.");
	expect(message).not.toContain("credential@example.com");
});
