import { ArrowSquareOut, X } from "@phosphor-icons/react";
import { IconButton, Sheet, Tooltip } from "@trellis/ui";
import { type ReactElement, type ReactNode, Suspense, useContext, useMemo, useRef, useState } from "react";
import { PageSheetContext } from "./pageSheetContext";
import { pageSheetBaseWidth, pageSheetStackWidth, pageSheetStripTarget } from "./pageSheetStack";

export type PageSheetProps = {
	open: boolean;
	onClose: () => void;
	// The accessible name of the sheet: the name of the page it holds.
	title: string;
	// A link to the route of the page. The header draws the "Open full page"
	// button as this link when it is set.
	fullPage?: ReactElement;
	// The width of the panel. The review of a pull request takes "wide" so
	// the file tree and the diff both fit. Every other page takes the default.
	width?: "page" | "wide";
	// The action that returns to this sheet when a person clicks its visible
	// strip under sheets above it.
	onReturn?: () => void;
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
// pull request. Each nested sheet loses one 48 px step from the first sheet
// width, so the left edge of the sheets below it stays visible. Escape closes
// the top sheet only. A click on a visible edge returns to that sheet.
export function PageSheet({ open, onClose, onReturn, title, fullPage, width = "page", children }: PageSheetProps) {
	const parent = useContext(PageSheetContext);
	const closeButton = useRef<HTMLButtonElement>(null);
	const [topbar, setTopbar] = useState<HTMLElement | null>(null);
	const [panel, setPanel] = useState<HTMLDivElement | null>(null);
	const depth = parent === null ? 0 : parent.depth + 1;
	const rootWidth = parent?.rootWidth ?? pageSheetBaseWidth(width);
	const sheetWidth = pageSheetStackWidth(rootWidth, depth);
	const stack = useMemo(
		() => [...(parent?.stack ?? []), { depth, panel, returnTo: onReturn ?? onClose }],
		[parent?.stack, depth, panel, onReturn, onClose],
	);
	const value = useMemo(
		() => ({ topbar, close: onClose, depth, rootWidth, stack }),
		[topbar, onClose, depth, rootWidth, stack],
	);
	return (
		<Sheet
			open={open}
			title={title}
			bare
			width={sheetWidth}
			popupRef={setPanel}
			className="overflow-hidden rounded-l-xl shadow-page-sheet max-md:rounded-none"
			backdropClassName={depth === 0 ? undefined : "bg-fg/10"}
			initialFocus={closeButton}
			onBackdropPointerDown={(event) => {
				const target = pageSheetStripTarget(stack, event.clientX);
				if (target !== null && target.depth < depth) target.returnTo();
			}}
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
