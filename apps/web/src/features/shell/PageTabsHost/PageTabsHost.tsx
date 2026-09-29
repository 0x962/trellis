import { useRouter, useRouterState } from "@tanstack/react-router";
import { type PageTabItem, PageTabs } from "@trellis/ui";
import { useCallback, useEffect, useMemo } from "react";
import {
	pageTabsActions,
	pageTabsSelectors,
	pageTabsUiProjection,
	usePageTabsStore,
} from "../../../stores/pageTabsStore";
import { pageTabTitle } from "./pageTabTitle";

const activeTab = () => {
	const state = usePageTabsStore.getState();
	return state.tabs.find((tab) => tab.id === state.activeId)!;
};

const pageTabHasVisibleFocus = () =>
	document.activeElement instanceof HTMLElement &&
	document.activeElement.matches('[data-page-tab-id]:focus-visible, button[aria-label^="Close "]:focus-visible');

const focusPageTab = (id: string) => {
	const tab = Array.from(document.querySelectorAll<HTMLElement>("[data-page-tab-id]")).find(
		(element) => element.dataset.pageTabId === id,
	);
	tab?.focus();
};

export function PageTabsHost() {
	const router = useRouter();
	const resolvedHref = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).href });
	const tabs = usePageTabsStore(pageTabsSelectors.tabs);
	const activeId = usePageTabsStore(pageTabsSelectors.activeId);
	const ui = useMemo<{ tabs: readonly PageTabItem[]; activeId: string }>(
		() => pageTabsUiProjection(tabs, activeId),
		[tabs, activeId],
	);

	const showActiveTab = useCallback(
		(restoreFocus = false) => {
			const tab = activeTab();
			void router.navigate({ href: tab.url, replace: true }).then(() => {
				if (restoreFocus) requestAnimationFrame(() => focusPageTab(tab.id));
			});
		},
		[router],
	);
	const add = useCallback(() => {
		pageTabsActions.addTab({ url: "/needs-you", title: "Needs you" });
		showActiveTab();
	}, [showActiveTab]);
	const select = useCallback(
		(id: string) => {
			if (id === usePageTabsStore.getState().activeId) return;
			const restoreFocus = pageTabHasVisibleFocus();
			pageTabsActions.selectTab(id);
			showActiveTab(restoreFocus);
		},
		[showActiveTab],
	);
	const close = useCallback(
		(id: string) => {
			const priorActiveId = usePageTabsStore.getState().activeId;
			const restoreFocus = pageTabHasVisibleFocus();
			pageTabsActions.closeTab(id);
			if (id === priorActiveId) showActiveTab(restoreFocus);
		},
		[showActiveTab],
	);

	useEffect(() => {
		const saveTitle = () => {
			if (activeTab().url === resolvedHref) pageTabsActions.setTitle(pageTabTitle(document.title));
		};
		saveTitle();
		const observer = new MutationObserver(saveTitle);
		observer.observe(document.head, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	}, [resolvedHref]);

	return <PageTabs tabs={ui.tabs} activeId={ui.activeId} onAdd={add} onSelect={select} onClose={close} />;
}
