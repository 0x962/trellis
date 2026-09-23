// How many rounds of review one merged pull request took. The first read of
// a pull request is one round, and each change a person asks for adds one.
export const rounds = (sentBack: number) => (sentBack === 0 ? "1 round" : `${sentBack + 1} rounds`);
