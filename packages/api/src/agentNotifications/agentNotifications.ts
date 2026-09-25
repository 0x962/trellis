import { defaultNotifications } from "../notificationSound/notificationSound.ts";
import type { AgentActivity } from "../schemas/agentActivity.ts";
import type { Settings } from "../schemas/settings/index.ts";
import { type SessionAlert, SessionAlerts } from "../sessionAlerts/sessionAlerts.ts";

export function createAgentNotifications(options: {
	active: () => boolean;
	isVisible: (runId: string) => boolean;
	settings: () => Promise<Settings>;
	play: (volume: number) => Promise<void>;
	show: (alert: SessionAlert) => void;
}) {
	const alerts = new SessionAlerts();
	return {
		prune: (activities: AgentActivity[]) => alerts.prune(activities),
		async update(activity: AgentActivity, notify: boolean) {
			const pending = alerts.update(activity, notify);
			if (!pending.length || !options.active() || options.isVisible(activity.run.id)) return;
			const settings = (await options.settings()).notifications ?? defaultNotifications;
			if (!options.active() || options.isVisible(activity.run.id)) return;
			for (const alert of pending) {
				if (settings.native) options.show(alert);
				if (settings.sound && settings.volume > 0) await options.play(settings.volume);
			}
		},
	};
}
