import { useNavigate } from "@tanstack/react-router";
import { Sheet, useHotkey, useMediaQuery } from "@trellis/ui";
import { useEffect, useState } from "react";
import { TicketView } from "../TicketView";
import { ResizeHandle } from "./components/ResizeHandle";
import { useDetailRemoved } from "./hooks/useDetailRemoved";
import { usePeek } from "./hooks/usePeek";
import { usePeekNavigation } from "./hooks/usePeekNavigation";
import { usePeekList } from "./providers/PeekListProvider";

// The stored peek width, in px.
export const peekWidthStorageKey = "trellis.peek-width";
export const defaultPeekWidth = 720;

const readWidth = () => Number(localStorage.getItem(peekWidthStorageKey) ?? defaultPeekWidth);

// The side peek: a non-modal sheet over the list, opened by the `peek`
// search param. j and k walk the list, o opens the full page, Escape
// closes. The width is dragged and remembered; under 1100 px the peek
// fills the window. A delete of the shown ticket closes it.
export function TicketPeek() {
	const peek = usePeek();
	const rows = usePeekList();
	const navigate = useNavigate();
	const narrow = useMediaQuery("(max-width: 1099px)");
	const [width, setWidth] = useState(readWidth);
	// The last identifier shown, so the sheet keeps its content while it
	// slides out.
	const [shown, setShown] = useState(peek.current);
	const current = peek.current;
	useEffect(() => {
		if (current !== undefined) setShown(current);
	}, [current]);

	usePeekNavigation({ rows, current: current ?? "", onStep: peek.step });
	useDetailRemoved(current, peek.close);
	useHotkey(
		"o",
		(event) => {
			if (current === undefined) return;
			event.preventDefault();
			void navigate({ to: "/t/$identifier", params: { identifier: current } });
		},
		{ allowInInput: true },
	);

	const commit = (next: number) => {
		setWidth(next);
		localStorage.setItem(peekWidthStorageKey, String(next));
	};

	if (shown === undefined) return null;
	return (
		<Sheet
			open={current !== undefined}
			onOpenChange={(open) => {
				if (!open) peek.close();
			}}
			title={shown}
			modal={false}
			bare
			width={narrow ? "100%" : width}
			initialFocus={() => document.querySelector<HTMLElement>('[role="dialog"] [data-peek-focus]')}
			resizeHandle={narrow ? undefined : <ResizeHandle width={width} onResize={setWidth} onCommit={commit} />}
		>
			<TicketView identifier={shown} variant="peek" />
		</Sheet>
	);
}
