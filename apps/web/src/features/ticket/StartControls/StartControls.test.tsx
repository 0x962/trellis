import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { StartControls } from "./StartControls";

// Before a click on `Start`, the component reads only the query client from
// the app context. The test gives that one field.
const app = { queryClient: new QueryClient() } as AppContext;

// The chain of OP-33 in section 2, screen 6 of
// docs/research/trellis-for-one-human-and-many-agents.md.
const op32: TicketSummary["waitsOn"][number] = {
	identifier: "OP-32",
	title: "Service: A routine run opens a chat and queues the turn",
	status: "review",
};

const op52: TicketSummary["waitsOn"][number] = {
	identifier: "OP-52",
	title: "Service: A missed window runs late",
	status: "started",
};

const render = (waitsOn: TicketSummary["waitsOn"]) =>
	renderToStaticMarkup(
		<QueryClientProvider client={app.queryClient}>
			<AppProvider value={app}>
				<StartControls ticket="OP-33" waitsOn={waitsOn} />
			</AppProvider>
		</QueryClientProvider>,
	);

// `Start` is the last button in the row. This slice holds the `<button` tag
// of `Start` and stops at its closing angle bracket, so an attribute of a
// later element never reaches an assertion.
const startButtonTag = (html: string) => {
	const open = html.lastIndexOf("<button", html.indexOf("Start</"));
	return html.slice(open, html.indexOf(">", open) + 1);
};

describe("StartControls", () => {
	test("prints the harness picker, the model picker and the effort picker with one Start", () => {
		const html = render([]);

		expect(html).toContain("Start with");
		expect(html).toContain('aria-label="Harness"');
		expect(html).toContain('aria-label="Model"');
		expect(html).toContain('aria-label="Effort"');
		expect(html.split("Start</").length - 1).toBe(1);
	});

	test("keeps Start live while another ticket holds the work back", () => {
		const html = render([op32, op52]);

		expect(startButtonTag(html)).not.toContain("disabled");
	});

	test("names each ticket that holds the work back by identifier and title", () => {
		const html = render([op32, op52]);

		expect(html).toContain("OP-32");
		expect(html).toContain("Service: A routine run opens a chat and queues the turn");
		expect(html).toContain("is not merged");
		expect(html).toContain("OP-52");
		expect(html).toContain("Service: A missed window runs late");
		expect(html).toContain("Start anyway?");
	});

	test("prints no line when nothing holds the work back", () => {
		const html = render([]);

		expect(html).not.toContain("Start anyway?");
	});
});
