export function expandControls(host: HTMLElement) {
	for (const control of host.shadowRoot!.querySelectorAll<HTMLElement>("[data-expand-button]")) {
		const direction = control.hasAttribute("data-expand-up")
			? "above"
			: control.hasAttribute("data-expand-down")
				? "below"
				: "between changes";
		const label = `Expand unchanged lines ${direction}`;
		control.setAttribute("aria-label", label);
		control.title = label;
		control.tabIndex = 0;
		control.onkeydown = (event) => {
			if (event.key !== "Enter" && event.key !== " " && event.code !== "Space") return;
			event.preventDefault();
			event.stopPropagation();
			control.click();
		};
	}
}
