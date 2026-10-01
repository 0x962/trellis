import { expect, test } from "bun:test";
import { createStoryClient } from "./createStoryClient";

test("a missing fixture refuses the procedure without a network request", async () => {
	const client = createStoryClient({});
	await expect(client.projects.list({})).rejects.toThrow("Story fixture is missing: projects.list");
});

test("each read receives an independent copy of the fixture", async () => {
	const fixture = [{ id: "storybook-project", name: "Example" }];
	const client = createStoryClient({ "projects.list": fixture });
	const first = await client.projects.list({});
	first[0]!.name = "Changed";
	expect((await client.projects.list({}))[0]?.name).toBe("Example");
	expect(fixture[0]?.name).toBe("Example");
});

test("separate clients receive independent copies from one response handler", async () => {
	const fixture = [{ id: "storybook-project", name: "Example" }];
	const responses = { "projects.list": async () => fixture };
	const firstClient = createStoryClient(responses);
	const secondClient = createStoryClient(responses);
	const first = await firstClient.projects.list({});
	first[0]!.name = "Changed";
	expect((await secondClient.projects.list({}))[0]?.name).toBe("Example");
	expect(fixture[0]?.name).toBe("Example");
});

test("response handlers receive input and cancellation and can reject", async () => {
	const controller = new AbortController();
	const client = createStoryClient({
		"projects.get": async (input: unknown, signal?: AbortSignal) => {
			expect(input).toEqual({ project: "DEMO" });
			expect(signal).toBe(controller.signal);
			throw new Error("Example connection failure");
		},
	});
	await expect(client.projects.get({ project: "DEMO" }, { signal: controller.signal })).rejects.toThrow(
		"Example connection failure",
	);
});
