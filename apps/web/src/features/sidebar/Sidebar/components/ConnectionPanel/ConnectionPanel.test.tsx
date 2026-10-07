import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { LiveStatus } from "../../../../../lib/live";
import { ConnectionPanel } from "./ConnectionPanel";

const states: Array<{ status: LiveStatus; label: string; detail: string }> = [
	{ status: "connecting", label: "Connecting", detail: "Reaching the server." },
	{ status: "reconnecting", label: "Reconnecting", detail: "The connection dropped." },
	{ status: "restarting", label: "Restarting", detail: "The server is coming back." },
	{ status: "down", label: "Server offline", detail: "Nothing answers on the server." },
];

test("hides the connection panel while the server is live", () => {
	expect(renderToStaticMarkup(<ConnectionPanel status="live" />)).toBe("");
});

test.each(states)("shows $label in the expanded sidebar", ({ status, label, detail }) => {
	const html = renderToStaticMarkup(<ConnectionPanel status={status} />);
	expect(html).toContain(label);
	expect(html).toContain(detail);
});

test.each(states)("names $label in the collapsed sidebar", ({ status, label, detail }) => {
	const html = renderToStaticMarkup(<ConnectionPanel status={status} collapsed />);
	expect(html).toContain(`aria-label="Server connection: ${label}. ${detail}"`);
	expect(html).toContain('type="button"');
	expect(html).not.toContain('class="block text-sm text-fg"');
});
