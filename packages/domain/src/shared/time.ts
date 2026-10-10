/** Unix seconds, UTC. */
export type Instant = number;
export interface Clock {
  now(): Instant;
}
export const DAY = 86_400;
