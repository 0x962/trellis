import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	AgentActivitySchema,
	createAgentNotifications,
	EventSchema,
	notificationSound,
	readSse,
	SettingsSchema,
} from "@trellis/api";
import { Notification } from "electron";
import type { HostConnection } from "../host/host.ts";

export function sessionNotifications(options: {
	directory: string;
	isVisible: (runId: string) => boolean;
	navigate: (path: string) => Promise<void>;
}) {
	let abort: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	let currentHost: HostConnection;
	const soundPath = join(options.directory, "session-notification.wav");
	let ready: Promise<void> | undefined;
	const play = async (volume: number) => {
		ready ??= mkdir(options.directory, { recursive: true }).then(() => writeFile(soundPath, notificationSound()));
		await ready;
		if (stopped || volume === 0) return;
		await promisify(execFile)("/usr/bin/afplay", ["-v", String(volume / 100), soundPath]);
	};
	const alerts = createAgentNotifications({
		active: () => !stopped && !abort?.signal.aborted,
		isVisible: options.isVisible,
		settings: async () => {
			const response = await fetch(`${currentHost.origin}/api/settings`, {
				headers: { Authorization: `Bearer ${currentHost.token}` },
				signal: abort?.signal,
			});
			if (!response.ok) throw new Error(`Notification settings failed: ${response.status}`);
			return SettingsSchema.parse(await response.json());
		},
		play,
		show: (alert) => {
			if (!Notification.isSupported()) return;
			const notification = new Notification({ title: alert.title, body: alert.body, silent: true });
			notification.once("click", () => void options.navigate(alert.path));
			notification.once("failed", (_event, error) => console.error("Agent notification rejected", error));
			notification.show();
		},
	});
	const connect = (host: HostConnection) => {
		currentHost = host;
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
			const response = await request("events?types=agent-runs.status,agent-runs.changed,sessions.changed");
			const baseline = AgentActivitySchema.array().parse(await (await request("agent-runs/activity")).json());
			alerts.prune(baseline);
			for (const activity of baseline) await alerts.update(activity, false);
			for await (const frame of readSse(response.body!)) {
				if (frame.event === "sessions.changed" || frame.event === "agent-runs.changed") {
					alerts.prune(AgentActivitySchema.array().parse(await (await request("agent-runs/activity")).json()));
					continue;
				}
				if (frame.event !== "agent-runs.status") continue;
				const event = EventSchema.parse({ ...JSON.parse(frame.data), type: frame.event });
				if (event.type !== "agent-runs.status") continue;
				await alerts.update(event.activity, event.notify);
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
