import { beforeEach, describe, expect, test } from "bun:test";
import { within } from "@testing-library/react";
import { attachmentOf } from "../../../../../../../attachments";
import { renderWithProviders } from "../../../../../../../renderWithProviders";
import { relativeTime } from "../../../../../../../../src/lib/format";
import { AttachmentRow } from "../../../../../../../../src/features/attachments/AttachmentGrid/components/AttachmentRow/AttachmentRow";

beforeEach(() => localStorage.clear());

const threeDaysAgo = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

const renderRow = (mime: string, filename = "notes.md") => {
	const attachment = attachmentOf({ filename, mime, size: 2048, createdAt: threeDaysAgo() });
	const view = renderWithProviders(<AttachmentRow attachment={attachment} />, { path: "/t/CDE-47", actor: "dana" });
	return { attachment, view };
};

const iconOf = (container: HTMLElement) => container.querySelector("[data-file-icon]")?.getAttribute("data-file-icon");

describe("AttachmentRow", () => {
	// OUT-32. An agent reads the file with curl, so the row carries the
	// contract's own url and not a path the page builds.
	test("shows the icon, the name, the size, the actor, the time, and a download link", () => {
		const { attachment, view } = renderRow("text/markdown");
		const row = view.container.querySelector<HTMLElement>("[data-attachment-row]")!;
		expect(iconOf(view.container)).toBe("document");
		expect(within(row).getByText("notes.md")).toBeDefined();
		expect(within(row).getByText("2.0 KB")).toBeDefined();
		expect(within(row).getByText("dana")).toBeDefined();
		expect(within(row).getByText(relativeTime(attachment.createdAt))).toBeDefined();
		const link = within(row).getByRole("link");
		expect(link.getAttribute("href")).toBe(attachment.url);
		expect(link.getAttribute("download")).toBe("notes.md");
	});

	// OUT-33
	test("picks the type icon from the mime type", () => {
		expect(iconOf(renderRow("text/markdown").view.container)).toBe("document");
		const sheet = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		expect(iconOf(renderRow(sheet, "costs.xlsx").view.container)).toBe("table");
		expect(iconOf(renderRow("application/zip", "logs.zip").view.container)).toBe("archive");
		expect(iconOf(renderRow("application/x-unknown-thing", "blob.bin").view.container)).toBe("file");
	});
});
