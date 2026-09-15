export function hasMacDesktopChrome(bridge: { platform?: string } | undefined): boolean {
	return bridge?.platform === "darwin";
}
