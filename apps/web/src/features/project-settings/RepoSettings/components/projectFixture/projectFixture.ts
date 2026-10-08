import type { Project } from "@trellis/api";

export const projectFixture = (): Project =>
	({
		id: "01K00000000000000000000000",
		key: "TRL",
		slug: "trellis",
		name: "Trellis",
		description: "Saved description",
		color: "blue",
		ticketCounter: 0,
		repos: [
			{ id: "01K00000000000000000000001", projectId: "01K00000000000000000000000", owner: "0x962", repo: "trellis" },
			{ id: "01K00000000000000000000002", projectId: "01K00000000000000000000000", owner: "0x962", repo: "agents" },
		],
	}) as Project;
