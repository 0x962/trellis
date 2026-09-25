import { afterEach, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { pageSheetActions, usePageSheetStore } from "../../../../../../../stores/pageSheetStore";
import { uiActions, useUiStore } from "../../../../../../../stores/uiStore";
import { menuLinkIcons } from "../../../../../../navRows";
import { NavRow } from "./NavRow";

const actionsUrl = "https://github.com/0x962/trellis/actions";
const actionsRowProps = { browserUrl: actionsUrl, label: "Actions", icon: menuLinkIcons.GithubLogo };
afterEach(() => {
	pageSheetActions.closeTicket();
	uiActions.setMobileSidebarOpen(false);
});

test("expanded and phone rows show the saved label and icon", () => {
	const html = renderToStaticMarkup(<NavRow {...actionsRowProps} />);
	expect(html).toContain('type="button"');
	expect(html).toContain('class="sidebar-label">Actions');
	expect(html).toContain(renderToStaticMarkup(menuLinkIcons.GithubLogo));
	expect(html).not.toContain("href=");
});

test("collapsed rows keep an accessible label", () => {
	expect(renderToStaticMarkup(<NavRow {...actionsRowProps} accessibleLabel="Actions" />)).toContain(
		'aria-label="Actions"',
	);
});

test("a click closes the phone menu and opens the browser over the current sheet", () => {
	pageSheetActions.openTicket("TRL-475");
	uiActions.setMobileSidebarOpen(true);
	const row = NavRow(actionsRowProps);
	row.props.onClick();
	expect(useUiStore.getState().mobileSidebarOpen).toBe(false);
	expect(usePageSheetStore.getState().browser).toBe(actionsUrl);
	expect(usePageSheetStore.getState().ticket).toBe("TRL-475");
});
