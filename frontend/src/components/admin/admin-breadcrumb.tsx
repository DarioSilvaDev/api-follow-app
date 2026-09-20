"use client";

/**
 * Breadcrumb del workspace admin (convención de UI del frontend HCDV).
 *
 * Renderiza una ruta de navegación tipo `Administración / Talleres / item`
 * con separadores. Sigue el estilo de vehicle-header.tsx:
 * - items links → text-muted-foreground
 * - último item (sin href) → text-foreground font-medium
 *
 * El primer item NO incluye breadcrumb a `/` (la raíz del panel admin es
 * /admin — Administración, renderizado por el caller cuando corresponde).
 */
import Link from "next/link";
import { Fragment } from "react";

export interface AdminBreadcrumbItem {
  label: string;
  href?: string;
}

export function AdminBreadcrumb({ items }: { items: AdminBreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span aria-hidden="true" className="text-muted-foreground/60">
                /
              </span>
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  isLast
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}