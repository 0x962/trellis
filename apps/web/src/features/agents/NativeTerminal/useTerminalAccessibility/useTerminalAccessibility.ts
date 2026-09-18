import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../../../lib/desktopBridge";

export function useTerminalAccessibility() {
	// Browsers do not expose screen reader detection. Electron reports the OS accessibility state through its preload bridge.
	const [enabled, setEnabled] = useState(true);
	useEffect(() => {
		const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
		return desktop?.onAccessibilitySupportChanged?.(setEnabled);
	}, []);
	return enabled;
}
