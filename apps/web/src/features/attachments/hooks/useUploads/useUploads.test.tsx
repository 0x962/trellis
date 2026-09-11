import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dropFiles, fileOf, surfaceOf } from "../../../../../test/attachments";
import { callsTo, gatedServer } from "../../../../../test/inbox";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { createTestServer } from "../../../../../test/server";
import { AttachmentGrid } from "../../AttachmentGrid";
import { useUploads } from "./useUploads";

beforeEach(() => localStorage.clear());

// A surface with a button in place of a drop: the test starts the uploads
// and reads one list item per file.
function UploadsProbe({ ticket, files }: { ticket: string; files: File[] }) {
	const { uploads, start } = useUploads(ticket);
	return (
		<>
			<button type="button" onClick={() => start(files)}>
				Start
			</button>
			<ul>
				{uploads.map((upload) => (
					<li key={upload.id} data-upload={upload.id} data-name={upload.name} data-percent={upload.percent} />
				))}
			</ul>
		</>
	);
}

const entries = () => [...document.querySelectorAll<HTMLElement>("[data-upload]")];

describe("useUploads", () => {
	// OUT-57. The server list is the truth, so the grid renders it and
	// never a row the page kept beside it.
	test("invalidates the attachments list of the ticket after an upload", async () => {
		const server = createTestServer();
		renderWithProviders(<AttachmentGrid ticket="CDE-42" />, { path: "/t/CDE-42", actor: "navid", server });
		const surface = await surfaceOf();
		await waitFor(() => expect(callsTo(server, "attachments.list")).toHaveLength(1));
		dropFiles(surface, [fileOf("notes.txt", "text/plain", 2048)]);
		await screen.findByText("notes.txt");
		await waitFor(() => expect(callsTo(server, "attachments.list")).toHaveLength(2));
		expect(screen.getAllByText("notes.txt")).toHaveLength(1);
	});

	// OUT-58
	test("tracks one progress entry per file", async () => {
		const user = userEvent.setup();
		const gate = gatedServer(createTestServer());
		const files = [fileOf("notes.txt", "text/plain", 100), fileOf("plan.md", "text/markdown", 400)];
		renderWithProviders(<UploadsProbe ticket="CDE-42" files={files} />, {
			path: "/t/CDE-42",
			actor: "navid",
			server: gate.server,
		});
		gate.hold();
		await user.click(screen.getByRole("button", { name: "Start" }));
		await waitFor(() => expect(entries()).toHaveLength(2));
		expect(entries().map((entry) => entry.getAttribute("data-name"))).toEqual(["notes.txt", "plan.md"]);
		expect(new Set(entries().map((entry) => entry.getAttribute("data-upload"))).size).toBe(2);
		for (const entry of entries()) {
			expect(Number(entry.getAttribute("data-percent"))).toBeGreaterThanOrEqual(0);
			expect(Number(entry.getAttribute("data-percent"))).toBeLessThanOrEqual(100);
		}
		gate.release();
	});
});
