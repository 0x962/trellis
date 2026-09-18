import type { ReactNode } from "react";
import { useBackNavigation } from "../../../hooks/useBackNavigation";
import { useEscapeLayer } from "../../../lib/escapeLayers";

export function NavigationKeys({ children }: { children: ReactNode }) {
	const { back } = useBackNavigation();
	useEscapeLayer("navigation", true, back);
	return <>{children}</>;
}
