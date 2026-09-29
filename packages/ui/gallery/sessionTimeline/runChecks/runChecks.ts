import { flushSync } from "react-dom";

export function runChecks(add: () => void) {
	const checks: string[] = [];
	const assert = (condition: boolean, name: string) => {
		if (!condition) throw new Error(name);
		checks.push(name);
	};
	const tree = document.querySelector<HTMLElement>('[role="tree"]')!;
	const row = (id: string) => tree.querySelector<HTMLElement>(`[data-update-id="${id}"]`)!;
	const key = (value: string) =>
		flushSync(() =>
			document.activeElement!.dispatchEvent(
				new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
			),
		);
	flushSync(() => row("update-1").click());
	assert(row("update-1").getAttribute("aria-selected") === "true", "Row selection");
	key("ArrowDown");
	assert(document.activeElement === row("update-2"), "Down moves focus");
	assert(row("update-1").getAttribute("aria-selected") === "true", "Focus does not select");
	key(" ");
	assert(row("update-2").getAttribute("aria-selected") === "true", "Space selects");
	key("ArrowLeft");
	const day = document.activeElement!;
	assert(day.getAttribute("aria-expanded") === "true", "Left reaches parent day");
	assert(day.querySelector(':scope > [role="group"]') !== null, "Day owns its group");
	key("ArrowLeft");
	assert(day.getAttribute("aria-expanded") === "false", "Left folds day");
	key("ArrowRight");
	key("ArrowRight");
	assert(document.activeElement === row("update-0"), "Right opens day and enters first update");
	key("End");
	assert(document.activeElement === row("update-11"), "End reaches last update");
	key("Home");
	assert(document.activeElement === tree.firstElementChild, "Home reaches first day");
	flushSync(() => row("update-0").click());
	const viewport = tree.closest<HTMLElement>(".overflow-auto")!;
	assert(
		viewport.scrollHeight > viewport.clientHeight && viewport.clientHeight <= 520,
		"Long content stays in the scroll pane",
	);
	const selectedHead = row("update-0").querySelector("[data-row-head]")!;
	assert(
		selectedHead.getBoundingClientRect().top >= document.querySelector(".sticky")!.getBoundingClientRect().bottom,
		"Keyboard target clears the sticky header",
	);
	viewport.scrollTop = 180;
	const oldTop = row("update-0").getBoundingClientRect().top;
	const oldFocus = document.activeElement;
	add();
	assert(row("update-0").getAttribute("aria-selected") === "true", "Arrival preserves selection");
	assert(document.activeElement === oldFocus, "Arrival preserves focus");
	assert(Math.abs(row("update-0").getBoundingClientRect().top - oldTop) < 1, "Arrival preserves visible scroll anchor");
	assert(
		document.querySelector('[role="status"]')?.textContent?.includes("new update") === true,
		"Arrival announces update",
	);
	assert(tree.querySelectorAll('[tabindex="0"]').length === 1, "One tree tab stop");
	const target = row("update-0").querySelector("[data-row-head] > span")!.getBoundingClientRect();
	assert(target.width >= (innerWidth < 768 ? 44 : 28) && target.height >= 44, "Dot hit target");
	assert(tree.scrollWidth <= tree.clientWidth, "Tree fits its width");
	assert(tree.querySelector('iframe[sandbox="allow-scripts"]') !== null, "Selected update keeps its isolated embed");
	return checks;
}
