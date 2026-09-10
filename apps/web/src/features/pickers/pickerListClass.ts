// The list of a picker popover: at most 360 px, and never taller than the
// room Base UI measures under the trigger (`--available-height`). A mask
// fades the last 16 px while rows scroll under it. The same 16 px of bottom
// padding lets the last row clear the fade at the end of the list.
export const pickerListClass =
	"max-h-[min(360px,var(--available-height))] pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)]";
