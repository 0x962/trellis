import { useHotkey } from "@trellis/ui";

export function usePageCreate(onCreate: () => void, enabled = true) {
	useHotkey("c", (event) => {
		if (!enabled || event.defaultPrevented || event.repeat || event.isComposing) return;
		if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
		if (event.target instanceof HTMLElement && event.target.closest(".terminal-surface")) return;
		event.preventDefault();
		onCreate();
	});
}
