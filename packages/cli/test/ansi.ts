// Matches one ANSI escape sequence, so a test proves `--no-color` and a pipe print none.
const escapeByte = String.fromCharCode(27);

export const ansiPattern = new RegExp(`${escapeByte}\\[[0-9;]*[A-Za-z]`);

export const stripAnsi = (text: string) => text.replaceAll(new RegExp(ansiPattern.source, "g"), "");
