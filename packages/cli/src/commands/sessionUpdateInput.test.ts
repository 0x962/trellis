import { expect, test } from "bun:test";
import type { CliContext } from "../context.ts";
import { sessionUpdateInput } from "./sessionUpdateInput.ts";

const context = (stdin: string): CliContext => ({ deps: { stdin: () => Promise.resolve(stdin) } }) as CliContext;

test("reads Markdown from standard input and HTML from each embed file", async () => {
	const paths: string[] = [];
	const input = await sessionUpdateInput(
		context("The agent update."),
		{
			session: "session-id",
			requestId: "325611c8-b879-4eb7-9470-43eb4efc6d91",
			body: "-",
			embed: "report.html,details.html",
		},
		(path) => {
			paths.push(path);
			return new File([`<p>${path}</p>`], path);
		},
	);

	expect(input).toEqual({
		sessionId: "session-id",
		requestId: "325611c8-b879-4eb7-9470-43eb4efc6d91",
		body: "The agent update.",
		embeds: [
			{ title: "report.html", html: "<p>report.html</p>" },
			{ title: "details.html", html: "<p>details.html</p>" },
		],
	});
	expect(paths).toEqual(["report.html", "details.html"]);
});
