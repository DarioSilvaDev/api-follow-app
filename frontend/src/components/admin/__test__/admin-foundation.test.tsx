/**
 * Tests de la fundación UI del workspace admin (Platform Workspace).
 *
 * Componentes compartidos entre secciones admin (convención UI approbada):
 * - AdminContextIndicator: indica Active Context "Plataforma".
 * - AdminNoAccessState: acceso denegado por permiso (UX, no security).
 * - EntityNotFoundState: entidad no encontrada (copy canónico).
 * - AdminTablePagination: paginador Anterior/Siguiente + contador.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminContextIndicator } from "@/components/admin/admin-context-indicator";
import { AdminNoAccessState } from "@/components/admin/admin-no-access-state";
import { AdminTablePagination } from "@/components/admin/admin-table-pagination";
import { EntityNotFoundState } from "@/components/admin/entity-not-found-state";

// El Link real (next/link) necesita router context → mock funcional (patrón
// del repo: transfer-dialog.test.tsx).
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

describe("AdminContextIndicator", () => {
  it("indica Active Context de la plataforma con copy canónico", () => {
    render(<AdminContextIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Plataforma")).toBeInTheDocument();
    expect(
      screen.getByText("Estás administrando la plataforma."),
    ).toBeInTheDocument();
  });
});

describe("AdminNoAccessState", () => {
  it("muestra el copy de permisos y el link de retorno a Administración", () => {
    render(<AdminNoAccessState />);
    expect(
      screen.getByText("No tenés permisos para ver esta sección"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Contactá a un administrador de la plataforma."),
    ).toBeInTheDocument();
    const back = screen.getByRole("link", {
      name: "Volver a Administración",
    });
    expect(back).toHaveAttribute("href", "/admin");
  });
});

describe("EntityNotFoundState", () => {
  it("usa copy canónico por defecto + volver a Administración", () => {
    render(<EntityNotFoundState />);
    expect(screen.getByText("No encontrada")).toBeInTheDocument();
    expect(
      screen.getByText("No existe o no tenés acceso."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver a Administración" }),
    ).toHaveAttribute("href", "/admin");
  });

  it("acepta título/descripción/back configurables por entidad", () => {
    render(
      <EntityNotFoundState
        title="Taller no encontrado"
        description="El taller que buscás no existe o fue eliminado."
        backHref="/admin/workshops"
        backLabel="Volver a talleres"
      />,
    );
    expect(screen.getByText("Taller no encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a talleres" })).toHaveAttribute(
      "href",
      "/admin/workshops",
    );
  });
});

describe("AdminTablePagination", () => {
  it("muestra el resumen 'Página X de Y · Z en total'", () => {
    render(
      <AdminTablePagination
        page={2}
        totalPages={5}
        total={47}
        onPageChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Página 2 de 5 · 47 en total"),
    ).toBeInTheDocument();
  });

  it("deshabilita Anterior en la primera página", () => {
    render(
      <AdminTablePagination
        page={1}
        totalPages={5}
        total={47}
        onPageChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /anterior/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /siguiente/i }),
    ).not.toBeDisabled();
  });

  it("deshabilita Siguiente en la última página", () => {
    render(
      <AdminTablePagination
        page={5}
        totalPages={5}
        total={47}
        onPageChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /siguiente/i }),
    ).toBeDisabled();
  });

  it("deshabilita ambos mientras isFetching", () => {
    render(
      <AdminTablePagination
        page={3}
        totalPages={5}
        total={47}
        isFetching
        onPageChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /anterior/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /siguiente/i }),
    ).toBeDisabled();
  });

  it("llama onPageChange con page - 1 y page + 1", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <AdminTablePagination
        page={3}
        totalPages={5}
        total={47}
        onPageChange={onPageChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /anterior/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });
});