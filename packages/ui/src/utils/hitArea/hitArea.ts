// The design checklist sets a minimum hit area of 28 px on a desktop pointer
// and 44 px on a coarse pointer (a touch screen). A control drawn smaller than
// that keeps its drawn size and grows an invisible ::before layer around it.
// The layer is part of the control, so a click or a tap on the layer lands on
// the control. Each entry carries `relative`, which the layer is positioned
// against.
//
// The layer is positioned against the padding box, so a 1 px border sits
// between the drawn edge and the layer's edge. The insets below are measured
// from the padding box; the hit box in each comment adds them to the padding
// box. The spacing token is 4 px, so `inset-1.75` is 7 px.
export const hitArea = {
	// A 16 px box with no border: the Switch track and the Chip remove button.
	// Fine: 6 px each side, 16 + 12 = 28. Coarse: 14 px, 16 + 28 = 44.
	box16: "relative before:absolute before:-inset-1.5 pointer-coarse:before:-inset-3.5",
	// A 16 px box with a 1 px border: the Checkbox. The padding box is 14 px.
	// Fine: 7 px each side, 14 + 14 = 28. Coarse: 15 px, 14 + 30 = 44.
	box16Bordered: "relative before:absolute before:-inset-1.75 pointer-coarse:before:-inset-3.75",
	// A 24 px tall box with a 1 px border: Button sm and IconButton sm. The
	// padding box is 22 px tall and at least 22 px wide.
	// Fine: 3 px each side, 22 + 6 = 28. Coarse: 11 px, 22 + 22 = 44.
	box24Bordered: "relative before:absolute before:-inset-0.75 pointer-coarse:before:-inset-2.75",
	// A 28 px tall box with a 1 px border: Button md, IconButton md, the Select
	// trigger, and the Menu trigger. The padding box is 26 px tall and at least
	// 26 px wide. Fine: 0, the drawn box is 28. Coarse: 9 px, 26 + 18 = 44.
	box28Bordered: "relative before:absolute before:inset-0 pointer-coarse:before:-inset-2.25",
	// A Segmented item: 28 px tall with a 1 px border, pressed against its
	// neighbours, so the layer grows in height only. The item's own min-width
	// gives the width: 28 px on a fine pointer and 44 px on a coarse pointer.
	// Fine: 0, the drawn box is 28. Coarse: 9 px, 26 + 18 = 44.
	segment28: "relative before:absolute before:inset-x-0 before:inset-y-0 pointer-coarse:before:-inset-y-2.25",
} as const;

export type HitAreaKey = keyof typeof hitArea;
