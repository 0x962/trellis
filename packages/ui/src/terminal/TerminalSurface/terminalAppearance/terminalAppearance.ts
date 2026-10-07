import type { TerminalAppearance } from "../terminalRuntime";

export function terminalAppearance(host: HTMLElement): TerminalAppearance {
	const styles = getComputedStyle(host.parentElement!);
	return {
		fontFamily: styles.fontFamily,
		fontSize: Number.parseFloat(styles.fontSize),
		background: styles.backgroundColor,
		foreground: styles.color,
	};
}
