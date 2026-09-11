import { SQLiteStorage } from "expo-sqlite/kv-store";
import { createKvStore } from "./kv";

// The one key-value store of the app, a SQLite file named `trellis`. `keys`
// travels with it, so a reader asks this module for the store and the name of
// the value it wants. Every method is synchronous, so a screen paints a
// stored value on its first render.
export const store = createKvStore(new SQLiteStorage("trellis"));

export { keys } from "./keys";
