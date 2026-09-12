import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dragFilesOver, fileOf } from "../../../../../attachments";
import { callsTo } from "../../../../../inbox";
import { renderWithProviders } from "../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../server";
import { DropTarget } from "../../../../../../src/features/attachments/DropTarget";
import { AttachmentBox } from "../../../../../../src/features/attachments/AttachmentBox/AttachmentBox";

beforeEach(() => localStorage.clear());

const renderBox = (server: TestServer = createTestServer()) =>
	renderWithProviders(<AttachmentBox ticket="CDE-42" />, { path: "/t/CDE-42", actor: "dana", server });

const boxOf = async () =>
	await waitFor(() => {
		const box = document.querySelector<HTMLElement>("[data-attachment-box]");
		if (box === null) throw new Error("No attachment box on the page.");
		return box;
	});

const pickerOf = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

describe("AttachmentBox", () => {
	// OUT-21
	test("shows the dashed box and its file picker", async () => {
		renderBox();
		const box = await boxOf();
		expect(box.textContent).toContain("Drop files or click to upload");
		expect(box.getAttribute("class")).toContain("border-dashed");
		expect(pickerOf().multiple).toBe(true);
	});

	// OUT-22
	test("a picked file uploads through attachments.upload", async () => {
		const user = userEvent.setup();
		const { server } = renderBox();
		await boxOf();
		await user.upload(pickerOf(), fileOf("notes.txt", "text/plain", 12));
		await screen.findByText("notes.txt");
		// The row paints from the upload in flight, so the call is counted
		// once the server has it.
		await waitFor(() => expect(callsTo(server, "attachments.upload")).toHaveLength(1));
	});

	// OUT-23. Nothing on the box needs a mouse.
	test("Enter on the focused box opens the file picker", async () => {
		const user = userEvent.setup();
		renderBox();
		const box = await boxOf();
		const clicked = mock(() => {});
		pickerOf().click = clicked;
		box.focus();
		expect(document.activeElement).toBe(box);
		await user.keyboard("{Enter}");
		expect(clicked).toHaveBeenCalled();
	});

	// OUT-24. The box sits inside the surface drop target, so a drag over
	// the box must mark one target and not two.
	test("marks itself while a file is over the box", async () => {
		renderWithProviders(
			<DropTarget identifier="CDE-42" onFiles={() => {}}>
				<AttachmentBox ticket="CDE-42" />
			</DropTarget>,
			{ path: "/t/CDE-42", actor: "dana" },
		);
		const box = await boxOf();
		dragFilesOver(box);
		expect(box.getAttribute("data-over")).toBe("true");
		expect(box.textContent).toContain("Drop files or click to upload");
		expect(document.querySelector("[data-drop-overlay]")).toBeNull();
	});
});
