import { ArrowSquareOut, X } from "@phosphor-icons/react";
import { IconButton, Sheet, Tooltip } from "@trellis/ui";
import { type ReactElement, type ReactNode, Suspense, useMemo, useRef, useState } from "react";
import { PageSheetContext } from "./pageSheetContext";

export type PageSheetProps = {
	open: boolean;
	onClose: () => void;
	// The accessible name of the sheet: the name of the page it holds.
	title: string;
	// A link to the route of the page. The header draws the "Open full page"
	// button as this link when it is set.
	fullPage?: ReactElement;
	// The width of the panel. The review of a pull request takes "wide", so
	// its sheet covers the ticket sheet under it. Every other page takes the
	// default.
	width?: "page" | "wide";
	children: ReactNode;
};

// A whole page in a sheet over the current page. A person reads a ticket or
// a pull request there and keeps their place on the page under it. The page
// renders the same components as on its route, with these differences:
//
// - `Topbar` renders the title and the actions of the page into the header
//   of this sheet. The header also holds the buttons that open the page on
//   its route and close the sheet, so both buttons stay on screen while the
//   page loads or shows an error.
// - On its route, a loader fetches some queries before the page renders, and
//   the page reads them with `useSuspenseQuery`. No loader runs for a page in
//   a sheet, so such a query can suspend. The `Suspense` boundary keeps that
//   wait inside the sheet.
//
// A page in a sheet can open a second `PageSheet`, as a ticket does for a
// pull request. The second sheet is the wide one, so it covers the first
// one. Escape and a click beside the sheets close only the second sheet.
export function PageSheet({ open, onClose, title, fullPage, width = "page", children }: PageSheetProps) {
	const closeButton = useRef<HTMLButtonElement>(null);
	const [topbar, setTopbar] = useState<HTMLElement | null>(null);
	const value = useMemo(() => ({ topbar, close: onClose }), [topbar, onClose]);
	return (
		<Sheet
			open={open}
			title={title}
			bare
			width={width === "page" ? "var(--page-sheet-width)" : "var(--page-sheet-wide-width)"}
			initialFocus={closeButton}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className="flex h-13 shrink-0 items-center gap-2 px-5 max-md:px-2">
					<div ref={setTopbar} className="flex min-w-0 flex-1 items-center gap-3 max-sm:gap-2" />
					{fullPage && (
						<Tooltip content="Open full page">
							<IconButton label="Open full page" icon={<ArrowSquareOut />} nativeButton={false} render={fullPage} />
						</Tooltip>
					)}
					<Tooltip content="Close">
						<IconButton ref={closeButton} label="Close" icon={<X />} onClick={onClose} />
					</Tooltip>
				</header>
				<PageSheetContext.Provider value={value}>
					<div className="flex min-h-0 flex-1 flex-col">
						<Suspense>{children}</Suspense>
					</div>
				</PageSheetContext.Provider>
			</div>
		</Sheet>
	);
}
