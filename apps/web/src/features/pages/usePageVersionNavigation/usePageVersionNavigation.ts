import { useNavigate } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { opensSheet } from "../../../lib/opensSheet";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { usePageSheet } from "../../shell/PageSheet";

export function usePageVersionNavigation(page: string) {
	const inSheet = usePageSheet() !== null;
	const navigate = useNavigate();
	const openVersion = (version?: number) => {
		if (inSheet) pageSheetActions.openPublishedPage({ ref: page, version });
		else void navigate({ to: "/p/$", params: { _splat: page }, search: { version } });
	};
	const onVersionClick = (event: MouseEvent, version?: number) => {
		if (!inSheet || !opensSheet(event)) return;
		event.preventDefault();
		openVersion(version);
	};
	return { openVersion, onVersionClick };
}
