/**
 * Contexto de la revocación (C-6 / F-8).
 *
 * - `workshop`: taller dueño del invite — lookup con scope `workshopId`,
 *   motivo canónico `by_workshop` (T13/T14).
 * - `admin`: plataforma (`POST /api/admin/vehicle-claims/:id/revoke`) —
 *   lookup solo por `id` (sin scoping de taller), motivo canónico
 *   `by_admin`. El `reason` libre del body no se persiste (no hay columna).
 */
export type RevokeClaimContext =
  | { readonly type: 'workshop'; readonly workshopId: string }
  | { readonly type: 'admin' };

export class RevokeClaimCommand {
  public readonly context: RevokeClaimContext;
  /** Scope de taller del invite; `null` en contexto admin (C-6). */
  public readonly workshopId: string | null;

  constructor(
    public readonly id: string,
    context: string | RevokeClaimContext,
    public readonly userId: string,
    public readonly reason?: string | null,
  ) {
    // String ⇒ contexto workshop: compat con el call site existente del taller.
    this.context =
      typeof context === 'string'
        ? { type: 'workshop', workshopId: context }
        : context;
    this.workshopId =
      this.context.type === 'workshop' ? this.context.workshopId : null;
  }
}
