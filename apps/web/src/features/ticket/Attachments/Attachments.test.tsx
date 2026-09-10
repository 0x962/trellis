import { beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ulid } from "ulid";
import { createFakeServer, type FakeServer } from "../../../../test/fake-server";
import { findTicket } from "../../../../test/fake-server/state";
import { ago, day, renderTicket, settle } from "../../../../test/ticketHost";
import { TicketView } from "../TicketView";
import { Attachments } from "./Attachments";

beforeEach(() => localStorage.clear());

const mount = (identifier: string, server: FakeServer = createFakeServer()) =>
	renderTicket(identifier, (ticket) => <Attachments ticket={ticket} />, { path: `/t/${identifier}`, server });

const section = () => screen.findByRole("region", { name: /Attachments/ });

// A 2 KB text file uploaded by navid a day ago.
const addNotes = (server: FakeServer) => {
	const ticket = findTicket(server.state, "CDE-42")!;
	const id = ulid();
	server.state.attachments.set(id, {
		id,
		ticketId: ticket.id,
		filename: "merge-notes.txt",
		mime: "text/plain",
		size: 2048,
		sha256: "a".repeat(64),
		actor: { name: "navid", kind: "human" },
		createdAt: ago(day),
		url: `/api/attachments/${id}/file`,
	});
	return id;
};

const filesTransfer = () => ({ types: ["Files"], files: [], items: [] });

describe("features/ticket/Attachments", () => {
	// WT-73. size-24 is 96 px on the 4 px scale.
	test("renders images as thumbnails and files as rows", async () => {
		const server = createFakeServer();
		const id = addNotes(server);
		mount("CDE-42", server);
		const element = await section();
		const thumb = within(element).getByRole("img", { name: /fork-pages-after-merge\.png/ });
		expect(thumb.tagName).toBe("IMG");
		expect(thumb.className).toMatch(/\bsize-24\b/);
		const file = within(element).getByRole("listitem", { name: /merge-notes\.txt/ });
		expect(file.textContent).toContain("merge-notes.txt");
		expect(file.textContent).toMatch(/2(\.0)? KB/);
		expect(within(file).getByRole("img", { name: "navid" })).toBeDefined();
		expect(file.querySelector("time")).not.toBeNull();
		const download = within(file).getByRole("link", { name: /Download/ });
		expect(download.getAttribute("href")).toBe(`/api/attachments/${id}/file`);
	});

	// WT-74
	test("shows the drop zone box", async () => {
		mount("CDE-42");
		const element = await section();
		const box = within(element).getByText("Drop files or click to upload");
		expect(box.closest(".border-dashed")).not.toBeNull();
	});

	// WT-75. The whole surface is a drop target; the overlay names the
	// ticket. Upload lands in M5, so a drop calls nothing.
	test("the drop overlay is visual only until M5", async () => {
		const { server } = renderTicket(
			"CDE-42",
			(ticket) => <TicketView identifier={ticket.identifier} variant="page" />,
			{ path: "/t/CDE-42" },
		);
		const surface = await screen.findByRole("article");
		fireEvent.dragEnter(surface, { dataTransfer: filesTransfer() });
		expect(await screen.findByText("Drop to attach to CDE-42")).toBeDefined();
		fireEvent.drop(surface, { dataTransfer: filesTransfer() });
		await waitFor(() => expect(screen.queryByText("Drop to attach to CDE-42")).toBeNull());
		await settle();
		expect(server.callsTo("attachments.upload")).toHaveLength(0);
	});
});
