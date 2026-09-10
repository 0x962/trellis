import { defineCommand } from "citty";
import { contextOf } from "../context.ts";

export const webUrl = (ticket: string) => `http://trellis.localhost/t/${ticket.toUpperCase()}`;

// A ticket ref is upper-case in its canonical spelling, so no request is
// needed to build the URL.
export default defineCommand({
	meta: { name: "open", description: "Print or open the web URL of a ticket" },
	args: {
		ticket: { type: "positional", required: true, description: "Ticket ref" },
		browser: { type: "boolean", description: "Open the URL in the browser" },
	},
	run(context) {
		const ctx = contextOf(context);
		const url = webUrl(context.args.ticket);
		ctx.out.write(`${url}\n`);
		if (context.args.browser === true) ctx.deps.open(url);
	},
});
