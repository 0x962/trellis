// One line built from parts, with " · " between them. A part that is null
// drops out, so the line never prints two separators with nothing between
// them.
export const dotted = (parts: readonly (string | null)[]) => parts.filter((part) => part !== null).join(" · ");
