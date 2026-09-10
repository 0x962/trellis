import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { rowOf } from "../../../../test/inbox";
import { mockMatchMedia } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { NeedsYou } from "./NeedsYou";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<NeedsYou />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

const activeRows = () => [...document.querySelectorAll("[data-inbox-row][data-active]")];

describe("NeedsYou active row", () => {
	// Spec T9 item 1. The page opens with one active row: the first row of
	// the first section that has rows. It shows its actions, and the page
	// takes no focus from the person.
	test("the first row of the first non-empty section is active on open, and nothing takes focus", async () => {
		const server = createFakeServer();
		const inbox = await server.client.inbox.get({});
		const before = document.activeElement;
		render(server);
		const first = await rowOf(inbox.review.items[0]!.identifier);
		await waitFor(() => expect(activeRows()).toEqual([first]));
		expect(first.querySelector("[data-approve]")).not.toBeNull();
		expect(document.activeElement).toBe(before);
	});

	// The pointer or the focus on another row moves the active row there,
	// across the section borders. One row is active at a time.
	test("the pointer on a row in another section makes that row the only active row", async () => {
		const server = createFakeServer();
		const inbox = await server.client.inbox.get({});
		render(server);
		await rowOf(inbox.review.items[0]!.identifier);
		const other = await rowOf(inbox.stalled.items[0]!.identifier);
		fireEvent.pointerOver(other);
		await waitFor(() => expect(activeRows()).toEqual([other]));
		expect(other.querySelector("[data-start-with-agent]")).not.toBeNull();
	});
});
