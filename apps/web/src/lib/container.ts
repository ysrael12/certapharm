import { buildContainer, type Container } from "@certapharm/runtime";

type Slot = { read?: Promise<Container> | undefined; write?: Promise<Container> | undefined };
const g = globalThis as typeof globalThis & { __cph?: Slot };
const slot = (g.__cph ??= {});

/** Public pages and `/api/verify`: needs only RPC_URL and PLATFORM_AUTHORITY. No secret key is ever loaded. */
export const readContainer = (): Promise<Container> => (slot.read ??= buildContainer({ mode: "read" }));

/** Manager actions only. Loads the Platform key from PLATFORM_SECRET or .keys/platform.json. */
export const writeContainer = (): Promise<Container> => (slot.write ??= buildContainer({ mode: "write" }));

/** After a write, drop the read container so its 15 s report cache and 60 s participant cache do not serve stale answers. */
export const invalidateRead = (): void => { slot.read = undefined; };
