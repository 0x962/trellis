import type { ReactNode } from "react";
import "./desktopChrome.css";

export function DesktopChrome({ enabled, children }: { enabled: boolean; children: ReactNode }) {
	if (!enabled) return children;
	return (
		<div data-desktop-chrome="mac" className="flex h-full min-h-0 flex-col bg-bg text-fg">
			<div data-desktop-content="" className="min-h-0 flex-1">
				{children}
			</div>
		</div>
	);
}
