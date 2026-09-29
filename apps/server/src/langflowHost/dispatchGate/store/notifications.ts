import { EventEmitter } from "node:events";

export const dispatchChanges = new EventEmitter().setMaxListeners(0);
