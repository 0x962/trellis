import { defaultNotifications, EventSchema, notificationSound, SessionAlerts } from "@trellis/api";
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
	const alerts = new SessionAlerts();
	let lastSound = 0;
	const desktop = (window as Window & { trellisDesktop?: DesktopBridge }).trellisDesktop;
	let pending = desktop
		? Promise.resolve()
		: client.sessions.activity({}).then((sessions) => {
				for (const session of sessions) alerts.update(session, false);
			});
	return (value: unknown) => {
		if (desktop) return;
		const event = EventSchema.parse(value);
		if (event.type !== "sessions.status" && event.type !== "sessions.changed") return;
		pending = pending
			.then(async () => {
				if (event.type === "sessions.changed") {
					alerts.prune(await client.sessions.activity({}));
					return;
				}
				const notifications = alerts.update(event.session, event.notify);
				if (!isLeader() || !notifications.length) return;
				const visible = JSON.parse(localStorage.getItem("trellis-visible-session") ?? "null") as {
					runId: string;
					at: number;
				} | null;
				if (visible?.runId === event.session.run.id && Date.now() - visible.at < 1500) return;
				const settings = (await client.settings.get()).notifications ?? defaultNotifications;
				if (settings.sound && settings.volume > 0 && Date.now() - lastSound >= 1000) {
					lastSound = Date.now();
					void previewNotification(settings.volume).catch((error: unknown) =>
						console.info("Notification audio requires browser permission", error),
					);
				}
				if (settings.native && "Notification" in window && Notification.permission === "granted") {
					for (const alert of notifications) {
						const notification = new Notification(alert.title, { body: alert.body, tag: alert.key, silent: true });
						notification.onclick = () => {
							window.focus();
							navigate(`/sessions/${alert.sessionId}`);
							notification.close();
						};
					}
				}
			})
			.catch((error: unknown) => console.error("Session notification failed", error));
	};
}
