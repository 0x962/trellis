import { beforeEach, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";

beforeEach(() => localStorage.clear());

test("frequent personas come first once, search finds the rest, and Escape starts nothing", async () => {
	const server = createTestServer();
	const builder = await server.client.personas.create({
		name: "Feature Builder",
		kind: "builder",
		instruction: "Build.",
	});
	const reviewer = await server.client.personas.create({
		name: "Code Clarity",
		kind: "reviewer",
		instruction: "Review.",
	});
	await server.client.personas.create({ name: "API Review", kind: "reviewer", instruction: "Review APIs." });
	for (const persona of [reviewer, builder, reviewer]) {
		const run = await server.client.agentRuns.start({ personaId: persona.id, ticket: "CDE-44" });
		await server.client.agentRuns.stop({ id: run.id });
	}
	const user = userEvent.setup();
	renderApp({ path: "/t/CDE-42", actor: "dana", server });
	const trigger = await screen.findByRole("button", { name: "New agent" });
	expect(trigger.querySelector(":scope > span")!.classList.contains("justify-start")).toBe(true);
	await user.click(trigger);
	const picker = within(await screen.findByRole("dialog", { name: "Assign a persona" }));
	await picker.findByText("Frequently Used");
	expect(picker.queryByRole("group", { name: "Builders" })).toBeNull();
	expect(picker.getAllByRole("option").map((item) => item.getAttribute("aria-label"))).toEqual([
		"Code Clarity",
		"Feature Builder",
		"API Review",
	]);
	await user.type(picker.getByRole("combobox", { name: "Search personas" }), "API");
	expect(picker.getAllByRole("option").map((item) => item.getAttribute("aria-label"))).toEqual(["API Review"]);
	await user.keyboard("{Escape}");
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(document.activeElement).toBe(trigger);
	expect(server.callsTo("agentRuns.start")).toHaveLength(3);
	// The sidebar carries its own Agents link, so this reads the rail alone.
	expect(within(screen.getByLabelText("Properties")).queryByRole("link", { name: "Agents" })).toBeNull();
});

test("a pending assignment accepts only one persona selection", async () => {
	const server = createTestServer();
	await server.client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." });
	const hold = server.holdNext("agentRuns.start");
	const user = userEvent.setup();
	renderApp({ path: "/t/CDE-42", actor: "dana", server });
	await user.click(await screen.findByRole("button", { name: "New agent" }));
	const picker = within(await screen.findByRole("dialog", { name: "Assign a persona" }));
	const option = await picker.findByRole("option", { name: "Builder" });
	await user.click(option);
	await picker.findByRole("status");
	await user.click(option);
	await user.keyboard("{Enter}");
	hold.release();
	await waitFor(() => expect(server.callsTo("agentRuns.start")).toHaveLength(1));
	const [run] = await server.client.agentRuns.list({ ticket: "CDE-42" });
	await screen.findByRole("button", { name: new RegExp(run!.name) });
	expect(server.callsTo("agentRuns.start")).toHaveLength(1);
});

test("the rail shows a picture for every working agent, no state word, and still takes another", async () => {
	const server = createTestServer();
	const builder = await server.client.personas.create({
		name: "Feature Builder",
		kind: "builder",
		instruction: "Build.",
	});
	await server.client.personas.create({ name: "Code Clarity", kind: "reviewer", instruction: "Review." });
	const first = await server.client.agentRuns.start({ personaId: builder.id, ticket: "CDE-42" });
	const user = userEvent.setup();
	renderApp({ path: "/t/CDE-42", actor: "dana", server });
	const rail = within(await screen.findByRole("region", { name: "Agent assignment" }));
	await rail.findByRole("button", { name: `${first.name} · builder` });
	expect(rail.getByRole("img", { name: `${first.name} · agent` })).toBeTruthy();
	expect(rail.getByText("builder")).toBeTruthy();
	expect(rail.queryByText(/running/)).toBeNull();

	await user.click(rail.getByRole("button", { name: "New agent" }));
	const picker = within(await screen.findByRole("dialog", { name: "Assign a persona" }));
	await user.click(await picker.findByRole("option", { name: "Code Clarity" }));
	await waitFor(() => expect(server.callsTo("agentRuns.start")).toHaveLength(2));
	await user.keyboard("{Escape}");

	// Both agents hold the ticket, and the picker takes one more.
	const runs = await server.client.agentRuns.list({ ticket: "CDE-42" });
	const second = runs.find((run) => run.kind === "reviewer")!;
	await rail.findByRole("button", { name: `${second.name} · reviewer` });
	expect(rail.getByRole("button", { name: `${first.name} · builder` })).toBeTruthy();
	expect(rail.getByRole("button", { name: "New agent" })).toBeTruthy();
});

test("a stopped agent keeps its row without the live dot", async () => {
	const server = createTestServer();
	const builder = await server.client.personas.create({
		name: "Feature Builder",
		kind: "builder",
		instruction: "Build.",
	});
	const run = await server.client.agentRuns.start({ personaId: builder.id, ticket: "CDE-42" });
	await server.client.agentRuns.stop({ id: run.id });
	renderApp({ path: "/t/CDE-42", actor: "dana", server });
	const rail = within(await screen.findByRole("region", { name: "Agent assignment" }));
	const picture = await rail.findByRole("img", { name: `${run.name} · agent` });
	expect(picture.querySelector("[data-live]")).toBeNull();
	expect(rail.queryByText(/stopped/)).toBeNull();
});
