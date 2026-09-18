import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	defaultNotifications,
	EventSchema,
	notificationSound,
	readSse,
	SessionAlerts,
	SessionDetailSchema,
	SettingsSchema,
} from "@trellis/api";
import { Notification } from "electron";
import type { HostConnection } from "../host/host.ts";

export function sessionNotifications(options: {
	directory: string;
	isVisible: (runId: string) => boolean;
	navigate: (sessionId: string) => Promise<void>;
}) {
	const alerts = new SessionAlerts();
	let abort: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastSound = 0;
	let stopped = false;
	const soundPath = join(options.directory, "session-notification.wav");
	let ready: Promise<void> | undefined;
	const play = async (volume: number) => {
		ready ??= mkdir(options.directory, { recursive: true }).then(() => writeFile(soundPath, notificationSound()));
		await ready;
		if (stopped || volume === 0 || Date.now() - lastSound < 1000) return;
		lastSound = Date.now();
		const child = spawn("/usr/bin/afplay", ["-v", String(volume / 100), soundPath], { stdio: "ignore" });
		child.once("error", (error) => console.error("Notification sound failed", error));
	};
	const connect = (host: HostConnection) => {
		abort?.abort();
		clearTimeout(timer);
		const controller = new AbortController();
		abort = controller;
		const request = async (path: string) => {
			const response = await fetch(`${host.origin}/api/${path}`, {
				headers: { Authorization: `Bearer ${host.token}` },
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`Notification request failed: ${response.status}`);
			return response;
		};
		const watch = async () => {
			const response = await request("events?types=sessions.status,sessions.changed");
			const baseline = SessionDetailSchema.array().parse(await (await request("sessions/activity")).json());
			alerts.prune(baseline);
			for (const session of baseline) alerts.update(session, false);
			for await (const frame of readSse(response.body!)) {
				if (frame.event === "sessions.changed") {
					alerts.prune(SessionDetailSchema.array().parse(await (await request("sessions/activity")).json()));
					continue;
				}
				if (frame.event !== "sessions.status") continue;
				const event = EventSchema.parse({ ...JSON.parse(frame.data), type: frame.event });
				if (event.type !== "sessions.status") continue;
				const notifications = alerts.update(event.session, event.notify);
				if (!notifications.length || options.isVisible(event.session.run.id)) continue;
				const settings =
					SettingsSchema.parse(await (await request("settings")).json()).notifications ?? defaultNotifications;
				if (controller.signal.aborted || options.isVisible(event.session.run.id)) continue;
				if (settings.sound) await play(settings.volume);
				if (settings.native && Notification.isSupported()) {
					for (const alert of notifications) {
						const notification = new Notification({ title: alert.title, body: alert.body, silent: true });
						notification.once("click", () => {
							void options.navigate(alert.sessionId);
						});
						notification.once("failed", (_event, error) => console.error("Session notification rejected", error));
						notification.show();
					}
				}
			}
		};
		void watch()
			.catch((error: unknown) => {
				if (!controller.signal.aborted) console.error("Session notifications disconnected", error);
			})
			.finally(() => {
				if (!controller.signal.aborted) timer = setTimeout(() => connect(host), 2000);
			});
	};
	return {
		connect,
		play,
		stop: () => {
			stopped = true;
			abort?.abort();
			clearTimeout(timer);
			void ready?.then(() => rm(soundPath, { force: true }));
		},
	};
}
