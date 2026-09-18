import { useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const useReviewNavigation = (syncHash: boolean) => {
	const hash = useLocation({ select: (location) => location.hash });
	const navigate = useNavigate();
	const [sheetTab, setSheetTab] = useState("changes");
	const routeTab = hash.split("?")[0] ?? "";
	const tab = syncHash
		? ["changes", "discussion", "checks", "live"].includes(routeTab)
			? routeTab
			: "changes"
		: sheetTab;
	const activeThread = syncHash ? new URLSearchParams(hash.split("?")[1]).get("thread") : null;
	const changeTab = (value: string) => {
		if (syncHash) {
			void navigate({ hash: value === "changes" ? "" : value, search: true, resetScroll: false });
		} else {
			setSheetTab(value);
		}
	};
	return { tab, activeThread, changeTab };
};
