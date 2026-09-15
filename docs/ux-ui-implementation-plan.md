# Plan de Implementación UX/UI — Autentia

> Generado por UX/UI Designer en collaboration con Product Manager y Frontend Tech Lead.
> Fecha: 15 de septiembre de 2026

---

## 1. Nombre Comercial

### Decisión: **Autentia**

- **Significado:** "Auto" (vehículo) + "Autentía" (auténtico, veraz, confiable)
- **Tagline:** "Historia auténtica de tu vehículo"
- **Alternativa descartada:** Auttraz (más técnico, más limitado al concepto de trazabilidad)

### Dirección de marca

| Elemento | Dirección |
|----------|-----------|
| Color primario | Azul profundo (confianza, tecnología, profesionalismo) |
| Color secundario | Acento cálido (ámbar o teal) para acciones positivas |
| Personalidad | Seria pero no fría, profesional pero no corporativa, confiable pero no aburrida |
| Logo concepto | Sello de verificación estilizado con la "A" |
| Tipografía | Geist Sans (mantener, definir jerarquía formal) |

---

## 2. Decisiones de Producto

| Decisión | Respuesta |
|----------|-----------|
| Dashboard | Vehicle-first (vehículos del usuario como vista principal) |
| Landing elaborada | No para MVP |
| Filtros de búsqueda | No para MVP (búsqueda por patente es suficiente) |
| Filtros de timeline | No para MVP |
| CareEpisode detail | Parcial (fecha, tipo, taller, trust, notas) |
| Terminología UI | "Atención" / "Ingreso de Servicio" |
| Header responsive | Sí (hamburguesa + drawer en móvil) |
| Sidebar | No para MVP (header horizontal) |
| Modal confirmación | window.confirm para MVP |

---

## 3. Decisiones Técnicas

| Decisión | Solución |
|----------|----------|
| Design tokens | CSS variables en `globals.css` + `@theme inline` Tailwind v4 |
| Badge | CVA standalone (patrón `button.tsx`) |
| Dialog | `@base-ui/react` Dialog (ya instalado) |
| EmptyState | Componente React dedicado |
| Timeline línea visual | CSS puro (border-left + ::before) |
| Header responsive | Hamburger + drawer (no bottom nav) |
| Vehicle detail | Extraer 5 componentes a `components/vehicle/` |
| Branding assets | SVG favicon + React component para logo |
| Migración colores | Caso por caso, no masiva |
| Tokens de estado dominio | No crear — usar Badge variants |

---

## 4. Roadmap de Implementación

### Fase 1: Design Tokens y Color System
**Duración:** 0.5-1 día | **Dependencias:** Ninguna

- [ ] Definir `--success`, `--warning`, `--info` + foreground en `:root`
- [ ] Definir dark mode para tokens semánticos en `.dark`
- [ ] Mapear en `@theme inline` de Tailwind v4
- [ ] Verificar que `bg-success`, `text-warning`, `border-info` funcionen
- [ ] Cambiar `--primary` de neutral a azul profundo (Autentia)

**Archivos:** `frontend/src/app/globals.css`

---

### Fase 2: Componentes Core
**Duración:** 1.5-2 días | **Dependencias:** Fase 1

- [ ] Crear `components/ui/badge.tsx` (7 variants: default, secondary, destructive, outline, success, warning, info)
- [ ] Crear `components/ui/empty-state.tsx` (icon, title, description, action)
- [ ] Crear `components/ui/dialog.tsx` (wrapper de @base-ui/react Dialog)
- [ ] Reemplazar emojis del timeline por lucide-react icons
- [ ] Reemplazar `window.confirm()` en PhotosSection por Dialog

**Archivos:** `components/ui/badge.tsx`, `components/ui/empty-state.tsx`, `components/ui/dialog.tsx`, `vehicles/[id]/page.tsx`

---

### Fase 3: Header Navigation
**Duración:** 1-1.5 días | **Dependencias:** Fase 2

- [ ] Agregar indicador de página activa con `usePathname()` + `cn()`
- [ ] Implementar hamburger menu en móvil
- [ ] Implementar drawer lateral para navegación móvil
- [ ] Agregar `aria-current="page"` al link activo

**Archivos:** `app/(dashboard)/layout.tsx`

---

### Fase 4: Vehicle Experience
**Duración:** 2-3 días | **Dependencias:** Fase 2

- [ ] Extraer componentes de vehicle detail a `components/vehicle/`:
  - `vehicle-ficha-card.tsx`
  - `vehicle-photos-section.tsx`
  - `vehicle-documents-section.tsx`
  - `vehicle-mileage-section.tsx`
  - `vehicle-history-section.tsx`
  - `vehicle-detail-header.tsx` (nuevo)
  - `index.ts` (barrel export)
- [ ] Crear componente `VehicleCard` en `components/vehicle-card.tsx`
- [ ] Rediseñar header del vehículo detalle
- [ ] Hacer botón "Registrar servicio" más prominente

**Archivos:** `components/vehicle/*`, `components/vehicle-card.tsx`, `vehicles/[id]/page.tsx`, `vehicles/page.tsx`

---

### Fase 5: Dashboard Vehicle-First
**Duración:** 1-2 días | **Dependencias:** Fase 4

- [ ] Rediseñar dashboard para mostrar vehículos del usuario
- [ ] Agregar sección "Actividad reciente"
- [ ] Agregar sección "Pendientes"
- [ ] Eliminar cards de email/rol del dashboard
- [ ] Agregar acciones rápidas

**Archivos:** `app/(dashboard)/dashboard/page.tsx`

---

### Fase 6: Assets y Polish
**Duración:** 1 día | **Dependencias:** Fase 1, Fase 3

- [ ] Crear favicon SVG para Autentia
- [ ] Crear logo SVG para header
- [ ] Crear componente React `AutentiaLogo`
- [ ] Actualizar metadata en `layout.tsx`
- [ ] Migrar colores inline a tokens semánticos
- [ ] Touch targets mínimos (44px)
- [ ] `aria-live="polite"` en búsquedas

**Archivos:** `public/favicon.svg`, `app/layout.tsx`, múltiples páginas

---

## 5. Estimación Total

| Fase | Duración | Acumulado |
|------|----------|-----------|
| Fase 1: Design Tokens | 0.5-1 día | 0.5-1 día |
| Fase 2: Componentes Core | 1.5-2 días | 2-3 días |
| Fase 3: Header Navigation | 1-1.5 días | 3-4.5 días |
| Fase 4: Vehicle Experience | 2-3 días | 5-7.5 días |
| Fase 5: Dashboard | 1-2 días | 6-9.5 días |
| Fase 6: Assets y Polish | 1 día | 7-10.5 días |

**Total: 7-10.5 días de desarrollo**

---

## 6. Estrategia de PRs

| PR | Fases | Contenido |
|----|-------|-----------|
| PR 1 | Fase 1 + 2 | Foundation: tokens + componentes core |
| PR 2 | Fase 3 | Header responsive + navegación activa |
| PR 3 | Fase 4 | Vehicle experience |
| PR 4 | Fase 5 | Dashboard vehicle-first |
| PR 5 | Fase 6 | Assets, migración de colores, polish |

---

## 7. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Merge conflicts al extraer vehicle detail | MEDIA | PR dedicado, coordinar con equipo |
| @base-ui/react Dialog API en v1.8.0 | BAJA | Verificar exports, usar Context7 |
| Tokens semánticos en dark mode | BAJA | Definir ambos temas desde inicio |
| Cambiar `--primary` afecta bg-primary existentes | BAJA | Testing visual post-cambio |

---

## 8. Lo que se mantiene

- Formularios con zod + react-hook-form
- Estados de carga/error/vacío consistentes
- Separación de flujos taller vs propietario
- Arquitectura de componentes (shadcn + base-ui + CVA)
- Manejo de errores de API con mensajes específicos
- Autorización visual (botones según ownership/contexto)
