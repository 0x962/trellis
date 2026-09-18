import { useQuery } from "@tanstack/react-query";
import type { Label, TicketLabel } from "@trellis/api";
import { useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { useLabels } from "../../../pickers/hooks/useLabels";
import { toggleLabel } from "../../../pickers/utils/toggleLabel";

export type LabelDraft = {
	// The labels of the new ticket, in the order a ticket row carries them.
	labels: TicketLabel[];
	// `checked` is the new state of the picker row.
	toggle: (label: Label, checked: boolean) => void;
	clear: () => void;
};

// The labels the composer holds for the ticket it is about to create. The
// root project of a tree owns its labels, so a draft that moves to another
// tree keeps no label of the tree it left.
export const useLabelDraft = (projectPath: string | undefined): LabelDraft => {
	const { orpc } = useApp();
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	const rootId = projects.find((entry) => entry.path === projectPath)?.rootId;
	const { groups } = useLabels(projectPath);
	const [labels, setLabels] = useState<TicketLabel[]>([]);
	// The root project of the chosen project, as the draft last saw it. A
	// pick of a project in another tree drops the labels of the tree it left,
	// during the render that first reports the new root.
	const [treeRoot, setTreeRoot] = useState(rootId);
	if (treeRoot !== rootId) {
		setTreeRoot(rootId);
		setLabels([]);
	}
	return {
		labels,
		toggle: (label, checked) => setLabels((held) => toggleLabel(held, label, groups, checked)),
		clear: () => setLabels([]),
	};
};
