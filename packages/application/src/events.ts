import type { BatchKey, CustodyEventType, Gtin, LotNumber, ParticipantRole, WalletAddress } from "@certapharm/domain";

export type DomainEvent =
  | { readonly type: "ParticipantAccredited"; readonly wallet: WalletAddress; readonly role: ParticipantRole; readonly signature: string; readonly explorerUrl: string }
  | { readonly type: "BatchCertified"; readonly batchKey: BatchKey; readonly gtin: Gtin; readonly lot: LotNumber; readonly issuer: WalletAddress; readonly signature: string; readonly explorerUrl: string }
  | { readonly type: "CustodyEventRecorded"; readonly batchKey: BatchKey; readonly eventType: CustodyEventType; readonly actor: WalletAddress; readonly signature: string; readonly explorerUrl: string };

export interface EventBus {
  publish(e: DomainEvent): void;
  subscribe<T extends DomainEvent["type"]>(t: T, h: (e: Extract<DomainEvent, { type: T }>) => void): void;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Array<(e: never) => void>>();
  readonly published: DomainEvent[] = [];
  publish(e: DomainEvent): void {
    this.published.push(e);
    for (const h of this.handlers.get(e.type) ?? []) h(e as never);
  }
  subscribe<T extends DomainEvent["type"]>(t: T, h: (e: Extract<DomainEvent, { type: T }>) => void): void {
    this.handlers.set(t, [...(this.handlers.get(t) ?? []), h as (e: never) => void]);
  }
}
