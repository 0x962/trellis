import { act } from "react";
import { createRoot } from "react-dom/client";
import { PageTabs, type PageTabsProps } from "../../PageTabs";

export async function contextMenuFixture(overrides: Partial<PageTabsProps> = {}) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const selected: string[] = [];
	const closed: string[] = [];
	const renamed: [string, string | null][] = [];
	const pinned: [string, boolean][] = [];
	const moved: [string, string | null][] = [];
	const sorted: string[] = [];
	const grouped: [string, string | null][] = [];
	const created: [string, string][] = [];
	let props: PageTabsProps = {
		tabs: [
			{ id: "active", title: "Active page", pinned: false },
			{ id: "other", title: "Other page", pinned: false },
		],
		activeId: "active",
		onAdd: () => {},
		onSelect: (id) => selected.push(id),
		onClose: (id) => {
			closed.push(id);
			const tabs = props.tabs.filter((tab) => tab.id !== id);
			props = { ...props, tabs, activeId: props.activeId === id ? (tabs[0]?.id ?? "") : props.activeId };
			root.render(<PageTabs {...props} />);
		},
		onRename: (id, title) => renamed.push([id, title]),
		onPin: (id, pin) => {
			pinned.push([id, pin]);
			const tabs = props.tabs.map((tab) => (tab.id === id ? { ...tab, pinned: pin } : tab));
			props = { ...props, tabs: [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)] };
			root.render(<PageTabs {...props} />);
		},
		onMove: (id, before) => moved.push([id, before]),
		onSort: (direction) => sorted.push(direction),
		onSetTabGroup: (id, group) => grouped.push([id, group]),
		onGroupCollapse: () => {},
		onRenameGroup: () => {},
		onRemoveGroup: () => {},
		onCreateGroup: (name, id) => {
			created.push([name, id]);
			props = {
				...props,
				groups: [{ id: "new", name, collapsed: false }],
				tabs: [
					...props.tabs.filter((tab) => tab.id === id).map((tab) => ({ ...tab, groupId: "new" })),
					...props.tabs.filter((tab) => tab.id !== id),
				],
			};
			root.render(<PageTabs {...props} />);
			return "new";
		},
		...overrides,
	};
	await act(async () => root.render(<PageTabs {...props} />));
	await act(async () => {
		for (const region of container.querySelectorAll<HTMLElement>(".overflow-x-auto")) {
			Object.defineProperty(region, "clientWidth", { configurable: true, value: 600 });
			region.getBoundingClientRect = () => new DOMRect(0, 0, 600, 36);
			region.scrollLeft = 0;
			region.dispatchEvent(new Event("scroll", { bubbles: true }));
		}
	});
	const settle = () =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 30));
		});
	const tab = (id: string) => container.querySelector<HTMLElement>(`[data-page-tab-id="${id}"]`)!;
	const menu = () => document.querySelector<HTMLElement>('[role="menu"][aria-label="Tab actions"]')!;
	const item = (label: string) =>
		[...menu().querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) =>
			element.textContent?.startsWith(label),
		)!;
	const key = async (element: Element, value: string, modifiers: KeyboardEventInit = {}) => {
		await act(async () =>
			element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...modifiers })),
		);
		await settle();
	};
	return {
		container,
		selected,
		closed,
		renamed,
		pinned,
		moved,
		sorted,
		grouped,
		created,
		tab,
		menu,
		item,
		key,
		settle,
		async open(id: string) {
			await act(async () =>
				tab(id).dispatchEvent(
					new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 20, clientY: 20 }),
				),
			);
			await settle();
		},
		async choose(label: string) {
			await act(async () => item(label).click());
			await settle();
		},
		async close() {
			await act(async () => root.unmount());
			container.remove();
		},
	};
}
