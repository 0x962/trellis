import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatterPanel, type ChatterPanelProps } from "./ChatterPanel";

const props: ChatterPanelProps = {
	epicName: "Release",
	enabled: true,
	onEnabledChange() {},
	saving: false,
	readOnly: false,
	messages: [],
	loading: false,
	error: null,
	onRetry() {},
	hasEarlier: false,
	loadingEarlier: false,
	onLoadEarlier() {},
};
const first = {
	id: "1",
	senderId: "sender-id",
	senderName: "TRL-1293",
	recipientId: "recipient-id",
	recipientName: "Plan the release",
	text: "First line\nSecond line",
	state: "sent" as const,
	createdAt: new Date(2026, 8, 29, 23, 59).toISOString(),
};
const render = (input: Partial<ChatterPanelProps>) => renderToStaticMarkup(<ChatterPanel {...props} {...input} />);

test("messages retain complete plain text and full participant identities", () => {
	const text = `${"日本語 α line\n".repeat(5000)}<script>alert(1)</script>`;
	const html = render({ messages: [{ ...first, text }] });
	expect(html).toContain(text.replace("<script>", "&lt;script&gt;").replace("</script>", "&lt;/script&gt;"));
	expect(html).not.toContain("<script>");
	expect(html).toContain('title="sender-id"');
	expect(html).toContain('title="recipient-id"');
	expect(html).toContain("TRL-1293");
	expect(html).toContain("Plan the release");
});

test("date labels follow local calendar boundaries and retain the year", () => {
	const second = { ...first, id: "2", createdAt: new Date(2026, 8, 30, 0, 1).toISOString() };
	const third = { ...second, id: "3" };
	const html = render({ messages: [first, second, third] });
	const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
	expect(html.split(day.format(new Date(first.createdAt)))).toHaveLength(2);
	expect(html.split(day.format(new Date(second.createdAt)))).toHaveLength(2);
	expect(html).toContain(`dateTime="${first.createdAt}"`);
	expect(html).toContain(`dateTime="${second.createdAt}"`);
});

test("all delivery states remain explicit while sent stays unobtrusive", () => {
	const states = ["pending", "sent", "queued", "skipped", "unconfirmed"] as const;
	const html = render({ messages: states.map((state) => ({ ...first, id: state, state })) });
	for (const label of ["Sending", "Queued", "Skipped", "Delivery unconfirmed"]) expect(html).toContain(label);
	expect(html).toContain('<span class="sr-only">Sent</span>');
});

test("a failed refresh retains messages and exposes the error and reload action", () => {
	const html = render({ messages: [first], error: "Network unavailable" });
	expect(html).toContain("First line\nSecond line");
	expect(html).toContain("Network unavailable");
	expect(html).toContain("Chatter is unavailable");
	expect(html).toContain('aria-label="Reload Chatter"');
	expect(html).not.toContain("No messages yet");
});

test("empty, loading, disabled, and history states expose their controls", () => {
	expect(render({})).toContain("No messages yet");
	const loading = render({ loading: true, enabled: undefined });
	expect(loading).toContain("Loading settings…");
	expect(loading).toContain("Loading messages…");
	expect(loading).not.toContain("No messages yet");
	for (const input of [{ readOnly: true }, { saving: true }, { enabled: undefined }]) {
		expect(render(input)).toMatch(/role="switch"[^>]*aria-disabled="true"/);
	}
	expect(render({ enabled: false })).toContain("Your messages and system notices still arrive.");
	const earlier = render({ messages: [first], hasEarlier: true, loadingEarlier: true });
	expect(earlier).toContain('aria-label="Load earlier messages"');
	expect(earlier).toContain("Loading earlier messages…");
});
