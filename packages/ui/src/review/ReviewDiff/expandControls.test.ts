import { expect, test } from "bun:test";
import { expandControls } from "./expandControls";

test("diff expansion controls have a name and respond to keyboard activation", () => {
	const host = document.createElement("div");
	const shadow = host.attachShadow({ mode: "open" });
	const control = document.createElement("div");
	control.setAttribute("role", "button");
	control.setAttribute("data-expand-button", "");
	control.setAttribute("data-expand-up", "");
	shadow.append(control);
	let clicks = 0;
	control.addEventListener("click", () => clicks++);
	expandControls(host);
	expandControls(host);
	expect(control.getAttribute("aria-label")).toBe("Expand unchanged lines above");
	expect(control.tabIndex).toBe(0);
	for (const key of ["Enter", " ", "ArrowDown"])
		control.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
	control.dispatchEvent(new KeyboardEvent("keydown", { key: "Space", code: "Space", bubbles: true, cancelable: true }));
	expect(clicks).toBe(3);
});
