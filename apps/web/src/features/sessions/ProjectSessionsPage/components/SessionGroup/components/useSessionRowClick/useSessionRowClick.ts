import type { AgentRun } from "@trellis/api";
import { useHotkey } from "@trellis/ui";
import { type MouseEvent, useEffect, useRef } from "react";
import { pageSheetActions } from "../../../../../../../stores/pageSheetStore";

export function useSessionRowClick(onSelect: (id: string) => void) {
	const heldKey = useRef<string | null>(null);
	useHotkey("t", (event) => {
		if (!event.isComposing && !event.defaultPrevented) heldKey.current = event.code;
	});
	useEffect(() => {
		const release = () => {
			heldKey.current = null;
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code === heldKey.current) release();
		};
		window.addEventListener("keyup", onKeyUp, true);
		window.addEventListener("blur", release);
		return () => {
			window.removeEventListener("keyup", onKeyUp, true);
			window.removeEventListener("blur", release);
		};
	}, []);
	return (run: Pick<AgentRun, "id" | "ticketIdentifier">, event: MouseEvent<HTMLButtonElement>) => {
		if (heldKey.current !== null && run.ticketIdentifier && !event.metaKey && !event.ctrlKey && !event.altKey) {
			pageSheetActions.openTicket(run.ticketIdentifier);
		} else {
			onSelect(run.id);
		}
	};
}
