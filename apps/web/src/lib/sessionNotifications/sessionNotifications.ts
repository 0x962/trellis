import { createAgentNotifications, EventSchema, notificationSound } from "@trellis/api";
import type { DesktopBridge } from "../desktopBridge";
import { client } from "../orpc";

const sound = new Audio(
	URL.createObjectURL(new Blob([notificationSound() as Uint8Array<ArrayBuffer>], { type: "audio/wav" })),
);
export async function previewNotification(volume: number) {
	const desktop = (window as Window & { trellisDesktop?: DesktopBridge }).trellisDesktop;
	if (desktop?.previewNotification) return desktop.previewNotification(volume);
	sound.volume = volume / 100;
	sound.currentTime = 0;
	await sound.play();
}

export function createSessionNotifications(isLeader: () => boolean, navigate: (path: string) => void) {
	const desktop = (window as Window & { trellisDesktop?: DesktopBridge }).trellisDesktop;
	const alerts = createAgentNotifications({
		active: isLeader,
		isVisible: (runId) => {
			const visible = JSON.parse(localStorage.getItem("trellis-visible-session") ?? "null") as {
				runId: string;
				at: number;
			} | null;
			return visible?.runId === runId && Date.now() - visible.at < 1500;
		},
		settings: () => client.settings.get(),
		play: previewNotification,
		show: (alert) => {
			if (!("Notification" in window) || Notification.permission !== "granted") return;
			const notification = new Notification(alert.title, { body: alert.body, tag: alert.key, silent: true });
			notification.onclick = () => {
				window.focus();
				navigate(alert.path);
				notification.close();
			};
		},
	});
	let pending = desktop
		? Promise.resolve()
		: client.agentRuns.activity({}).then(async (sessions) => {
				for (const session of sessions) await alerts.update(session, false);
			});
	return (value: unknown) => {
		if (desktop) return;
		const event = EventSchema.parse(value);
		if (event.type !== "agent-runs.status" && event.type !== "sessions.changed" && event.type !== "agent-runs.changed")
			return;
		pending = pending
			.then(async () => {
				if (event.type === "sessions.changed" || event.type === "agent-runs.changed") {
					alerts.prune(await client.agentRuns.activity({}));
					return;
				}
				await alerts.update(event.activity, event.notify);
			})
			.catch((error: unknown) => console.error("Session notification failed", error));
	};
}
