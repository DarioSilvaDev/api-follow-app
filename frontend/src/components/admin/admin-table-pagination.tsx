"use client";

/**
 * Paginador reutilizable de los listados admin.
 *
 * Extraído del paginador inline de /admin/dealerships (patrón Anterior /
 * Siguiente + "Página X de Y · Z en total") para compartirse entre secciones
 * admin (concesionarias y talleres hoy; usuarios/vehículos en el futuro).
 *
 * El caller decide si renderizarlo (p. ej. solo cuando totalPages > 1) y es
 * quien posee el estado de `page`.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminTablePagination({
  page,
  totalPages,
  total,
  isFetching = false,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
}) {
  const canPrevious = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Página {page} de {totalPages} · {total} en total
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrevious || isFetching}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canNext || isFetching}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}