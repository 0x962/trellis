// How long the green band takes to cross one ticket row and clear.
export const doneWashMs = 640;

// How long the progress circle of a wave header takes to reach full: it
// waits while the band crosses the row, then it fills. The two parts are
// `--delay-wave-fill` and `--duration-wave-fill` in `tokens.css`, and the
// test beside this file holds the sum to this number.
export const waveFillMs = 700;
