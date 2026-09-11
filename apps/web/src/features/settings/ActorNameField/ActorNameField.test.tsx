import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { callsTo, lastCallTo } from "../../../../test/inbox";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../test/server";
import { ActorNameField } from "./ActorNameField";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: TestServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<ActorNameField />
		</>,
		{ path: "/settings", actor: "navid", server },
	);

const field = () => screen.findByRole("textbox", { name: /your name/i });

// Types `name` into the field and moves the focus away, which saves it.
const saveName = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	const input = await field();
	await user.clear(input);
	if (name !== "") await user.type(input, name);
	await user.tab();
	return input as HTMLInputElement;
};

describe("ActorNameField", () => {
	// ST-03. settings.set replaces the whole record, so a name save carries
	// every other setting unchanged.
	test("sends every settings field on a name save", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const saved = await server.client.settings.get();
		render(server);
		await saveName(user, "Nav");
		await waitFor(() => expect(lastCallTo(server, "settings.set")).toBeDefined());
		expect(lastCallTo(server, "settings.set")!.input).toEqual({ ...saved, defaultActorName: "Nav" });
	});

	// ST-04. The name is the identity every write carries.
	test("makes the saved name the actor on the next mutation", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		const { client } = render(server);
		await saveName(user, "Nav");
		expect(JSON.parse(localStorage.getItem("trellis.actor")!)).toEqual({ name: "Nav", kind: "human" });
		await client.comments.create({ ticket: "CDE-42", body: "Looks right." });
		expect(lastCallTo(server, "comments.create")!.actor).toBe("human:Nav");
	});

	// ST-05. An empty name would make every write anonymous.
	test("blocks an empty name with an inline message", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		render(server);
		const input = await saveName(user, "");
		expect(await screen.findByText("Enter a name.")).toBeDefined();
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(callsTo(server, "settings.set")).toHaveLength(0);
	});

	// ST-11. A failed save leaves the field showing what the server holds.
	test("restores the old value and toasts when the save fails", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		server.failNext("settings.set", {
			code: "INPUT_VALIDATION_FAILED",
			data: { issues: [{ message: "The name is taken." }] },
		});
		render(server);
		const input = await saveName(user, "Nav");
		expect(await screen.findByText("The input does not match the schema.")).toBeDefined();
		expect(await screen.findByRole("button", { name: "Retry" })).toBeDefined();
		await waitFor(() => expect(input.value).toBe("navid"));
	});
});
