import { buildContainer as build, KEYS_DIR } from "@certapharm/runtime";

export { KEYS_DIR };
export const buildContainer = () => build({ mode: "write" });
export type Container = Awaited<ReturnType<typeof buildContainer>>;
