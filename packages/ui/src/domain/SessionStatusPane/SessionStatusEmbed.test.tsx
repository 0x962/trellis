import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { sessionStatusEmbedContentDocument, sessionStatusEmbedDocument } from "./embedDocument";
import { SessionStatusEmbed } from "./SessionStatusEmbed";

test("blocks external resources inside the interactive content document", () => {
	const document = sessionStatusEmbedContentDocument(
		"Interactive check",
		'<button onclick="document.body.dataset.done=true">Run</button><img src="https://example.com/tracker.png">',
	);
	expect(document).toContain("default-src 'none'");
	expect(document).toContain("connect-src 'none'");
	expect(document).toContain("frame-src 'none'");
	expect(document).toContain("form-action 'none'");
	expect(document).toContain("object-src 'none'");
	expect(document).toContain("navigate-to 'none'");
	expect(document).toContain("script-src 'unsafe-inline'");
	expect(document).toContain("style-src 'unsafe-inline'");
	expect(document).toContain("<button onclick=");
});

test("puts the content behind a trusted frame policy", () => {
	const content = sessionStatusEmbedContentDocument("Hostile check", "<button>Run</button>");
	const document = sessionStatusEmbedDocument("Hostile check", content);
	expect(document).toContain("frame-src about:");
	expect(document.match(/script-src 'unsafe-inline'/g)).toHaveLength(2);
	expect(document).toContain("srcdoc=");
	expect(document).toContain("&lt;button&gt;Run&lt;/button&gt;");
	expect(document).toContain('sandbox="allow-scripts"');
});

test("keeps both frame layers without same-origin access", () => {
	const html = renderToStaticMarkup(<SessionStatusEmbed title="Interactive check" html="<button>Run</button>" />);
	expect(html).toContain('title="Interactive check"');
	expect(html).toContain('sandbox="allow-scripts"');
	expect(html).toContain('referrerPolicy="no-referrer"');
	expect(html).not.toContain("allow-same-origin");
	expect(html).not.toContain("allow-top-navigation");
	expect(html).not.toContain("allow-popups");
	expect(html).not.toContain("allow-forms");
	expect(html).not.toContain("allow-downloads");

	const content = sessionStatusEmbedContentDocument("Interactive check", "<button>Run</button>");
	const wrapper = sessionStatusEmbedDocument("Interactive check", content);
	expect(wrapper).toContain('sandbox="allow-scripts"');
	expect(wrapper).not.toContain("allow-same-origin");
});
