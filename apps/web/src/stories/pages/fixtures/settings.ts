import type { AgentPromptSettings, Note, Settings } from "@trellis/api";
import { actor, id, project, timestamp } from "./project";
import { projectResponses } from "./responses";

export const settings: Settings = {
	defaultActorName: "Storybook",
	sessionCleanup: { archiveAfterDays: 3, deleteAfterDays: 7 },
	notifications: { sound: true, native: false, volume: 50 },
	menuLinks: [
		{
			id: "22222222-2222-4222-8222-222222222222",
			label: "Project reference",
			icon: "BookOpen",
			url: "https://example.com/reference",
		},
	],
};

export const agentPrompt: AgentPromptSettings = {
	template: "Read the task of {{ticket}}. Use the repository at {{workspace}}. Record the result.",
	defaultTemplate: "Read the task of {{ticket}}. Use the repository at {{workspace}}. Record the result.",
	variables: ["ticket", "workspace"],
	isCustom: false,
};

export const notes: Note[] = [
	{
		id: id(700),
		projectId: project.id,
		projectKey: project.key,
		title: "Shared interface rules",
		body: "Use the shared controls. Check desktop and phone widths. Record each verification result.",
		audience: "all",
		expiresAt: null,
		actor,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

export const settingsResponses = {
	...projectResponses,
	"settings.get": settings,
	"settings.agentPrompt": agentPrompt,
	"actors.default": { name: "Storybook" },
	"notes.list": notes,
	"labels.list": {
		groups: [],
		labels: [
			{
				id: id(701),
				projectId: project.id,
				groupId: null,
				name: "interface",
				color: "blue",
				description: "A change to the product interface.",
				count: 3,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		],
	},
};
