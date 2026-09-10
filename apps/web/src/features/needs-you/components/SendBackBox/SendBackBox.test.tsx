import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { callsTo, focusRow, lastCallTo, rowOf, statusOf } from "../../../../../test/inbox";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { ReviewSection } from "../ReviewSection";

// The box opens on a review row, so every test drives it through the
// section that owns the row.

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<ReviewSection />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

const box = () => screen.findByRole("textbox", { name: /Reason to send back/i });

// The submit button of the open box. Every review row also shows a Send
// back button, so the helper looks inside the box only.
const submit = () =>
	within(screen.getByRole("group", { name: /^Send back / })).getByRole("button", { name: /^Send back/ });

describe("SendBackBox", () => {
	// NY-23. The prompt is the question, and the caret is already in the box.
	test("opens on r with the Reason to send back label and takes focus", async () => {
		const user = userEvent.setup();
		render(createFakeServer());
		await focusRow("CDE-42");
		await user.keyboard("r");
		const field = await box();
		expect(screen.getByText("Reason to send back")).toBeDefined();
		expect(document.activeElement).toBe(field);
	});

	// NY-24
	test("opens from the Send back button", async () => {
		const user = userEvent.setup();
		render(createFakeServer());
		const row = await rowOf("CDE-42");
		await user.click(row.querySelector<HTMLButtonElement>("button[data-send-back]")!);
		expect(await box()).toBeDefined();
	});

	// NY-25. A send back with no comment tells the agent nothing.
	test("keeps the submit disabled while the body is empty", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("r");
		await box();
		expect((submit() as HTMLButtonElement).disabled).toBe(true);
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		expect(callsTo(server, "comments.create")).toHaveLength(0);
		expect(callsTo(server, "tickets.move")).toHaveLength(0);
	});

	// NY-26. The comment goes first, so the agent that picks the ticket up
	// reads why it came back.
	test("posts the comment and then moves to the lowest-position started status", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const started = await statusOf(server, "CDE", "in-progress");
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("r");
		await user.type(await box(), "Fix the migration");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		await waitFor(() => expect(lastCallTo(server, "tickets.move")).toBeDefined());
		const order = server.calls
			.map((call) => call.path.join("."))
			.filter((path) => path === "comments.create" || path === "tickets.move");
		expect(order).toEqual(["comments.create", "tickets.move"]);
		expect(lastCallTo(server, "comments.create")!.input).toEqual({ ticket: "CDE-42", body: "Fix the migration" });
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ticket: "CDE-42", status: started.id });
	});

	// NY-27. Escape is the way out, and it writes nothing.
	test("closes on Escape without writing anything", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		render(server);
		const row = await focusRow("CDE-42");
		await user.keyboard("r");
		await user.type(await box(), "Fix the migration");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("textbox", { name: /Reason to send back/i })).toBeNull());
		expect(callsTo(server, "comments.create")).toHaveLength(0);
		expect(callsTo(server, "tickets.move")).toHaveLength(0);
		expect(document.activeElement).toBe(row);
	});

	// The comment is on the server when the move fails. The toast says so,
	// its Retry sends only the move, and the box can send again.
	test("a failed move after the comment posts shows a toast whose Retry sends only the move", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const started = await statusOf(server, "CDE", "in-progress");
		server.failNext("tickets.move", { code: "NOT_FOUND", data: { ref: "CDE-42" } });
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("r");
		await user.type(await box(), "Fix the migration");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		const text = await screen.findByText(/comment posted/i);
		const toast = text.closest("[data-sonner-toast]") as HTMLElement;
		expect(toast.textContent).toMatch(/CDE-42 did not move back/);
		expect(callsTo(server, "comments.create")).toHaveLength(1);
		expect((submit() as HTMLButtonElement).disabled).toBe(false);
		await user.click(within(toast).getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(callsTo(server, "tickets.move")).toHaveLength(2));
		expect(callsTo(server, "comments.create")).toHaveLength(1);
		expect(lastCallTo(server, "tickets.move")!.input).toEqual({ ticket: "CDE-42", status: started.id });
	});

	// NY-29. The text is the person's work, so a failed post keeps it.
	test("keeps the text and skips the move when the comment fails", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		// The server refuses the comment. An archived project would also
		// refuse it, but the row of an archived ticket opens no box at all.
		server.failNext("comments.create", { code: "PROJECT_ARCHIVED" });
		render(server);
		await focusRow("CDE-42");
		await user.keyboard("r");
		await user.type(await box(), "Fix the migration");
		await user.keyboard("{Meta>}{Enter}{/Meta}");
		expect(await screen.findByText(/archived/i)).toBeDefined();
		expect(((await box()) as HTMLTextAreaElement).value).toBe("Fix the migration");
		expect(callsTo(server, "tickets.move")).toHaveLength(0);
	});
});
