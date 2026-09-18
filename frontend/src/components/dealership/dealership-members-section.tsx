"use client";

/**
 * Milestone consignación — Miembros de la concesionaria (D-104, spec §8).
 *
 * Espejo del patrón workshops (D-102): listar / invitar / cambiar rol /
 * quitar. Los roles vienen de GET /dealerships/:id/roles (seed RB-10:
 * owner / admin / seller). La aceptación de invitación por parte del
 * invitado queda fuera de esta fase (mismo gap que workshops — D-034).
 *
 * Frontera de enforcement: SOLO el backend. La UI habilita las acciones
 * de administración según el rol del usuario en la sesión (owner/admin).
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { dealershipApi } from "@/lib/api";

interface DealershipMembersSectionProps {
  dealershipId: string;
}

type Feedback =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

function errorText(error: unknown): string {
  const status = (error as { status?: number }).status;
  if (status === 403) {
    return "No tenés permiso para administrar los miembros.";
  }
  if (status === 404) {
    return "La concesionaria no existe o ya no sos miembro.";
  }
  return "No se pudo completar la operación. Intentá nuevamente.";
}

export function DealershipMembersSection({
  dealershipId,
}: DealershipMembersSectionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const membership = user?.dealershipMemberships?.find(
    (m) => m.dealershipId === dealershipId,
  );
  const isAdmin =
    membership?.role === "owner" || membership?.role === "admin";

  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const membersQuery = useQuery({
    queryKey: ["dealership-members", dealershipId],
    queryFn: () => dealershipApi.listMembers(dealershipId),
    enabled: Boolean(user),
  });

  const rolesQuery = useQuery({
    queryKey: ["dealership-roles", dealershipId],
    queryFn: () => dealershipApi.listRoles(dealershipId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["dealership-members", dealershipId],
    });
  };

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; roleId: string }) =>
      dealershipApi.inviteMember(dealershipId, input),
    onSuccess: () => {
      setEmail("");
      setRoleId("");
      setFeedback({
        kind: "success",
        text: "Invitación enviada por email.",
      });
      invalidate();
    },
    onError: (error: unknown) => {
      setFeedback({
        kind: "error",
        text:
          (error as { status?: number }).status === 409
            ? "Ese email ya fue invitado o ya es miembro."
            : errorText(error),
      });
    },
  });

  const changeRole = useMutation({
    mutationFn: ({ memberId, nextRoleId }: { memberId: string; nextRoleId: string }) =>
      dealershipApi.updateMemberRole(dealershipId, memberId, nextRoleId),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      setFeedback({ kind: "error", text: errorText(error) });
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      dealershipApi.removeMember(dealershipId, memberId),
    onSuccess: () => {
      setFeedback({
        kind: "success",
        text: "Miembro eliminado de la concesionaria.",
      });
      invalidate();
    },
    onError: (error: unknown) => {
      setFeedback({ kind: "error", text: errorText(error) });
    },
  });

  const handleInvite = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !roleId) return;
    setFeedback(null);
    inviteMutation.mutate({ email: email.trim().toLowerCase(), roleId });
  };

  const members = membersQuery.data ?? [];
  const roles = rolesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {feedback && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.kind === "success"
              ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {isAdmin && (
        <form
          onSubmit={handleInvite}
          className="flex flex-col gap-3 rounded-lg border p-4"
          noValidate
        >
          <p className="text-sm font-medium">Invitar miembro</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="member-email">Email del miembro</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="vendedor@fmautomotores.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-role">Rol</Label>
              <Select
                id="member-role"
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                <option value="">Elegí un rol</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="submit"
              disabled={inviteMutation.isPending || !email.trim() || !roleId}
            >
              {inviteMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              Invitar
            </Button>
          </div>
        </form>
      )}

      {membersQuery.isLoading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          Cargando miembros...
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Todavía no hay miembros"
          description="Invitá a tu equipo por email para que participe de la concesionaria."
        />
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {members.map((member) => {
            const role = member.role ?? roles.find((r) => r.id === member.roleId);
            const displayName = member.user
              ? [member.user.firstName, member.user.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim()
              : "Miembro";
            const isOwner = role?.code === "owner";
            const busyChanging =
              changeRole.isPending && changeRole.variables?.memberId === member.id;

            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserRound className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{displayName}</p>
                      {member.status === "PENDING" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <Mail className="size-3" />
                          Invitación pendiente
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.user?.email}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isAdmin && !isOwner ? (
                    <Select
                      aria-label="Cambiar rol"
                      value={member.roleId}
                      disabled={busyChanging}
                      onChange={(event) => {
                        setFeedback(null);
                        changeRole.mutate({
                          memberId: member.id,
                          nextRoleId: event.target.value,
                        });
                      }}
                      className="h-8 w-32"
                    >
                      {roles.map((roleItem) => (
                        <option key={roleItem.id} value={roleItem.id}>
                          {roleItem.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {isOwner && <ShieldCheck className="size-3" />}
                      {role?.name ?? "Miembro"}
                    </span>
                  )}

                  {isAdmin && !isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar a ${displayName}`}
                      disabled={removeMember.isPending}
                      onClick={() => {
                        setFeedback(null);
                        removeMember.mutate(member.id);
                      }}
                    >
                      {removeMember.isPending &&
                      removeMember.variables === member.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 text-destructive" />
                      )}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!isAdmin && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="size-3.5" />
          Solo los dueños y administradores pueden invitar o cambiar roles.
        </p>
      )}
    </div>
  );
}