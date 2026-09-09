// The design checklist sets a minimum hit area of 28 px on a desktop pointer
// and 44 px on a coarse pointer (a touch screen). A control drawn smaller than
// that keeps its drawn size and grows an invisible ::before layer around it.
// The layer is part of the control, so a click or a tap on the layer lands on
// the control. Each entry is keyed by the drawn height of the control in px
// and carries `relative`, which the layer is positioned against.
export const hitArea = {
	16: "relative before:absolute before:-inset-1.5 pointer-coarse:before:-inset-3.5",
	24: "relative before:absolute before:inset-x-0 before:-inset-y-0.5 pointer-coarse:before:-inset-y-2.5",
	28: "relative before:absolute before:inset-x-0 pointer-coarse:before:-inset-y-2",
} as const;

export type HitAreaSize = keyof typeof hitArea;
