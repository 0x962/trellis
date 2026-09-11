import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { dropFiles, fileOf, surfaceOf } from "../../../../test/attachments";
import { gatedServer } from "../../../../test/inbox";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { AttachmentGrid } from "../AttachmentGrid";
import type { Upload } from "../hooks/useUploads";
import { UploadProgress } from "./UploadProgress";

beforeEach(() => localStorage.clear());

const running: Upload = { id: "u1", name: "notes.txt", size: 100, sent: 40, percent: 40, error: null };

const refused: Upload = {
	id: "u2",
	name: "screenshot.png",
	size: 2 * 1024 * 1024,
	sent: 0,
	percent: 0,
	error: { code: "PAYLOAD_TOO_LARGE", maxBytes: 1024 * 1024 },
};

describe("UploadProgress", () => {
	// OUT-25. A determinate bar states how much is left; a spinner does not.
	test("shows a determinate bar with the sent percentage", () => {
		renderWithProviders(<UploadProgress upload={running} onDismiss={() => {}} />, {
			path: "/t/CDE-42",
			actor: "navid",
		});
		const bar = screen.getByRole("progressbar");
		expect(bar.getAttribute("aria-valuemin")).toBe("0");
		expect(bar.getAttribute("aria-valuemax")).toBe("100");
		expect(bar.getAttribute("aria-valuenow")).toBe("40");
		expect(screen.getByText("notes.txt")).toBeDefined();
	});

	// OUT-26. The bar and the server row are the same file, so the grid
	// must swap one for the other and never show both.
	test("drops the bar when the upload settles and leaves one row", async () => {
		const gate = gatedServer(createTestServer());
		renderWithProviders(<AttachmentGrid ticket="CDE-42" />, { path: "/t/CDE-42", actor: "navid", server: gate.server });
		const surface = await surfaceOf();
		gate.hold();
		dropFiles(surface, [fileOf("notes.txt", "text/plain", 2048)]);
		await screen.findByRole("progressbar");
		gate.release();
		await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
		expect(screen.getAllByText("notes.txt")).toHaveLength(1);
	});

	// OUT-27
	test("replaces the bar with the inline error of a failed upload", () => {
		renderWithProviders(<UploadProgress upload={refused} onDismiss={() => {}} />, {
			path: "/t/CDE-42",
			actor: "navid",
		});
		expect(screen.queryByRole("progressbar")).toBeNull();
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("screenshot.png");
		expect(alert.textContent).toContain("1 MB");
	});
});
