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
// box. The spacing token is 4 px, so `inset-1.75` is 7 px. A control whose
// drawn width follows its content gets a centered layer with a minimum size
// instead. That hit box is the same for every content width.
//
// A layer only wins a hit test where nothing paints over it. Two controls
// that sit a few px apart each cover the other's layer, and a bar under a
// control covers the layer below it, so `document.elementFromPoint` there
// answers the neighbour. A control in a row of controls therefore draws its
// own 44 px box on a coarse pointer, through `coarseTarget`, and its layer
// shrinks back to the padding box.
//
// The height and the minimum width carry the coarse box: a square control
// keeps its width from `min-width` and a control with a label keeps the
// wider of its label and 44 px. An entry whose fine layer reaches past the
// drawn box pulls the layer back to `inset-0` itself.
const coarseTarget = "pointer-coarse:h-11 pointer-coarse:min-w-11";

export const hitArea = {
	// A 16 px box with no border: the Switch track and the Chip remove button.
	// Fine: 6 px each side, 16 + 12 = 28. Coarse: 14 px, 16 + 28 = 44.
	box16: "relative before:absolute before:-inset-1.5 pointer-coarse:before:-inset-3.5",
	// A 16 px box with a 1 px border: the Checkbox. The padding box is 14 px.
	// Fine: 7 px each side, 14 + 14 = 28. Coarse: 15 px, 14 + 30 = 44.
	box16Bordered: "relative before:absolute before:-inset-1.75 pointer-coarse:before:-inset-3.75",
	// A 24 px tall box with a 1 px border: IconButton xs. The
	// padding box is 22 px tall and at least 22 px wide.
	// Fine: 3 px each side, 22 + 6 = 28. Coarse: the drawn box is 44.
	box24Bordered: `relative before:absolute before:-inset-0.75 pointer-coarse:before:inset-0 ${coarseTarget}`,
	// A 28 px tall box with a 1 px border: Button sm, IconButton sm, the Select
	// trigger, and the Menu trigger. The padding box is 26 px tall and at least
	// 26 px wide. Fine: 0, the drawn box is 28. Coarse: the drawn box is 44.
	box28Bordered: `relative before:absolute before:inset-0 ${coarseTarget}`,
	// A 32 px tall box with a 1 px border: Button md and IconButton md. The padding box is 30 px
	// tall and at least 26 px wide. Fine: 0, the drawn box is 28 x 32.
	// Coarse: the drawn box is 44.
	box32Bordered: `relative before:absolute before:inset-0 ${coarseTarget}`,
	// A Segmented item: 28 px tall with a 1 px border, pressed against its
	// neighbours, so the layer grows in height only. The item's own min-width
	// gives the width: 28 px on a fine pointer and 44 px on a coarse pointer.
	// Fine: 0, the drawn box is 28. Coarse: 9 px, 26 + 18 = 44.
	segment28: "relative before:absolute before:inset-x-0 before:inset-y-0 pointer-coarse:before:-inset-y-2.25",
	// A Tab: 32 px tall with a 2 px bottom border, so the padding box is 30 px
	// tall, and as wide as its label. The layer is centered on the padding
	// box, fills it, and keeps a minimum size of its own. A label of any
	// width gives the full hit box. Labels of 12 px or more keep the layers of
	// two neighbouring tabs apart, because tabs sit 16 px apart.
	// Fine: at least 28 x 28, so the hit box is 28 x 32. Coarse: 44 x 44.
	tab32:
		"relative before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:min-w-7 before:min-h-7 before:w-full before:h-full pointer-coarse:before:min-w-11 pointer-coarse:before:min-h-11",
	// A Sheet resize handle: a 4 px wide strip with no border that fills the
	// panel's height, so the layer grows in width only.
	// Fine: 12 px each side, 4 + 24 = 28. Coarse: 20 px, 4 + 40 = 44.
	handle4: "relative before:absolute before:inset-y-0 before:-inset-x-3 pointer-coarse:before:-inset-x-5",
} as const;

export type HitAreaKey = keyof typeof hitArea;
