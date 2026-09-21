import { useCallback } from "react";
import { uiActions, useUiStore } from "../../../../stores/uiStore";

const none: readonly string[] = [];

// A route stores only the done or canceled tickets that a person opens.
// Every other done or canceled ticket stays collapsed by default.
export const useExpandedTickets = (routeKey: string) => {
	const expanded = useUiStore((state) => state.expandedTickets[routeKey]) ?? none;
	const toggle = useCallback((ticketId: string) => uiActions.toggleTicketExpanded(routeKey, ticketId), [routeKey]);
	return { expanded, toggle };
};
