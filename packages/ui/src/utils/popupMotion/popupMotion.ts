// The enter and exit of a popup that scales up and fades in: a Popover, a
// Menu, a Select list, a Dialog, a Tooltip. Base UI sets data-starting-style
// on the frame a popup mounts and data-ending-style while it leaves. Under
// reduced motion the scale is pinned to 100, so the popup only fades. The
// duration is the caller's: duration-popover, or duration-hover on a Tooltip.
export const popupMotion =
	"transition-[opacity,scale] ease-out data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0 motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100";
