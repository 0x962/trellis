// Joins class names and drops the falsy entries, so a conditional class can
// be written as `condition && "class"`.
export const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");
