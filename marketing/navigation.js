import { motionPreference, panelAnimations } from "./motionPreference.js";

const tabGroups = [...document.querySelectorAll('[role="tablist"]')];
function selectTab(tab, focus = false) {
	const group = tab.closest('[role="tablist"]');
	group.querySelectorAll('[role="tab"]').forEach((item) => {
		const selected = item === tab;
		item.setAttribute("aria-selected", String(selected));
		item.tabIndex = selected ? 0 : -1;
		document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
	});
	if (!motionPreference.matches) {
		const panel = document.getElementById(tab.getAttribute("aria-controls"));
		panelAnimations.get(panel)?.stop();
		panelAnimations.set(
			panel,
			Motion.animate(panel, { opacity: [0, 1], y: [5, 0] }, { duration: 0.18, ease: "easeOut" }),
		);
	}
	if (focus) tab.focus();
}
tabGroups.forEach((group) => {
	const tabs = [...group.querySelectorAll('[role="tab"]')];
	tabs.forEach((tab, index) => {
		tab.addEventListener("click", () => selectTab(tab));
		tab.addEventListener("keydown", (event) => {
			const next = {
				ArrowRight: (index + 1) % tabs.length,
				ArrowLeft: (index + tabs.length - 1) % tabs.length,
				Home: 0,
				End: tabs.length - 1,
			}[event.key];
			if (next === undefined) return;
			event.preventDefault();
			selectTab(tabs[next], true);
		});
	});
});
function showFinding() {
	selectTab(document.querySelector("#tab-finding"));
	document.querySelector("#panel-finding").focus({ preventScroll: true });
}
document.querySelectorAll('a[href="#finding"]').forEach((link) => {
	link.addEventListener("click", showFinding);
});
window.addEventListener("hashchange", () => {
	if (location.hash === "#finding") showFinding();
});
if (location.hash === "#finding") showFinding();
document.querySelectorAll("[data-jump]").forEach((button) => {
	button.addEventListener("click", () => selectTab(document.querySelector("#tab-" + button.dataset.jump), true));
});
const menu = document.querySelector(".menu");
const navigation = document.querySelector("#navigation");
function closeMenu() {
	navigation.classList.remove("open");
	menu.setAttribute("aria-expanded", "false");
}
menu.addEventListener("click", () => {
	const expanded = menu.getAttribute("aria-expanded") !== "true";
	menu.setAttribute("aria-expanded", String(expanded));
	navigation.classList.toggle("open", expanded);
});
navigation.querySelectorAll("a").forEach((link) => {
	link.addEventListener("click", closeMenu);
});
document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape" || !navigation.classList.contains("open")) return;
	closeMenu();
	menu.focus();
});
const ticketData = {
	12: {
		title: "Add the email endpoint",
		description: "Save a valid address and reject an empty value. Keep the existing account access checks.",
		wave: "Foundation",
		status: "Review",
		dependency: "Releases ACM-13",
		session: true,
	},
	13: {
		title: "Build the email form",
		description: "Add an email field, validation, and a saved state to account settings.",
		wave: "Interface",
		status: "Todo",
		dependency: "Needs ACM-12",
		session: false,
	},
	14: {
		title: "Update the confirmation email",
		description: "Reflect the new address in the account confirmation email.",
		wave: "Interface",
		status: "In progress",
		dependency: "No dependency",
		session: false,
	},
	15: {
		title: "Verify the account flow",
		description: "Check the complete path from an email change to its confirmation.",
		wave: "Verification",
		status: "Review",
		dependency: "Needs ACM-13 and ACM-14",
		session: false,
	},
};
const dialog = document.querySelector("#ticket-dialog");
let ticketOpener;
document.querySelectorAll("[data-ticket]").forEach((button) => {
	button.addEventListener("click", () => {
		ticketOpener = button;
		const data = ticketData[button.dataset.ticket];
		document.querySelector("#dialog-id").textContent = "ACM-" + button.dataset.ticket;
		document.querySelector("#dialog-title").textContent = data.title;
		document.querySelector("#dialog-description").textContent = data.description;
		document.querySelector("#dialog-meta").innerHTML =
			`<dt>Wave</dt><dd>${data.wave}</dd><dt>Status</dt><dd>${data.status}</dd><dt>Dependency</dt><dd>${data.dependency}</dd>`;
		document.querySelector("#dialog-session").hidden = !data.session;
		dialog.showModal();
	});
});
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => ticketOpener.focus());
document.querySelector("#dialog-session").addEventListener("click", () => {
	dialog.close();
	selectTab(document.querySelector("#tab-session"), true);
});
