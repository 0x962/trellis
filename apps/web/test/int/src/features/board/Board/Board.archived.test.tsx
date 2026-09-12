import { beforeEach, describe, expect, test } from "bun:test";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/drag-event-polyfill";
import "@atlaskit/pragmatic-drag-and-drop-unit-testing/dom-rect-polyfill";
import { fireEvent, screen } from "@testing-library/react";
import { Toaster } from "@trellis/ui";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { archiveProject } from "../../../../../rows";
import { createTestServer, type TestServer } from "../../../../../server";
import { settle } from "../../../../../ticketHost";
import { Board } from "../../../../../../src/features/board/Board";

beforeEach(() => localStorage.clear());

const notice = "CDE is archived. Unarchive the project to change it.";

const archivedBoard = async () => {
	const server = createTestServer();
	await archiveProject(server, "CDE");
	renderWithProviders(
		<>
			<Board projectRef="CDE" storageKey="CDE" onOpenTicket={() => {}} />
			<Toaster />
		</>,
		{ path: "/p/CDE/board", actor: "dana", server },
	);
	return server;
};

const moves = (server: TestServer) => server.calls.filter((call) => call.path.join(".") === "tickets.move");

const card = (identifier: string) => screen.getByRole("listitem", { name: new RegExp(`^${identifier} `) });

describe("Board of an archived project", () => {
	// The server refuses every write to a ticket under an archived project.
	// A drop sends no move, and a toast names the project.
	test("a drop onto another column sends no move", async () => {
		const server = await archivedBoard();
		const source = await screen.findByRole("listitem", { name: /^CDE-47 / });
		const target = screen.getAllByRole("list").find((list) => !list.contains(source))!;
		const dataTransfer = new DataTransfer();
		dataTransfer.setDragImage = () => {};
		document.elementFromPoint = () => target;
		document.elementsFromPoint = () => [target];
		fireEvent.dragStart(source, { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.dragEnter(target, { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.dragOver(target, { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.drop(target, { dataTransfer, clientX: 1, clientY: 10_000 });
		fireEvent.dragEnd(source, { dataTransfer, clientX: 1, clientY: 10_000 });
		await settle(50);
		expect(moves(server)).toHaveLength(0);
		expect(source.closest("ul")).not.toBe(target);
	});

	// `]` moves a focused card to the next column from the keyboard. On an
	// archived project it sends no move and says why.
	test("a bracket key on a card sends no move and names the project", async () => {
		const server = await archivedBoard();
		await screen.findByRole("listitem", { name: /^CDE-47 / });
		const focused = card("CDE-47");
		focused.focus();
		fireEvent.keyDown(focused, { key: "]" });
		expect(await screen.findByText(notice)).toBeDefined();
		await settle(50);
		expect(moves(server)).toHaveLength(0);
	});
});
