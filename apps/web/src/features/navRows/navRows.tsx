import { ArrowsClockwise, ChartLine, FlowArrow, MagnifyingGlass, Tray } from "@phosphor-icons/react";
import type { ReactElement } from "react";

export type NavTarget = "/needs-you" | "/search" | "/ai/flows" | "/loops" | "/usage";

export type NavRow = { to: NavTarget; label: string; icon: ReactElement };

// The fixed destinations. The static shell sidebar paints them before
// route data arrives, and the loaded sidebar paints them after, so both
// read this list and the fallback never shows a different icon.
export const navRows: readonly NavRow[] = [
	{ to: "/needs-you", label: "Needs you", icon: <Tray /> },
	{ to: "/search", label: "Search", icon: <MagnifyingGlass /> },
	{ to: "/ai/flows", label: "Flows", icon: <FlowArrow /> },
	{ to: "/loops", label: "Loops", icon: <ArrowsClockwise /> },
	{ to: "/usage", label: "Usage", icon: <ChartLine /> },
];
