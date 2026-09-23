import type { Label, TicketLabel } from "@trellis/api";
import { useState } from "react";
import { useLabels } from "../../../pickers/hooks/useLabels";
import { toggleLabel } from "../../../pickers/utils/toggleLabel";

export type LabelDraft = {
	// The labels of the new ticket, in the order a ticket row carries them.
	labels: TicketLabel[];
	// `checked` is the new state of the picker row.
	toggle: (label: Label, checked: boolean) => void;
	clear: () => void;
};

// The labels the composer holds for the ticket it is about to create. A
// project owns its labels, so a draft that moves to another project keeps no
// label of the project it left.
export const useLabelDraft = (projectKey: string | undefined): LabelDraft => {
	const { groups } = useLabels(projectKey);
	const [labels, setLabels] = useState<TicketLabel[]>([]);
	// The chosen project, as the draft last saw it. A pick of another project
	// drops the labels of the project it left, during the render that first
	// reports the new key.
	const [drafted, setDrafted] = useState(projectKey);
	if (drafted !== projectKey) {
		setDrafted(projectKey);
		setLabels([]);
	}
	return {
		labels,
		toggle: (label, checked) => setLabels((held) => toggleLabel(held, label, groups, checked)),
		clear: () => setLabels([]),
	};
};
