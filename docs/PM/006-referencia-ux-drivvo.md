# 006 — Referencia UX: DRIVVO como base para HCDV

**Fecha:** 2026-09-09
**Estado:** Propuesta
**Alcance:** Documento de referencia para diseño UX, funcionalidades y flujos del propietario en HCDV
**Relación:** Visión del Producto (0-vision del producto.md), Decisiones de Producto (001-005)

---

## Tabla de Contenidos

1. [Objetivo del documento](#1-objetivo-del-documento)
2. [Qué es DRIVVO y por qué es referencia](#2-qué-es-drivvo-y-por-qué-es-referencia)
3. [Análisis de funcionalidades DRIVVO relevantes](#3-análisis-de-funcionalidades-drivvo-relevantes)
4. [Mapa de adaptación DRIVVO → HCDV](#4-mapa-de-adaptación-drivvo--hcdv)
5. [Actores y contextos en HCDV](#5-actores-y-contextos-en-hcdv)
6. [Funcionalidades del Propietario — MVP](#6-funcionalidades-del-propietario--mvp)
7. [User Journeys detallados](#7-user-journeys-detallados)
8. [Flujos de UX y pantallas](#8-flujos-de-ux-y-pantallas)
9. [Formularios](#9-formularios)
10. [Estados y transiciones](#10-estados-y-transiciones)
11. [Decisiones de producto pendientes](#11-decisiones-de-producto-pendientes)
12. [Priorización y roadmap](#12-priorización-y-roadmap)
13. [Qué NO copiar de DRIVVO](#13-qué-no-copiar-de-drivvo)
14. [Principios UX derivados](#14-principios-ux-derivados)

---

## 1. Objetivo del documento

Este documento establece una **referencia de producto y UX** inspirada en DRIVVO, adaptada al contexto y modelo de negocio de HCDV.

Sirve como insumo para:

- Definir funcionalidades del propietario en el MVP.
- Diseñar flujos de usuario y pantallas.
- Construir formularios con la información correcta.
- Establecer la experiencia base del propietario.
- Priorizar funcionalidades según impacto y complejidad.

No es una especificación técnica final. Es una guía de producto que deberá traducirse en historias de usuario y criterios de aceptación por el PM, y en diseño técnico por el Tech Lead.

---

## 2. Qué es DRIVVO y por qué es referencia

### 2.1 Descripción de DRIVVO

DRIVVO es una aplicación móvil y web para la gestión de vehículos. Permite a propietarios y flotas:

- Registrar combustible, gastos, servicios e ingresos.
- Consultar historial chronológico.
- Recibir recordatorios de mantenimiento y vencimientos.
- Generar reportes y gráficos.
- Gestionar múltiples vehículos.
- Exportar datos.

### 2.2 Por qué es referencia para HCDV

DRIVVO resuelve un problema similar al del propietario en HCDV: **tener toda la información del vehículo en un solo lugar, organizada y accesible**.

Sin embargo, DRIVVO es un sistema de **registro individual** donde el propietario es el único actor. HCDV agrega una dimensión adicional: la **construcción colaborativa** del historial con talleres y otros actores.

### 2.3 Qué aporta DRIVVO a HCDV

| Capacidad DRIVVO | Lección para HCDV |
|---|---|
| Historial chronológico completo | El Timeline es la pantalla principal del propietario |
| Registro rápido de eventos | Los formularios deben ser simples y directos |
| Multi-vehículo con selector | El propietario necesita cambiar entre vehículos fácilmente |
| Documentos centralizados | Los documentos del vehículo deben tener gestión de vencimientos |
| Recordatorios inteligentes | Las alertas de vencimiento agregan valor inmediato |
| Reportes y gráficos | Los datos del vehículo deben ser visualizables |
| Exportación de datos | El historial debe ser portable |
| Fotos adjuntas a registros | Las evidencias visuales enriquecen el historial |

---

## 3. Análisis de funcionalidades DRIVVO relevantes

### 3.1 Funcionalidades directamente relevantes

#### 3.1.1 Historial chronológico

DRIVVO muestra todos los eventos del vehículo (combustible, gastos, servicios) en una vista de lista ordenada por fecha.

**Qué hace bien:**
- Cada evento tiene fecha, tipo, descripción y monto.
- Se puede filtrar por tipo de evento.
- Se puede buscar por texto.
- La vista es clara y scaneable.

**Adaptación para HCDV:**
El Timeline de HCDV debe mostrar CareEpisodes, kilometraje, documentos y fotos en una vista cronológica. Cada evento debe indicar quién lo registró (propietario o taller) y su nivel de confianza.

#### 3.1.2 Dashboard del vehículo

DRIVVO muestra una vista resumida de cada vehículo con:
- Foto principal.
- Datos básicos (marca, modelo, año).
- Último evento registrado.
- Kilometraje actual.
- Gasto total del mes.

**Adaptación para HCDV:**
El dashboard del vehículo en HCDV debe mostrar:
- Foto del vehículo.
- Datos del perfil (marca, modelo, versión, año, color).
- Kilometraje actual.
- Cantidad de CareEpisodes.
- Último CareEpisode registrado.
- Documentos próximos a vencer.
- Acceso rápido a Timeline y a "Registrar servicio".

#### 3.1.3 Gestión de documentos

DRIVVO permite adjuntar documentos (seguro, revisión, permiso de circulación) con fecha de vencimiento y recibir alertas.

**Qué hace bien:**
- Categorización de documentos.
- Visualización de vencimiento.
- Recordatorios automáticos.

**Adaptación para HCDV:**
Los documentos del vehículo en HCDV deben:
- Tener categorías (seguro, revisión técnica, permiso, título, otro).
- Registrar fecha de emisión y vencimiento.
- Almacenar el archivo digital.
- Mostrar estado (vigente, próximo a vencer, vencido).
- Generar alertas de vencimiento.

#### 3.1.4 Kilometraje histórico

DRIVVO registra cada lectura del odómetro con fecha, fuente y optionally costo del viaje.

**Adaptación para HCDV:**
El kilometraje en HCDV debe:
- Registrarse con fecha y fuente (propietario, taller, inspección).
- Mostrarse en la timeline.
- Actualizarse con cada CareEpisode.
- Ser consultable históricamente.

#### 3.1.5 Multi-vehículo

DRIVVO permite gestionar múltiples vehículos desde una cuenta, con selector rápido entre ellos.

**Adaptación para HCDV:**
El propietario en HCDV puede tener múltiples vehículos. La navegación debe permitir:
- Ver todos los vehículos en una lista.
- Cambiar rápidamente entre ellos.
- Cada vehículo tiene su propio dashboard, timeline y documentos.

#### 3.1.6 Fotos del vehículo

DRIVVO permite adjuntar fotos a registros de servicio y al perfil del vehículo.

**Adaptación para HCDV:**
Las fotos en HCDV deben:
- Asociarse al perfil del vehículo (foto principal, galería).
- Asociarse a CareEpisodes (evidencia del servicio).
- Asociarse a documentos (copia del documento).
- Tener captions opcionales.

### 3.2 Funcionalidades parcialmente relevantes

#### 3.2.1 Recordatorios

DRIVVO permite crear recordatorios por fecha o kilometraje para mantenimientos preventivos.

**Relevancia para HCDV:**
- Los recordatorios de vencimiento de documentos son útiles.
- Los recordatorios de servicios periódicos (cambio de aceite) son útiles.
- **Decisión pendiente:** ¿HCDV genera recordatorios o el usuario los crea?

#### 3.2.2 Reportes

DRIVVO genera gráficos de gastos por categoría, consumo de combustible, costo por km, etc.

**Relevancia para HCDV:**
- Reporte de servicios realizados por período.
- Reporte de costos de mantenimiento.
- **Post-MVP:** Gráficos de tendencia de mantenimiento.

#### 3.2.3 Exportación

DRIVVO permite exportar datos a CSV/Excel y PDF.

**Relevancia para HCDV:**
- Exportar el timeline del vehículo.
- Exportar documentación.
- **Post-MVP** para el MVP, la consulta en pantalla es suficiente.

### 3.3 Funcionalidades no relevantes para HCDV

| Funcionalidad DRIVVO | Por qué no aplica |
|---|---|
| Registro de combustible | HCDV no es tracker de gastos de combustible |
| Registro de gastos categorizados | HCDV se enfoca en historia clínica, no en contabilidad |
| Registro de ingresos | No es relevante para la historia vehicular |
| Rutas y viajes | No es el foco del producto |
| Checklists de inspección | Podría existir, pero no es core del MVP |
| Gestión de flotas | HCDV no es software de flotas |
| Control de conductores | El modelo de actores de HCDV es diferente |

---

## 4. Mapa de adaptación DRIVVO → HCDV

### 4.1 Tabla de mapeo

| DRIVVO Feature | HCDV Equivalente | Estado en HCDV | Prioridad |
|---|---|---|---|
| Vehicle profile | Vehicle (con Profile conceptual) | Implementado (CRUD básico) | Completar UX |
| Vehicle photos | VehiclePhoto | Implementado (schema) | Completar UX |
| Vehicle documents | VehicleDocument | Implementado (schema) | Completar UX |
| Fuel log | — | No aplica | No priorizar |
| Expense tracking | — | No aplica (Costo en CareEpisode) | No priorizar |
| Service history | CareEpisode + Timeline | **No implementado** | **CRÍTICO** |
| Odometer readings | VehicleMileage | Implementado (schema) | Completar UX |
| Reminders | — | No implementado | Post-MVP |
| Reports | — | No implementado | Post-MVP |
| Export | — | No implementado | Post-MVP |
| Multi-vehicle | Vehicle list | Implementado (backend) | Completar UX |
| Checklists | — | No implementado | Futuro |
| Income tracking | — | No aplica | No priorizar |
| Routes | — | No aplica | No priorizar |

### 4.2 Gap analysis para MVP

| Necesidad | Estado actual | Gap | Esfuerzo estimado |
|---|---|---|---|
| Dashboard del vehículo | Lista de vehículos | Pantalla de detalle del vehículo | Medio |
| Timeline del vehículo | No existe | Modelo CareEpisode + vista cronológica | Alto |
| Registro de servicio del propietario | No existe | CareEpisode con source="owner" | Alto |
| Documentos con vencimiento | Schema existe | UX de gestión y alertas | Medio |
| Multi-vehículo con selector | Backend existe | Selector rápido en UI | Bajo |
| Kilometraje con historial | Schema existe | UX de registro y consulta | Bajo |
| Fotos del vehículo | Schema existe | UX de galería | Bajo |

---

## 5. Actores y contextos en HCDV

### 5.1 Actores relevantes para este documento

| Actor | Descripción | Contexto principal |
|---|---|---|
| **Propietario** | Persona que posee o ha poseído un vehículo | Personal |
| **Taller** | Organización que presta servicios sobre vehículos | Workshop |
| **Mecánico** | Miembro de un taller que realiza servicios | Workshop |
| **Administrador** | Persona con permisos administrativos sobre la plataforma | Platform |

### 5.2 Active Context

El propietario opera desde el **Contexto Personal**.

Desde este contexto puede:
- Ver sus vehículos.
- Ver el dashboard de cada vehículo.
- Ver el timeline de cada vehículo.
- Registrar servicios propios.
- Gestionar documentos y fotos del vehículo.
- Gestionar el kilometraje.
- Compartir el historial del vehículo.

### 5.3 Permisos del propietario en Contexto Personal

| Acción | Permiso requerido |
|---|---|
| Ver mis vehículos | vehicle.read (propiedad) |
| Ver dashboard de vehículo | vehicle.read (propiedad) |
| Ver timeline de vehículo | vehicle.read (propiedad) |
| Registrar servicio propio | care_episode.create (owner) |
| Editar servicio propio | care_episode.update (owner, propio) |
| Eliminar servicio propio | care_episode.delete (owner, propio) |
| Gestionar documentos | vehicle_document.manage (propiedad) |
| Gestionar fotos | vehicle_photo.manage (propiedad) |
| Registrar kilometraje | vehicle_mileage.create (propiedad) |
| Compartir historial | vehicle.share (propiedad) |

---

## 6. Funcionalidades del Propietario — MVP

### 6.1 F1: Dashboard del Vehículo

**Descripción:** Pantalla principal que muestra un resumen del vehículo seleccionado.

**Problema:** Actualmente el propietario ve una lista de vehículos pero no tiene una vista detallada de cada uno.

**User Story:**
> Como propietario, quiero ver un resumen de mi vehículo con su información clave, para entender su estado actual rápidamente.

**Información a mostrar:**
- Foto principal del vehículo (o placeholder si no tiene).
- Marca, modelo, versión.
- Año de fabricación / modelo.
- Color.
- Patente (si existe).
- VIN (si existe, oculto parcialmente).
- Kilometraje actual (último registro).
- Cantidad total de CareEpisodes.
- Último CareEpisode registrado (fecha, tipo, taller o propietario).
- Documentos con vencimiento próximo (30 días).
- Acciones rápidas:
  - "Ver historial completo" → Timeline.
  - "Registrar servicio" → Formulario de CareEpisode del propietario.
  - "Gestionar documentos" → Sección de documentos.
  - "Gestionar fotos" → Galería de fotos.

**Criterios de aceptación:**
- Dado que soy propietario de un vehículo, cuando accedo a su dashboard, entonces veo toda la información resumida.
- Dado que el vehículo no tiene foto, entonces se muestra un placeholder con las iniciales del vehículo.
- Dado que el vehículo no tiene CareEpisodes, entonces se muestra "Sin servicios registrados" con un botón para registrar el primero.
- Dado que no hay documentos próximos a vencer, entonces no se muestra la sección de documentos.
- Dado que hay documentos próximos a vencer, entonces se muestran alertas amarillas.
- Dado que hay documentos vencidos, entonces se muestran alertas rojas.

---

### 6.2 F2: Timeline del Vehículo

**Descripción:** Línea de tiempo cronológica con todos los eventos registrados del vehículo.

**Problema:** No existe una vista que muestre la historia completa del vehículo de forma ordenada.

**User Story:**
> Como propietario, quiero ver una línea de tiempo con todos los eventos de mi vehículo, para entender su historia completa.

**Tipos de eventos en el Timeline:**
| Tipo | Fuente | Icono | Descripción |
|---|---|---|---|
| CareEpisode (taller) | Workshop | 🔧 | Atención registrada por un taller |
| CareEpisode (propietario) | Owner | 🏠 | Servicio registrado por el propietario |
| Kilometraje | Owner / Workshop | 📏 | Registro de lectura del odómetro |
| Documento | Owner | 📄 | Documento registrado o actualizado |
| Foto | Owner | 📷 | Foto agregada al vehículo |
| Transferencia | System | 🔄 | Cambio de propiedad del vehículo |

**Estructura de cada evento en el Timeline:**
```
[Icono] [Fecha]
[Título del evento]
[Descripción breve]
[Registrado por: nombre del actor]
[Nivel de confianza: verificar / propietario]
```

**Filtros disponibles:**
- Por tipo de evento (CareEpisode, kilómetro, documento, foto).
- Por rango de fechas.
- Por actor (propietario, taller específico).
- Por búsqueda de texto.

**Criterios de aceptación:**
- Dado que el vehículo tiene eventos, cuando accedo al timeline, entonces veo los eventos ordenados de más reciente a más antiguo.
- Dado que el vehículo no tiene eventos, entonces veo un estado vacío con "No hay eventos registrados" y un botón "Registrar primer servicio".
- Dado que filtro por tipo, entonces solo veo eventos de ese tipo.
- Dado que busco por texto, entonces veo eventos que coincidan con la búsqueda.
- Dado que un CareEpisode fue registrado por un taller, entonces veo el nombre del taller y un indicador de confianza.
- Dado que un CareEpisode fue registrado por el propietario, entonces veo "Registrado por ti" y un indicador de confianza.

---

### 6.3 F3: Registro de Servicio del Propietario

**Descripción:** Formulario para que el propietario registre un servicio que realizó por su cuenta.

**Problema:** El propietario no puede registrar servicios que realiza sin pasar por un taller.

**User Story:**
> Como propietario, quiero registrar un servicio que realicé yo mismo en mi veículo, para que quede en su historial.

**Tipos de servicio disponibles para el propietario:**
| Categoría | Servicios |
|---|---|
| **Motor** | Cambio de aceite, cambio de filtro de aceite, cambio de filtro de aire, cambio de bujías, cambio de correa de distribución |
| **Frenos** | Cambio de balatas, cambio de discos, cambio de líquido de frenos, sangrado de frenos |
| **Neumáticos** | Cambio de llantas, rotación de llantas, alineación, balanceo, parche |
| **Eléctrico** | Cambio de batería, cambio de fusibles, revisión de luces |
| **Suspensión** | Cambio de amortiguadores, cambio de rótulas, cambio de bujes |
| **Transmisión** | Cambio de aceite de caja, cambio de filtro de transmisión |
| **Enfriamiento** | Cambio de líquido refrigerante, limpieza de radiador, cambio de manguera |
| **Carrocería** | Lavado interior/exterior, pulido, corrección de pintura |
| **Documentación** | Renovación de seguro, revisión técnico-mecánica, permiso de circulación |
| **Otro** | Servicio no listado (requiere descripción libre) |

**Criterios de aceptación:**
- Dado que soy propietario, cuando selecciono "Registrar servicio", entonces veo el formulario con los campos obligatorios y opcionales.
- Dado que selecciono un tipo de servicio, entonces se preselecciona la categoría.
- Dado que registro un servicio, entonces se crea un CareEpisode con `source: "owner"`.
- Dado que registro un servicio, entonces aparece en la timeline del vehículo.
- Dado que registro un servicio con costo, entonces el costo se refleja en el dashboard del vehículo.
- Dado que adjunto fotos, entonces las fotos se asocian al CareEpisode.
- Dado que no completo los campos obligatorios, entonces el formulario no se envía.

---

### 6.4 F4: Detalle del CareEpisode

**Descripción:** Vista detallada de un CareEpisode específico.

**Problema:** El propietario necesita ver todos los detalles de una atención registrada.

**User Story:**
> Como propietario, quiero ver todos los detalles de un CareEpisode, para entender qué se hizo en esa atención.

**Información a mostrar:**
- Fecha del servicio.
- Tipo de servicio / categoría.
- Descripción detallada.
- Kilometraje al momento del servicio.
- Costo total.
- Quién lo registró (taller o propietario).
- Nivel de confianza del registrante.
- Diagnóstico (si existe).
- Evidencias / fotos (si existen).
- Garantía (si existe).
- Recomendaciones (si existen).
- Documentos adjuntos (si existen).

**Acciones disponibles:**
- Editar (si soy el propietario y es un CareEpisode propio).
- Eliminar (si soy el propietario y es un CareEpisode propio, con confirmación).
- Compartir (si soy propietario).

**Criterios de aceptación:**
- Dado que selecciono un CareEpisode en el timeline, entonces veo su detalle completo.
- Dado que el CareEpisode fue registrado por un taller, entonces veo la información del taller (nombre, dirección, teléfono).
- Dado que el CareEpisode fue registrado por mí, entonces veo "Registrado por ti" y puedo editarlo.
- Dado que intento eliminar un CareEpisode, entonces veo una confirmación.
- Dado que elimino un CareEpisode, entonces se hace soft-delete y se registra quién lo eliminó.

---

### 6.5 F5: Gestión de Documentos del Vehículo

**Descripción:** Panel para gestionar los documentos asociados al vehículo.

**Problema:** Los documentos existen en el schema pero la UX no es óptima.

**User Story:**
> Como propietario, quiero gestionar los documentos de mi vehículo, para tenerlos organizados y saber cuándo vencen.

**Categorías de documentos:**
| Categoría | Ejemplos |
|---|---|
| **Seguro** | Póliza de seguro, póliza SOAT |
| **Revisión** | Revisión técnico-mecánica, revisión de emisiones |
| **Permiso** | Permiso de circulación, impuesto vehicular |
| **Título** | Tarjeta de circulación, título de propiedad |
| **Otro** | Contrato de compra-venta, factura, otro documento |

**Información del documento:**
- Categoría.
- Nombre/descripción.
- Fecha de emisión.
- Fecha de vencimiento (si aplica).
- Número de póliza / referencIa.
- Archivo digital (PDF, imagen).
- Notas adicionales.

**Estados del documento:**
| Estado | Condición | Visual |
|---|---|---|
| Vigente | No vencido y más de 30 días para vencer | 🟢 Verde |
| Próximo a vencer | Vence en menos de 30 días | 🟡 Amarillo |
| Vencido | Fecha de vencimiento pasada | 🔴 Rojo |
| Sin vencimiento | No tiene fecha de vencimiento | ⚪ Gris |

**Criterios de aceptación:**
- Dado que accedo a la gestión de documentos, entonces veo la lista de documentos con su estado.
- Dado que agrego un documento, entonces puedo subir el archivo e ingresar la información.
- Dado que un documento vence en 30 días, entonces recibo una notificación.
- Dado que un documento está vencido, entonces se muestra con alerta roja.
- Dado que elimino un documento, entonces se hace soft-delete.
- Dado que descargo un documento, entonces se descarga el archivo original.

---

### 6.6 F6: Gestión de Fotos del Vehículo

**Descripción:** Galería de fotos asociadas al vehículo.

**Problema:** Las fotos existen en el schema pero no hay una galería funcional.

**User Story:**
> Como propietario, quiero ver y gestionar las fotos de mi vehículo, para documentar su estado visual.

**Tipos de fotos:**
| Tipo | Descripción |
|---|---|
| **Perfil** | Foto principal del vehículo (se muestra en listas y dashboard) |
| **Galería** | Fotos adicionales del vehículo |
| **Evidencia** | Fotos asociadas a un CareEpisode específico |

**Información de cada foto:**
- Archivo de imagen.
- Caption opcional.
- Fecha de carga.
- Asociación (perfil, galería, CareEpisode específico).

**Criterios de aceptación:**
- Dado que accedo a la galería, entonces veo todas las fotos del vehículo en orden cronológico.
- Dado que selecciono una foto como "principal", entonces se muestra en el dashboard y en listas.
- Dado que agrego una foto con caption, entonces el caption se muestra al superponer.
- Dado que elimino una foto, entonces se elimina del almacenamiento y de la galería.
- Dado que una foto está asociada a un CareEpisode, entonces se muestra en el detalle de ese CareEpisode.

---

### 6.7 F7: Registro de Kilometraje

**Descripción:** Formulario para registrar una nueva lectura del odómetro.

**Problema:** El kilometraje se puede registrar pero la UX no es directa.

**User Story:**
> Como propietario, quiero registrar el kilometraje actual de mi vehículo, para mantener su historial actualizado.

**Información a registrar:**
- Valor del odómetro (km).
- Fecha de la lectura.
- Fuente: "Propietario" (automático).
- Notas opcionales.

**Validaciones:**
- El nuevo kilometraje debe ser mayor al último registrado.
- No puede ser más de 10.000 km mayor al último registrado (protección contra errores de captura).

**Criterios de aceptación:**
- Dado que registro un kilometraje, entonces se guarda con fecha actual y fuente "Propietario".
- Dado que el kilometraje ingresado es menor al último registrado, entonces veo un error.
- Dado que el kilometraje es más de 10.000 km mayor al último, entonces veo una confirmación.
- Dado que registro un kilometraje, entonces se actualiza el dashboard del vehículo.
- Dado que registro un kilometraje, entonces aparece en la timeline.

---

### 6.8 F8: Selector Rápido de Vehículos

**Descripción:** Componente de navegación para cambiar entre vehículos.

**Problema:** El propietario con múltiples vehículos necesita cambiar entre ellos sin volver a la lista completa.

**User Story:**
> Como propietario con múltiples vehículos, quiero cambiar rápidamente entre ellos, para no tener que navegar desde la lista.

**Comportamiento:**
- Dropdown o sidebar con la lista de vehículos del propietario.
- Cada ítem muestra: foto miniatura + patente + marca/modelo.
- El vehículo actual está resaltado.
- Al seleccionar otro vehículo, la vista se actualiza con sus datos.

**Criterios de aceptación:**
- Dado que tengo más de un vehículo, entonces el selector está visible.
- Dado que selecciono un vehículo del selector,则 la vista se actualiza sin recarga completa.
- Dado que tengo un solo vehículo, entonces el selector no se muestra.
- Dado que estoy en el dashboard,则 el selector muestra el vehículo actual como seleccionado.

---

## 7. User Journeys detallados

### 7.1 Journey Principal: Consultar el historial de mi vehículo

```
Actor: Propietario autenticado
Contexto: Personal
  │
  ▼
Desde: Lista de mis vehículos (/dashboard/vehicles)
  │
  ▼
Selecciona: Un vehículo específico
  │
  ▼
Sistema muestra: Dashboard del vehículo
  ├── Foto principal
  ├── Datos básicos (marca, modelo, versión, año, color)
  ├── Kilometraje actual
  ├── Último CareEpisode registrado
  ├── Documentos próximos a vencer
  └── Acciones rápidas
  │
  ▼
Propietario accede: "Ver historial completo"
  │
  ▼
Sistema muestra: Timeline del vehículo
  ├── CareEpisodes (atenciones en talleres)
  ├── CareEpisodes (servicios propios)
  ├── Registro de kilometraje
  ├── Documentos registrados
  └── Fotos
  │
  ▼
Propietario puede: Filtrar por tipo, fecha, o buscar
  │
  ▼
Propietario selecciona: Un CareEpisode específico
  │
  ▼
Sistema muestra: Detalle del CareEpisode
  ├── Fecha, tipo, descripción
  ├── Kilometraje
  ├── Costo
  ├── Quién lo registró
  ├── Evidencias / fotos
  └── Garantía / recomendaciones
  │
  ▼
Resultado: Propietario tiene visibilidad completa del historial vehicular
```

### 7.2 Journey: Registrar un servicio propio

```
Actor: Propietario
Contexto: Personal
  │
  ▼
Desde: Dashboard del vehículo
  │
  ▼
Selecciona: "Registrar servicio"
  │
  ▼
Sistema muestra: Formulario de CareEpisode del propietario
  ├── Tipo de servicio (select con categorías)
  ├── Fecha del servicio
  ├── Kilometraje actual
  ├── Descripción
  ├── Costo (opcional)
  └── Fotos (opcional)
  │
  ▼
Propietario completa: Campos obligatorios y opcionalmente los opcionales
  │
  ▼
Propietario envía: "Guardar"
  │
  ▼
Sistema valida: Campos obligatorios, kilometraje coherente
  │
  ▼
Sistema registra: CareEpisode con source="owner"
  │
  ▼
Sistema muestra: Confirmación y redirect al timeline
  │
  ▼
Resultado: Servicio registrado aparece en la timeline del vehículo
```

### 7.3 Journey: Agregar un documento

```
Actor: Propietario
Contexto: Personal
  │
  ▼
Desde: Dashboard del vehículo → "Gestionar documentos"
  │
  ▼
Selecciona: "Agregar documento"
  │
  ▼
Sistema muestra: Formulario de documento
  ├── Categoría (select: seguro, revisión, permiso, título, otro)
  ├── Nombre/descripción
  ├── Fecha de emisión
  ├── Fecha de vencimiento (si aplica)
  ├── Número de póliza / referencia
  ├── Archivo (upload)
  └── Notas (opcional)
  │
  ▼
Propietario completa: Campos y sube archivo
  │
  ▼
Propietario envía: "Guardar"
  │
  ▼
Sistema valida: Categoría, archivo, fechas coherentes
  │
  ▼
Sistema registra: VehicleDocument
  │
  ▼
Sistema muestra: Documento en la lista con estado
  │
  ▼
Resultado: Documento registrado, visible en dashboard y con alerta de vencimiento
```

### 7.4 Journey: Registrar kilometraje

```
Actor: Propietario
Contexto: Personal
  │
  ▼
Desde: Dashboard del vehículo → "Actualizar kilometraje"
  │
  ▼
Sistema muestra: Formulario de kilometraje
  ├── Valor del odómetro
  ├── Fecha (prellenada con fecha actual)
  └── Notas (opcional)
  │
  ▼
Propietario ingresa: Valor del odómetro
  │
  ▼
Sistema valida: Mayor al último registrado, no más de 10.000 km mayor
  │
  ▼
Propietario envía: "Guardar"
  │
  ▼
Sistema registra: VehicleMileage con source="owner"
  │
  ▼
Sistema actualiza: Kilometraje en dashboard y en timeline
  │
  ▼
Resultado: Kilometraje actualizado y registrado en el historial
```

### 7.5 Journey: Compartir historial del vehículo

```
Actor: Propietario
Contexto: Personal
  │
  ▼
Desde: Dashboard del vehículo → "Compartir historial"
  │
  ▼
Sistema muestra: Opciones de compartición
  ├── Compartir con un taller específico
  ├── Compartir con un comprador potencial
  └── Generar enlace público (con expiración)
  │
  ▼
Propietario selecciona: Opción y destinatario
  │
  ▼
Sistema genera: Token de compartición con permisos y expiración
  │
  ▼
Sistema envía: Notificación o enlace al destinatario
  │
  ▼
Resultado: Historial accesible para el destinatario autorizado
```

---

## 8. Flujos de UX y pantallas

### 8.1 Mapa de pantallas

```
/login
/register
/forgot-password
/reset-password
/verify-email
/dashboard
  ├── /dashboard/vehicles                    ← Lista de vehículos
  ├── /dashboard/vehicles/new                ← Registro de vehículo
  ├── /dashboard/vehicles/:id                ← Dashboard del vehículo
  ├── /dashboard/vehicles/:id/timeline       ← Timeline del vehículo
  ├── /dashboard/vehicles/:id/timeline/:id   ← Detalle del CareEpisode
  ├── /dashboard/vehicles/:id/documents      ← Gestión de documentos
  ├── /dashboard/vehicles/:id/photos         ← Galería de fotos
  ├── /dashboard/vehicles/:id/mileage        ← Historial de kilometraje
  ├── /dashboard/vehicles/:id/share          ← Compartir historial
  ├── /dashboard/vehicles/:id/edit           ← Editar vehículo
  ├── /dashboard/vehicles/:id/services/new   ← Registrar servicio propio
  └── /dashboard/profile                     ← Perfil del usuario
```

### 8.2 Flujo de navegación del propietario

```
Login
  │
  ▼
Dashboard principal (resumen de todos los vehículos)
  │
  ├─── Seleccionar vehículo
  │       │
  │       ▼
  │    Dashboard del vehículo
  │       │
  │       ├─── Ver historial → Timeline
  │       │       │
  │       │       ├─── Seleccionar evento → Detalle del CareEpisode
  │       │       │       │
  │       │       │       ├─── Editar (si es propio)
  │       │       │       ├─── Eliminar (si es propio, con confirmación)
  │       │       │       └─── Compartir
  │       │       │
  │       │       └─── Filtrar / Buscar
  │       │
  │       ├─── Registrar servicio → Formulario de CareEpisode
  │       │       │
  │       │       └─── Guardar → Confirmación → Timeline
  │       │
  │       ├─── Gestionar documentos → Lista de documentos
  │       │       │
  │       │       ├─── Agregar documento → Formulario
  │       │       ├─── Ver documento → Detalle
  │       │       ├─── Editar documento → Formulario
  │       │       └─── Eliminar documento → Confirmación
  │       │
  │       ├─── Gestionar fotos → Galería
  │       │       │
  │       │       ├─── Agregar foto → Upload
  │       │       ├─── Establecer como principal
  │       │       └─── Eliminar foto → Confirmación
  │       │
  │       ├─── Actualizar kilometraje → Formulario
  │       │
  │       ├─── Compartir historial → Opciones de compartición
  │       │
  │       └─── Editar vehículo → Formulario de edición
  │
  ├─── Registrar nuevo vehículo → Formulario de registro
  │
  └─── Mi perfil → Edición de perfil
```

### 8.3 Estructura del Dashboard del vehículo

```
┌─────────────────────────────────────────────────────┐
│ [Foto]  Toyota Corolla XEI 2020                     │
│         Patente: ABC-1234                           │
│         Color: Gris metálico                        │
│         VIN: JTDKN3DU5A0123456 (parcialmente oculto)│
├─────────────────────────────────────────────────────┤
│                                                     │
│  📏 Kilometraje: 45.230 km                         │
│  📋 Servicios registrados: 12                       │
│  🔧 Último servicio: 15/08/2026 - Cambio de aceite  │
│     Registrado por: Taller Central                  │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ⚠️ Documentos próximos a vencer:                   │
│     🟡 Seguro vence en 15 días (24/09/2026)         │
│     🔴 Revisión vencida (01/09/2026)                │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Ver historial]  [Registrar servicio]              │
│  [Documentos]     [Fotos]                           │
│  [Kilometraje]    [Compartir]                       │
└─────────────────────────────────────────────────────┘
```

### 8.4 Estructura del Timeline

```
┌─────────────────────────────────────────────────────┐
│ Historial del vehículo                    [Filtros] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ── Septiembre 2026 ────────────────────────────   │
│                                                     │
│  📏 05/09/2026 - Kilometraje: 45.230 km            │
│     Registrado por: Tú                              │
│                                                     │
│  ── Agosto 2026 ────────────────────────────────   │
│                                                     │
│  🔧 15/08/2026 - Cambio de aceite y filtro          │
│     Taller Central · Registrado por: Taller Central │
│     ✓ Verificado                                    │
│                                                     │
│  🏠 10/08/2026 - Rotación de llantas                │
│     Registrado por: Tú                              │
│     ℹ Propietario                                   │
│                                                     │
│  📄 05/08/2026 - Seguro actualizado                 │
│     Póliza: ABC-789012                              │
│                                                     │
│  ── Julio 2026 ─────────────────────────────────   │
│                                                     │
│  🔧 20/07/2026 - Revisión de frenos                 │
│     Taller El Motor · Registrado por: Taller        │
│     ✓ Verificado                                    │
│     💰 $150.000                                     │
│                                                     │
│  📷 15/07/2026 - Foto del vehículo                  │
│     Caption: "Después de la pintura"                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 8.5 Estructura del Formulario de CareEpisode (Propietario)

```
┌─────────────────────────────────────────────────────┐
│ Registrar servicio propio                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Tipo de servicio *                                 │
│  ┌─────────────────────────────────────────────┐    │
│  │ Seleccionar tipo...                         │    │
│  └─────────────────────────────────────────────┘    │
│  (Select con búsqueda: Cambio de aceite, etc.)      │
│                                                     │
│  Fecha del servicio *                               │
│  ┌─────────────────────────────────────────────┐    │
│  │ 09/09/2026                                  │    │
│  └─────────────────────────────────────────────┘    │
│  (Date picker, fecha actual por defecto)            │
│                                                     │
│  Kilometraje actual *                               │
│  ┌─────────────────────────────────────────────┐    │
│  │ 45230                                       │    │
│  └─────────────────────────────────────────────┘    │
│  (Número, prellenado con último registrado)         │
│                                                     │
│  Descripción                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │                                             │    │
│  │                                             │    │
│  └─────────────────────────────────────────────┘    │
│  (Textarea, opcional)                               │
│                                                     │
│  Costo (opcional)                                   │
│  ┌─────────────────────────────────────────────┐    │
│  │ $                                           │    │
│  └─────────────────────────────────────────────┘    │
│  (Número con prefijo de moneda)                     │
│                                                     │
│  Fotos (opcional)                                   │
│  ┌─────────────────────────────────────────────┐    │
│  │  [+] Agregar foto                           │    │
│  └─────────────────────────────────────────────┘    │
│  (Upload de imágenes, máximo 5)                     │
│                                                     │
│  ────────────────────────────────────────────────   │
│                                                     │
│  [Cancelar]                    [Guardar servicio]   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 9. Formularios

### 9.1 Formulario: Registro de vehículo (existente, referencia)

**Campos:**
| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| Marca | Select (catálogo) | Sí | Debe existir en VehicleBrand |
| Modelo | Select (catálogo, dependiente de marca) | Sí | Debe existir en VehicleModel |
| Versión | Select (catálogo, dependiente de modelo) | Sí | Debe existir en VehicleVersion |
| Año de fabricación | Number | Sí | 1900 - año actual + 1 |
| Año modelo | Number | Sí | 1900 - año actual + 1 |
| Color | Text | No | Max 50 chars |
| Patente | Text | No* | Formato según jurisdicción |
| VIN | Text | No* | 17 caracteres, alfanumérico |

*La patente y VIN son opcionales para el registro inicial según Decision 0.5.

### 9.2 Formulario: CareEpisode del propietario (nuevo)

**Campos:**
| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| Tipo de servicio | Select (catálogo predefinido) | Sí | Debe seleccionar un tipo válido |
| Fecha del servicio | Date | Sí | No futura, no anterior a 1900 |
| Kilometraje actual | Number | Sí | > 0, >= último registrado, <= último + 10.000 |
| Descripción | Textarea | No | Max 2000 chars |
| Costo | Number | No | >= 0, max 2 decimales |
| Fotos | File upload | No | Max 5 archivos, max 10MB cada uno, formatos: jpg, png, webp |

### 9.3 Formulario: Documento del vehículo (nuevo)

**Campos:**
| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| Categoría | Select | Sí | seguro, revisión, permiso, título, otro |
| Nombre/descripción | Text | Sí | Max 200 chars |
| Fecha de emisión | Date | Sí | No futura |
| Fecha de vencimiento | Date | No | >= fecha de emisión |
| Número de póliza/referencia | Text | No | Max 100 chars |
| Archivo | File upload | Sí | Max 1 archivo, max 20MB, formatos: pdf, jpg, png |
| Notas | Textarea | No | Max 1000 chars |

### 9.4 Formulario: Kilometraje (nuevo)

**Campos:**
| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| Valor del odómetro | Number | Sí | > 0, > último registrado, <= último + 10.000 |
| Fecha | Date | Sí | No futura |
| Notas | Textarea | No | Max 500 chars |

### 9.5 Formulario: Foto del vehículo (nuevo)

**Campos:**
| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| Archivo | File upload | Sí | Max 1 archivo, max 10MB, formatos: jpg, png, webp |
| Caption | Text | No | Max 200 chars |
| Establecer como principal | Checkbox | No | Default: false |

---

## 10. Estados y transiciones

### 10.1 CareEpisode (fuente: propietario)

```
                    ┌──────────────┐
                    │   Created    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Active  │ │  Edited  │ │ Deleted  │
        └────┬─────┘ └────┬─────┘ └──────────┘
             │            │
             └─────┬──────┘
                   ▼
             ┌──────────┐
             │  Active  │
             └──────────┘
```

**Transiciones:**
- Created → Active: Al guardar exitosamente.
- Active → Edited → Active: Al editar (con registro de edición).
- Active → Deleted: Al eliminar (soft-delete con registro).

### 10.2 Documento del vehículo

```
    ┌──────────┐
    │ Uploaded │
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │  Active  │
    └────┬─────┘
         │
    ┌────┼────┬─────────┐
    ▼    ▼    ▼         ▼
┌──────┐ ┌──────┐ ┌──────────┐
│Edit  │ │Vence │ │ Deleted  │
└──┬───┘ └──────┘ └──────────┘
   │
   ▼
┌──────────┐
│  Active  │
└──────────┘
```

### 10.3 Vehículo

```
    ┌──────────┐
    │ Created  │
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │  Active  │
    └────┬─────┘
         │
    ┌────┴────────┐
    ▼             ▼
┌──────────┐ ┌──────────┐
│  Edited  │ │Transferred│
└────┬─────┘ └────┬─────┘
     │            │
     └─────┬──────┘
           ▼
    ┌──────────┐
    │  Active  │
    └────┬─────┘
         │
         ▼
    ┌──────────┐
    │ Deleted  │ (soft-delete)
    └──────────┘
```

---

## 11. Decisiones de producto pendientes

### 11.1 CareEpisode del propietario

| # | Decisión | Opciones | Recomendación | Estado |
|---|---|---|---|---|
| 1 | ¿El CareEpisode del propietario tiene la misma estructura que el del taller? | Sí / No | **Sí**, pero con source="owner" y sin workshopId | Pendiente |
| 2 | ¿Qué tipos de servicio puede registrar el propietario? | Catálogo limitado / Libre | **Catálogo limitado** | Pendiente |
| 3 | ¿El propietario puede editar CareEpisodes de talleres? | No / Sí, con auditoría | **No** (solo los propios) | Pendiente |
| 4 | ¿El propietario puede eliminar CareEpisodes? | No / Sí, soft-delete | **Sí, soft-delete** (solo los propios) | Pendiente |
| 5 | ¿Los CareEpisodes del propietario tienen nivel de confianza? | Sí / No | **Sí**, heredado del Trust Profile del propietario | Pendiente |

### 11.2 Documentos

| # | Decisión | Opciones | Recomendación | Estado |
|---|---|---|---|---|
| 6 | ¿Los documentos se cargan manualmente o se integran con algún servicio? | Manual / Integración | **Manual** para MVP | Pendiente |
| 7 | ¿Se envían notificaciones de vencimiento? | Sí / No | **Sí**, email + in-app | Pendiente |
| 8 | ¿Con cuántos días de anticipación se notifica? | 30 / 15 / 7 días | **30 días** | Pendiente |

### 11.3 Timeline

| # | Decisión | Opciones | Recomendación | Estado |
|---|---|---|---|---|
| 9 | ¿Se muestran CareEpisodes de talleres en la timeline del propietario? | Sí / Solo si autorizado | **Sí**, si el taller registró sobre ese vehículo | Pendiente |
| 10 | ¿Se muestran otros eventos (transferencias, etc.)? | Sí / No | **Sí** | Pendiente |
| 11 | ¿El timeline se proyecta o se almacena? | Proyectado / Almacenado | **Proyectado** (según Decision 1.10) | Pendiente |

### 11.4 Compartición

| # | Decisión | Opciones | Recomendación | Estado |
|---|---|---|---|---|
| 12 | ¿El propietario puede compartir el historial completo? | Sí / Solo parcial | **Sí**, completo | Pendiente |
| 13 | ¿Se puede compartir con compradores potenciales? | Sí / No | **Sí**, con expiración | Pendiente |
| 14 | ¿Se puede generar enlace público? | Sí / No | **Sí**, con expiración y límite de vistas | Pendiente |

### 11.5 Multi-vehículo

| # | Decisión | Opciones | Recomendación | Estado |
|---|---|---|---|---|
| 15 | ¿Cuántos vehículos puede tener un propietario? | Ilimitado / Limitado por plan | **Ilimitado** para MVP | Pendiente |
| 16 | ¿Se puede transferir la propiedad dentro del sistema? | Sí / No | **Sí**, ya existe VehicleTransfer | Pendiente |

---

## 12. Priorización y roadmap

### 12.1 Fases de implementación

#### Fase 1: Dashboard del Vehículo (CRÍTICO)

**Objetivo:** El propietario puede ver un resumen de su vehículo.

**Funcionalidades:**
- Pantalla de detalle del vehículo.
- Datos básicos del perfil.
- Kilometraje actual.
- Último CareEpisode.
- Documentos con vencimiento.
- Acciones rápidas.

**Dependencias:**
- Vehicle CRUD existente.
- VehicleMileage existente.
- VehicleDocument existente.

**Esperado:** 2-3 semanas.

#### Fase 2: Timeline del Vehículo (CRÍTICO)

**Objetivo:** El propietario puede ver la historia completa del vehículo.

**Funcionalidades:**
- Vista cronológica de eventos.
- CareEpisodes (taller y propietario).
- Kilometraje.
- Documentos.
- Fotos.
- Filtros y búsqueda.

**Dependencias:**
- Modelo CareEpisode (requiere implementación).
- Integración con eventos existentes.

**Esperado:** 4-6 semanas.

#### Fase 3: Registro de Servicio del Propietario (ALTA)

**Objetivo:** El propietario puede registrar servicios propios.

**Funcionalidades:**
- Formulario de CareEpisode con source="owner".
- Catálogo de tipos de servicio.
- Validaciones.
- Integración con Timeline.

**Dependencias:**
- Modelo CareEpisode implementado.
- Timeline implementado.

**Esperado:** 2-3 semanas.

#### Fase 4: Gestión de Documentos (ALTA)

**Objetivo:** El propietario puede gestionar documentos con vencimiento.

**Funcionalidades:**
- Lista de documentos con estado.
- Formulario de documento.
- Upload de archivos.
- Alertas de vencimiento.

**Dependencias:**
- VehicleDocument existente.
- Storage existente.

**Esperado:** 2 semanas.

#### Fase 5: Multi-vehículo con Selector (MEDIA)

**Objetivo:** El propietario puede cambiar entre vehículos fácilmente.

**Funcionalidades:**
- Selector rápido de vehículos.
- Navegación fluida.

**Dependencias:**
- Dashboard del vehículo implementado.

**Esperado:** 1 semana.

#### Fase 6: Gestión de Fotos (MEDIA)

**Objetivo:** El propietario puede gestionar fotos del vehículo.

**Funcionalidades:**
- Galería de fotos.
- Upload de fotos.
- Foto principal.
- Asociación a CareEpisodes.

**Dependencias:**
- VehiclePhoto existente.
- Storage existente.

**Esperado:** 1-2 semanas.

#### Fase 7: Kilometraje con Historial (MEDIA)

**Objetivo:** El propietario puede registrar y consultar kilometraje.

**Funcionalidades:**
- Formulario de kilometraje.
- Historial de lecturas.
- Validaciones.

**Dependencias:**
- VehicleMileage existente.

**Esperado:** 1 semana.

### 12.2 Resumen de priorización

| Fase | Funcionalidad | Prioridad | Dependencias | Estimación |
|---|---|---|---|---|
| 1 | Dashboard del vehículo | **CRÍTICA** | Mínimas | 2-3 semanas |
| 2 | Timeline del vehículo | **CRÍTICA** | CareEpisode model | 4-6 semanas |
| 3 | Registro servicio propietario | **ALTA** | CareEpisode + Timeline | 2-3 semanas |
| 4 | Gestión de documentos | **ALTA** | Mínimas | 2 semanas |
| 5 | Multi-vehículo selector | **MEDIA** | Dashboard | 1 semana |
| 6 | Gestión de fotos | **MEDIA** | Mínimas | 1-2 semanas |
| 7 | Kilometraje historial | **MEDIA** | Mínimas | 1 semana |

### 12.3 Post-MVP

| Funcionalidad | Prioridad | Notas |
|---|---|---|
| Recordatorios de vencimiento | Post-MVP | Notificaciones push + email |
| Reportes y gráficos | Post-MVP | Costos, tendencias, estadísticas |
| Exportación de historial | Post-MVP | PDF, CSV |
| Checklist de inspección | Post-MVP | Formularios personalizados |
| Búsqueda avanzada | Post-MVP | Filtros complejos, búsqueda por rango |
| Notificaciones in-app | Post-MVP | Centro de notificaciones |
| Perfil del propietario mejorado | Post-MVP | Datos de contacto, preferencias |
| Historial de edición | Post-MVP | Auditoría completa de cambios |
| Compartir con talleres | Post-MVP | Flujo de autorización para talleres |
| Comparación de vehículos | Post-MVP | Side-by-side de dos vehículos |

### 12.4 Futuro

| Funcionalidad | Notas |
|---|---|
| Recordatorios inteligentes | Basados en kilometraje y tiempo |
| Integración con talleres | El taller registra CareEpisodes que aparecen en el timeline del propietario |
| Verificación de documentos | Integración con organismos oficiales |
| Marketplace de talleres | El propietario encuentra talleres verificados |
| Historial portátil | Exportar/importar historial entre plataformas |
| API pública | Para integraciones con terceros |
| App móvil | Experiencia nativa para registro rápido |
| Gamificación | Insignias por mantenimiento regular |
| IA predictiva | Predicción de mantenimiento basada en historial |
| Vehículo como NFT | Identidad digital verificable en blockchain (futuro lejano) |

---

## 13. Qué NO copiar de DRIVVO

| Funcionalidad DRIVVO | Por qué NO aplica a HCDV |
|---|---|
| **Registro de combustible** | HCDV es historia clínica, no tracker de gastos de combustible. El combustible no es una intervención sobre el vehículo. |
| **Registro de gastos categorizados** | HCDV se enfoca en historia clínica, no en contabilidad del propietario. Los costos en CareEpisode son secundarios. |
| **Registro de ingresos** | No es relevante para la historia vehicular. |
| **Rutas y viajes** | No es el foco del producto. HCDV no trackea movimientos. |
| **Checklists de inspección** | Podría existir en el futuro, pero no es core del MVP. |
| **Gestión de flotas** | HCDV no es software de flotas. |
| **Control de conductores** | El modelo de actores de HCDV es diferente (Identity, no User como conductor). |
| **Reportes financieros** | HCDV no es herramienta contable. |
| **Integración con apps de transporte** | No es relevante para la historia clínica vehicular. |
| **Control de gasto por viaje** | No es el foco del producto. |
| **Modo offline** | DRIVVO es mobile-first con offline. HCDV prioriza la confiabilidad del dato sobre la disponibilidad offline. |
| **Sincronización entre dispositivos** | DRIVVO resuelve esto porque es una app individual. HCDV es una plataforma web con autenticación centralizada. |

---

## 14. Principios UX derivados

### 14.1 Principios de UX para HCDV

| # | Principio | Descripción |
|---|---|---|
| 1 | **El vehículo es el centro** | Toda navegación parte del vehículo. No del taller, no del usuario, no del servicio. |
| 2 | **El Timeline es la pantalla principal** | La historia del vehículo es el producto. El Timeline debe ser la experiencia central. |
| 3 | **Registro rápido** | Los formularios deben ser simples. Menos campos es mejor. Completar después. |
| 4 | **Trazabilidad visible** | Siempre mostrar quién registró cada evento. El propietario debe saber si es propio o de un taller. |
| 5 | **Confianza transparente** | El nivel de confianza del registrante debe ser visible pero no intrusivo. |
| 6 | **Documentos con estado** | Los documentos deben mostrar su estado visualmente (verde/amarillo/rojo). |
| 7 | **Multi-vehículo fluido** | Cambiar entre vehículos debe ser instantáneo. No pantallas intermedias. |
| 8 | **Progresividad** | Solicitar información cuando aporta valor. No exigir todo al inicio. |
| 9 | **Estado vacío útil** | Cuando no hay datos, mostrar sugerencias accionables, no pantallas vacías. |
| 10 | **Acciones contextuales** | Las acciones disponibles deben depender de quién es el actor y qué está viendo. |

### 14.2 Patrones UX a implementar

| Patrón | Descripción | Ejemplo en HCDV |
|---|---|---|
| **Card** | Resumen de información en una tarjeta | Dashboard del vehículo |
| **Timeline** | Eventos en línea de tiempo | Historial del vehículo |
| **Empty state** | Estado vacío con acción sugerida | "No hay servicios registrados. Registra el primero." |
| **Filter bar** | Barra de filtros persistente | Filtros del Timeline |
| **Quick action** | Botones de acción rápida | "Registrar servicio", "Actualizar kilometraje" |
| **Status badge** | Badge con estado colorido | Estado de documentos (verde/amarillo/rojo) |
| **Progressive disclosure** | Información secundaria colapsable | Detalles avanzados de un CareEpisode |
| **Confirmation dialog** | Diálogo de confirmación antes de acciones destructivas | Eliminar CareEpisode |
| **Toast notification** | Notificación temporal | "Servicio registrado exitosamente" |
| **Breadcrumb** | Navegación jerárquica | Vehicles > Corolla > Timeline > CareEpisode |

---

## Documento de referencia

Este documento se complementa con:

- **0-vision del producto.md** — Visión y principios del producto.
- **001-005 PM** — Documentos funcionales previos.
- **ADR-005** — Definición de CareEpisode.
- **features.md** — Roadmap de funcionalidades.
- **UNIFIED-BASELINE.md** — Análisis de gaps actuales.

---

**Estado del documento:** Propuesta para revisión y aprobación.
**Próximos pasos:**
1. Revisión del PM.
2. Aprobación de decisiones pendientes.
3. Traducción a historias de usuario.
4. Diseño técnico por el Tech Lead.
5. Implementación por fases.
