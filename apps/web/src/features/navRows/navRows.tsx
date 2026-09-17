import {
	ArrowsClockwise,
	ChartLine,
	FlowArrow,
	GitPullRequest,
	MagnifyingGlass,
	Sparkle,
	Ticket,
	Tray,
} from "@phosphor-icons/react";
import type { ReactElement } from "react";

export type NavTarget =
	| "/needs-you"
	| "/search"
	| "/all"
	| "/reviews"
	| "/ai/personas"
	| "/ai/flows"
	| "/loops"
	| "/usage";

export type NavRow = { to: NavTarget; label: string; icon: ReactElement };

// The eight fixed destinations. The static shell sidebar paints them before
// route data arrives, and the loaded sidebar paints them after, so both
// read this list and the fallback never shows a different icon.
export const navRows: readonly NavRow[] = [
	{ to: "/needs-you", label: "Needs you", icon: <Tray /> },
	{ to: "/search", label: "Search", icon: <MagnifyingGlass /> },
	{ to: "/all", label: "All tickets", icon: <Ticket /> },
	{ to: "/reviews", label: "Pull requests", icon: <GitPullRequest /> },
	{ to: "/ai/personas", label: "Personas", icon: <Sparkle /> },
	{ to: "/ai/flows", label: "Flows", icon: <FlowArrow /> },
	{ to: "/loops", label: "Loops", icon: <ArrowsClockwise /> },
	{ to: "/usage", label: "Usage", icon: <ChartLine /> },
];
