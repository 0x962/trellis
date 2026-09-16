import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalSurface } from "./TerminalSurface";

test("both terminal layouts show why runtime input is unavailable", () => {
	for (const layout of ["panel", "fill"] as const) {
		const html = renderToStaticMarkup(
			<TerminalSurface
				layout={layout}
				label="Terminal input"
				connected={false}
				unavailableReason="Terminal input is unavailable. Process inspection timed out."
				follow={async () => {}}
				send={async () => {}}
				resize={async () => {}}
				onLeave={() => {}}
			/>,
		);
		expect(html).toContain('role="alert" class="terminal-error"');
		expect(html).toContain("Terminal input is unavailable. Process inspection timed out.");
	}
});
