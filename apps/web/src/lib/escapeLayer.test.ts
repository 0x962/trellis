import { expect, test } from "bun:test";
import { type EscapeLayer, escapeLayerFor } from "./hotkeys";

test("a prevented Escape reaches no layer", () => {
	expect(escapeLayerFor({ key: "Escape", defaultPrevented: true }, new Set<EscapeLayer>(["ticket"]))).toBeNull();
});

test("Escape chooses one open layer in control order", () => {
	const layers = new Set<EscapeLayer>(["ticket", "selection", "popover"]);
	expect(escapeLayerFor({ key: "Escape", defaultPrevented: false }, layers)).toBe("popover");
	layers.delete("popover");
	expect(escapeLayerFor({ key: "Escape", defaultPrevented: false }, layers)).toBe("selection");
	layers.delete("selection");
	expect(escapeLayerFor({ key: "Escape", defaultPrevented: false }, layers)).toBe("ticket");
});
