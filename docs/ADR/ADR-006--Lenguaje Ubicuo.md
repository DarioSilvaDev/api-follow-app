ADR-006 — Lenguaje Ubicuo (Ubiquitous Language)

Esta será una regla para todo el equipo y para los agentes.

Capa Nombre
Dominio (código) CareEpisode
Base de datos care_episodes
API / Eventos CareEpisodeCreated, CareEpisodeUpdated, CareEpisodeClosed
UI Atención (cuando representa el proceso completo)
UI (recepción) Ingreso de Servicio (cuando el vehículo llega al taller)

Con esto mantenemos un dominio consistente sin exponer terminología técnica al usuario.

Ahora sí... creo que llegamos al verdadero núcleo del SaaS

Hasta ahora definimos:

User

↓

Context

↓

Workspace

↓

Authorization

↓

CareEpisode

Pero todavía falta responder una pregunta enorme.

¿Qué es realmente un vehículo para nuestra plataforma?

Y acá quiero proponerte un cambio de paradigma.

Hoy pensamos el vehículo como un registro
Patente

Marca

Modelo

Año

Eso es un registro administrativo.

Yo quiero que pensemos el vehículo como un Activo Vivo.

¿Qué significa?

Un vehículo tiene:

identidad
propietarios
estado
salud
historial
documentación
eventos
mantenimiento futuro

No es simplemente una fila en la base de datos.
