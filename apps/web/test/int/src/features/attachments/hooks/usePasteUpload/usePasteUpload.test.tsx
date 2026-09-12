import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { usePasteUpload } from "../../../../../../../src/features/attachments/hooks/usePasteUpload/usePasteUpload";
import { uploadErrorText } from "../../../../../../../src/features/attachments/utils/uploadErrorText";
import { fileOf, pasteFiles, pasteText } from "../../../../../../attachments";
import { callsTo, gatedServer } from "../../../../../../inbox";
import { renderWithProviders } from "../../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../../server";

beforeEach(() => localStorage.clear());

// A comment composer: the hook hands it the markdown and it inserts the
// text at the caret, which is the end of the body here.
function Composer({ ticket }: { ticket: string }) {
	const [body, setBody] = useState("");
	const { onPaste, pending, error } = usePasteUpload(ticket, (markdown) => setBody((text) => text + markdown));
	return (
		<>
			<textarea aria-label="Body" value={body} onChange={(event) => setBody(event.target.value)} onPaste={onPaste} />
			<span data-pending={String(pending)}>{error === null ? "" : uploadErrorText("pasted.png", error)}</span>
		</>
	);
}

const renderComposer = (server: TestServer, ticket = "CDE-42") => {
	renderWithProviders(<Composer ticket={ticket} />, { path: `/t/${ticket}`, actor: "dana", server });
	return screen.getByLabelText("Body") as HTMLTextAreaElement;
};

const pendingFlag = () => document.querySelector("[data-pending]")!.getAttribute("data-pending");

const image = () => fileOf("pasted.png", "image/png", 64);

const storedUrl = async (server: TestServer, ticket: string, filename: string) =>
	(await server.client.attachments.list({ ticket })).find((row) => row.filename === filename)!.url;

describe("usePasteUpload", () => {
	// OUT-52
	test("a pasted image uploads and returns the markdown to insert", async () => {
		const server = createTestServer();
		const body = renderComposer(server);
		pasteFiles(body, [image()]);
		await waitFor(() => expect(callsTo(server, "attachments.upload")).toHaveLength(1));
		const url = await storedUrl(server, "CDE-42", "pasted.png");
		await waitFor(() => expect(body.value).toBe(`![pasted.png](${url})`));
	});

	// OUT-53. Without preventDefault the editor keeps the raw paste beside
	// the markdown the hook inserts.
	test("prevents the default paste for an image", () => {
		const body = renderComposer(createTestServer());
		expect(pasteFiles(body, [image()])).toBe(false);
	});

	// OUT-54
	test("leaves a text paste to the editor", async () => {
		const server = createTestServer();
		const body = renderComposer(server);
		expect(pasteText(body, "plain words")).toBe(true);
		await waitFor(() => expect(pendingFlag()).toBe("false"));
		expect(callsTo(server, "attachments.upload")).toHaveLength(0);
		expect(body.value).toBe("");
	});

	// OUT-55
	test("reports the limit when a pasted image is over the cap", async () => {
		const server = createTestServer({ maxUploadBytes: 1024 });
		const body = renderComposer(server);
		pasteFiles(body, [fileOf("pasted.png", "image/png", 2048)]);
		await waitFor(() => expect(document.querySelector("[data-pending]")!.textContent).toContain("MB"));
		expect(body.value).toBe("");
	});

	// OUT-56. The composer shows the wait, so a slow upload never looks
	// like a paste that did nothing.
	test("reports pending while the pasted image uploads", async () => {
		const gate = gatedServer(createTestServer());
		const body = renderComposer(gate.server);
		gate.hold();
		pasteFiles(body, [image()]);
		await waitFor(() => expect(pendingFlag()).toBe("true"));
		gate.release();
		await waitFor(() => expect(pendingFlag()).toBe("false"));
	});
});
