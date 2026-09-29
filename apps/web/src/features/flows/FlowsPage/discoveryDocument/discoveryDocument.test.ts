import { expect, test } from "bun:test";
import { pendingDocumentV1Example, publishedDocumentV1Example } from "@trellis/api";
import { discoveryDocument } from "./discoveryDocument";

test("an older publication does not permit a new run", () => {
	const entry = discoveryDocument(pendingDocumentV1Example);
	expect(entry.document.lastExecutablePublication?.revision).toBe(1);
	expect(entry.document.revision).toBe(2);
	expect(entry.capabilities.start.state).toBe("blocked");
});

test("a published document does not invent conversion or live engine capability", () => {
	const entry = discoveryDocument(publishedDocumentV1Example);
	expect(entry.compatibility.state).toBe("unknown");
	expect(entry.capabilities.convert.state).toBe("unknown");
	expect(entry.capabilities.start.state).toBe("unknown");
});
