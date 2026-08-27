# Capítulo 3 — Modelo de Dominio

## Entity Blueprint — Vehicle

```
Entidad Raíz (Root Entity)
Dominio: Core Domain
```

## 3.6 Vehicle

### Propósito

**Vehicle representa la identidad digital permanente de un vehículo dentro del ecosistema HCDV.**

No representa únicamente un automóvil físico.

Representa el activo digital sobre el cual se construye toda la historia clínica.

Su existencia es independiente de:

* propietarios,
* talleres,
* organizaciones,
* CareEpisodes,
* Workspaces.

El Vehicle es el único elemento permanente durante todo el ciclo de vida del dominio.

---

### Visión

Desde la perspectiva del negocio:

    El Vehicle es el paciente del sistema.

Toda la información existe porque ocurrió sobre ese vehículo.

No existen CareEpisodes sin Vehicle.

No existe Timeline sin Vehicle.

No existe Historia Clínica sin Vehicle.

Esta analogía con el ámbito de la salud no es un recurso de marketing; es un principio de modelado del dominio.

---

### Responsabilidades

Vehicle es responsable de:

1. **Mantener una identidad única y permanente.**

    Su identidad nunca cambia.

    Los atributos pueden evolucionar.

    La identidad no.

---

2. **Actuar como propietario lógico de la Historia Clínica.**

    Toda información histórica termina asociada al Vehicle.

---
3. **Centralizar el Timeline.**

    El Timeline oficial siempre pertenece al Vehicle.

    Nunca a un propietario.

    Nunca a un taller.

    Nunca a una organización.

4. **Ser el punto de unión entre los distintos actores.**

    El Vehicle conecta:

    * propietarios,
    * talleres,
    * concesionarios,
    * aseguradoras,
    * centros de inspección,
    * plataforma.

    Todos interactúan alrededor del mismo activo.
---

5. **Sobrevivir a los cambios del mundo real.**

    Puede cambiar:

    * propietario.
    * patente.
    * taller habitual.
    * aseguradora.

    Nada de eso altera su identidad digital.
   
---

## Vehicle NO es responsable de

Para evitar un modelo excesivamente acoplado, definimos explícitamente qué **no** debe contener.

Vehicle **no** es responsable de:

* Diagnósticos.
* Evidencias.
* Presupuestos.
* Órdenes de trabajo.
* Recomendaciones.
* Garantías.
* Participantes.
* Permisos.
* Usuarios.
* Historial de autenticación.
* Facturación.
* Configuración de Workspaces.

Toda esa información pertenece a otros conceptos del dominio.

---

## Relaciones del dominio

Vehicle mantiene relaciones de negocio con:

    CareEpisode

Un Vehicle puede tener múltiples CareEpisodes.

Todo CareEpisode pertenece exactamente a un Vehicle.

---

### Identity

Las Identity interactúan con el Vehicle mediante relaciones explícitas.

Ejemplos:

* propietario,
* conductor,
* mecánico,
* inspector,
* asesor.

No forman parte del Vehicle.

---

### Organization

Las organizaciones no poseen el Vehicle.

Interactúan con él.

Ejemplos:

* Taller.
* Concesionario.
* Aseguradora.
* Centro de inspección.

--- 

### Workspace

El Vehicle puede ser visible desde distintos Workspaces según las reglas de acceso.

El Workspace no es propietario del Vehicle.

### Invariantes

Las siguientes reglas nunca pueden romperse.

### V-001

Todo Vehicle posee una identidad canónica única.

---
### V-002

La identidad del Vehicle nunca cambia.

---

### V-003

Todo CareEpisode pertenece a exactamente un Vehicle.

---

### V-004

Eliminar un Vehicle implica una decisión excepcional y controlada.

El historial clínico constituye un activo de alto valor y no debe perderse por operaciones ordinarias.

En el MVP, mi recomendación es no permitir eliminaciones físicas. En su lugar, contemplar estados como archivado o inactivo para preservar la trazabilidad.

---

### V-005

El Vehicle es independiente del propietario actual.

Los cambios de propiedad no generan un nuevo Vehicle.

---

### Ciclo de vida

### Nacimiento

Un Vehicle nace cuando es registrado por primera vez en HCDV.

Puede registrarse con información mínima.

---

### Evolución

Durante su vida puede incorporar:

* nuevos CareEpisodes,
* nuevos identificadores externos,
* cambios de propietario,
* documentación,
* evidencias,
* relaciones con organizaciones.

Su identidad permanece constante.

---

### Finalización

Conceptualmente, un Vehicle no desaparece.

Puede:

* archivarse,
* marcarse como fuera de circulación,
* registrarse como destruido,
* declararse robado,
* indicarse como exportado.

Pero continúa formando parte de la historia del sistema.

---

### Eventos del dominio
### Produce

Ejemplos:

* VehicleRegistered
* VehicleUpdated
* VehicleArchived
* VehicleOwnershipChanged (futuro)
* VehicleStatusChanged

---

### Consume

Ejemplos:

* CareEpisodeCreated
* EvidenceAdded
* DiagnosisRegistered
* WarrantyIssued

Estos eventos enriquecen la historia del Vehicle, aunque sean emitidos por otros módulos.

--- 

### Reglas de negocio
### Regla 1

El Vehicle puede registrarse con información incompleta.

---

### Regla 2

Los datos obligatorios dependen del contexto de uso.

---
### Regla 3

VIN y patente son identificadores externos.

Nunca definen la identidad del dominio.

---

### Regla 4

La existencia de un Vehicle no depende de que existan CareEpisodes.

Un vehículo puede existir antes de recibir su primera atención.

---


### Regla 5

El historial nunca cambia de Vehicle.

Si un CareEpisode fue creado sobre un Vehicle incorrecto, deberá existir un proceso controlado de corrección. No se permitirá alterar arbitrariamente la trazabilidad histórica.

---

## Límites del dominio

Vehicle conoce:

* su identidad,
* sus atributos descriptivos,
* su estado dentro del sistema.

Vehicle no conoce:

* permisos,
* planes,
* roles,
* autenticación,
* interfaces,
* navegación.

Estos conceptos pertenecen a otros dominios.

## SPEC relacionadas

Se crearán en capítulos posteriores.

* SPEC-001 — Registro de Vehículos.
* SPEC-003 — Timeline del Vehículo.
* SPEC-00X — Gestión de Identificadores del Vehículo.

## FDC relacionadas
* FDC-001 — Custodianship.

Vehicle deberá diseñarse de forma compatible con este concepto, aunque su implementación quede fuera del MVP.