/**
 * Generate a stable Field id (ADR-0006). Client-generated so a Field has
 * identity the moment it is created in the editor — before any Review-state row
 * exists — which lets reconciliation key by it.
 */
export function newFieldId(): string {
  return crypto.randomUUID();
}
