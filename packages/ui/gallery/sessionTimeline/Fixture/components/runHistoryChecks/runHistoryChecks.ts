import { flushSync } from "react-dom";

export function runHistoryChecks(setup: () => void, emptyFailure: () => void, add: () => void) {
	const checks: string[] = [];
	const assert = (condition: boolean, name: string) => {
		if (!condition) throw new Error(name);
		checks.push(name);
	};
	flushSync(setup);
	const tree = document.querySelector<HTMLElement>('[role="tree"]')!;
	const key = (value: string) =>
		flushSync(() =>
			document.activeElement!.dispatchEvent(
				new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
			),
		);
	const selected = tree.querySelector<HTMLElement>('[aria-selected="true"]')!;
	selected.focus();
	assert(tree.querySelectorAll("[data-update-id]").length < 100, "A thousand updates mount a small row window");
	key("End");
	assert(
		(document.activeElement as HTMLElement).dataset.updateId === "history-999",
		"End mounts and focuses the last retained update",
	);
	assert(selected.isConnected, "The selected update stays mounted outside the viewport");
	assert(tree.querySelectorAll("[data-update-id]").length < 100, "Far focus keeps a small row window");
	key(" ");
	const target = document.activeElement as HTMLElement;
	assert(target.getAttribute("aria-selected") === "true", "A distant update can be selected");
	const oldTop = target.getBoundingClientRect().top;
	add();
	assert(
		document.activeElement === target && target.getAttribute("aria-selected") === "true",
		"Arrival preserves distant selection and focus",
	);
	assert(Math.abs(target.getBoundingClientRect().top - oldTop) < 1, "Arrival preserves the distant scroll anchor");
	key("ArrowLeft");
	key("ArrowLeft");
	assert(document.activeElement!.getAttribute("aria-expanded") === "false", "A distant day folds");
	key("Home");
	assert(document.activeElement!.getAttribute("aria-posinset") === "1", "Home returns to the first day");
	flushSync(() => document.querySelector<HTMLButtonElement>('[aria-label="Go to latest update"]')!.click());
	assert(
		tree.querySelector('[aria-selected="true"]')!.getAttribute("data-update-id")!.startsWith("new-"),
		"Latest selects the new arrival",
	);
	flushSync(emptyFailure);
	const retry = document.querySelector<HTMLButtonElement>('[aria-label="Retry history"]');
	assert(retry !== null, "Empty cached history exposes retry after a failure");
	flushSync(() => retry!.click());
	assert(document.querySelector('[aria-label="Retry history"]') === null, "Retry clears the simulated history failure");
	return checks;
}
