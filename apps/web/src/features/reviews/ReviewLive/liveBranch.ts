export type LiveBranchMeta = {
	labels?: { name: string }[];
	comments?: { body: string; createdAt?: string; updatedAt?: string }[];
	commits?: { committedDate?: string }[];
};

export type LiveBranchReport = {
	ready: boolean;
	environment?: string;
	url?: string;
	adminUrl?: string;
	gatewayUrl?: string;
	pod?: string;
	branch?: string;
	updatedAt?: string;
};

export type LiveBranchState = {
	enabled: boolean;
	available: boolean;
	upToDate: boolean;
	label: "Ready" | "Available" | "Update available" | "Enabled" | "Not deployed";
	report: LiveBranchReport | null;
};

const marker = "<!-- lite-env-dev-pod -->";
const enabledLabels = ["Live Branch: Enabled", "Lite Env: Enabled"];

const cellText = (value: string) => value.replace(/^`|`$/g, "").trim();

const cellUrl = (value: string) => {
	const match = /^\[([^\]]+)]\((https:\/\/[^)]+)\)$/.exec(value.trim());
	return match?.[2];
};

export function parseLiveBranchReport(body: string): LiveBranchReport | null {
	if (!body.includes(marker)) return null;
	const values = new Map<string, string>();
	for (const line of body.split(/\r?\n/)) {
		const row = /^\|\s*\*\*(.+?)\*\*\s*\|\s*(.*?)\s*\|$/.exec(line);
		if (row) values.set(row[1]!, row[2]!);
	}
	const updatedAt = /<relative-time datetime="([^"]+)"/.exec(body)?.[1];
	return {
		ready: /Live Branch Dev Pod Ready/i.test(body),
		environment: values.has("Environment") ? cellText(values.get("Environment")!) : undefined,
		url: values.has("URL") ? cellUrl(values.get("URL")!) : undefined,
		adminUrl: values.has("Admin") ? cellUrl(values.get("Admin")!) : undefined,
		gatewayUrl: values.has("Gateway URL") ? cellUrl(values.get("Gateway URL")!) : undefined,
		pod: values.has("Pod") ? cellText(values.get("Pod")!) : undefined,
		branch: values.has("Branch") ? cellText(values.get("Branch")!) : undefined,
		updatedAt,
	};
}

export function liveBranchState(meta: LiveBranchMeta): LiveBranchState {
	const enabled = meta.labels?.some((label) => enabledLabels.includes(label.name)) ?? false;
	const comment = meta.comments?.filter((item) => item.body.includes(marker)).at(-1);
	const report = comment ? parseLiveBranchReport(comment.body) : null;
	const reportAt = report?.updatedAt ?? comment?.updatedAt ?? comment?.createdAt;
	const latestCommitAt = meta.commits
		?.map((commit) => commit.committedDate)
		.filter(Boolean)
		.at(-1);
	const available = Boolean(report?.ready && report.url);
	const upToDate = Boolean(
		available && reportAt && latestCommitAt && Date.parse(reportAt) >= Date.parse(latestCommitAt),
	);
	const label =
		enabled && upToDate
			? "Ready"
			: upToDate
				? "Available"
				: available
					? "Update available"
					: enabled
						? "Enabled"
						: "Not deployed";
	return { enabled, available, upToDate, label, report };
}
