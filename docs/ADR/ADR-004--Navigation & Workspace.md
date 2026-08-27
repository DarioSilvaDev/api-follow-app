ADR-004 — Navigation & Workspace
Este documento probablemente cambie varias ideas que solemos tener cuando pensamos en un dashboard.

La mayoría de los sistemas hacen esto

Después del login:

Dashboard

↓

Sidebar

↓

Módulos

Fin.

Yo creo que nosotros deberíamos hacer esto:

Login

↓

Seleccionar Contexto

↓

Workspace

↓

Dashboard del Contexto

↓

Módulos del Contexto

Parece lo mismo.

No lo es.

El concepto de Workspace

Acá aparece un concepto que usan productos como:

Slack
Linear
Notion
GitHub
Atlassian
Vercel

No trabajan sobre usuarios.

Trabajan sobre Workspaces.

Nosotros vamos a tener algo muy parecido.

Workspace Personal

Representa la vida del propietario.

Ejemplo:

🚗 Mis Vehículos

📅 Recordatorios

📄 Documentos

🔑 Accesos Compartidos

👤 Mi Perfil

⚙ Configuración
Workspace Taller

Representa la operación del negocio.

Ejemplo:

📊 Dashboard

👥 Clientes

🚗 Vehículos

📅 Turnos

📑 Presupuestos

🔧 Órdenes de Trabajo

🛠 Inventario

👨‍🔧 Miembros

📈 Reportes

⚙ Configuración
Workspace Plataforma

Representa la administración del SaaS.

📈 Dashboard

🏢 Talleres

👤 Usuarios

💳 Suscripciones

💰 Facturación

📄 Planes

🛠 Catálogos

📜 Auditoría

⚙ Configuración
Fijate algo interesante

No existe un sidebar.

Existe un sidebar por Workspace.

Eso cambia muchísimo.

Entonces...

El menú nunca se calcula.

Viene definido por el Workspace.

Ejemplo

Personal

↓

PersonalNavigation
Workshop

↓

WorkshopNavigation
Platform

↓

PlatformNavigation

Eso hace el frontend muchísimo más simple.

Dashboard

Yo eliminaría la idea de tener un Dashboard genérico.

Tendríamos tres dashboards completamente distintos.

Dashboard Personal

Responde una sola pregunta.

¿Cómo están mis vehículos?

Podría mostrar

Mis vehículos

↓

Alertas

↓

Próximos servicios

↓

Actividad reciente

↓

Documentos por vencer

↓

Accesos compartidos

Nada del taller.

Dashboard Taller

Responde otra pregunta.

¿Cómo está funcionando mi negocio hoy?

Ejemplo

Turnos de hoy

↓

Vehículos ingresados

↓

OT abiertas

↓

Presupuestos pendientes

↓

Garantías

↓

Indicadores
Dashboard Plataforma

Responde

¿Cómo está funcionando mi SaaS?

Ejemplo

MRR

↓

Nuevos talleres

↓

Usuarios activos

↓

Errores

↓

Suscripciones

↓

Tickets

No mezclaría nunca esos mundos.

Selector de Contexto

Acá aparece uno de los componentes más importantes del frontend.

Yo lo pondría siempre arriba a la izquierda.

Algo parecido a Slack.

▼ Personal

──────────────

Personal

──────────────

Taller Central

Owner

──────────────

Lubricentro Norte

Mechanic

──────────────

Mecánica Pérez

Receptionist

──────────────

Platform

Cuando cambia

No navega.

Primero cambia el contexto.

Después cambia toda la aplicación.

Esto nos lleva a otra idea
El Workspace tiene identidad

No solamente cambia el menú.

También cambia:

Logo

Color

Nombre

Sucursal

Rol

Ejemplo

🔵 Taller Central

Owner

Casa Central

o

🟢 Lubricentro Norte

Mechanic

Sucursal Norte

Eso ayuda muchísimo a no cometer errores.

Breadcrumb

También cambia.

Ejemplo

Personal

>

Mis Vehículos

>

Toyota Corolla

o

Taller Central

>

Órdenes

>

OT-1528

Nunca aparece el usuario.

Siempre aparece el Workspace.

¿Qué pasa si un usuario pertenece a 40 talleres?

Muy buena pregunta.

No mostraría los 40.

Mostraría:

Recientes

Luego

Todos los talleres

Con buscador.

Como hace Slack.

Cambio de contexto

Yo no recargaría toda la aplicación.

Simplemente:

Selecciona contexto

↓

POST /contexts/switch (opcional, si queremos registrar métricas)

↓

Actualiza ContextStore

↓

Invalidar caches de React Query

↓

Recargar navegación

↓

Recargar dashboard
Esto implica una decisión importante para el frontend

Yo evitaría que cada pantalla pregunte:

¿Qué menú tengo?

¿Qué permisos tengo?

El frontend debería tener un único WorkspaceProvider.

Conceptualmente:

App

↓

AuthProvider

↓

WorkspaceProvider

↓

NavigationProvider

↓

Pages

Las páginas sólo consumen el Workspace actual.

Y ahora viene una idea que creo que puede convertirse en uno de los diferenciales de la plataforma
El Workspace no debería saber si está en "Personal" o "Workshop"

Sé que suena raro.

Pero imaginemos un componente:

RecentActivityWidget

Ese componente no debería preguntar:

if (workspace.type === 'WORKSHOP')

Debería recibir una fuente de datos.

En el Workspace Personal, la fuente será la actividad del propietario.

En el Workspace Taller, la fuente será la actividad operativa del taller.

En el Workspace Plataforma, la fuente será la actividad del SaaS.

El componente es el mismo.

Cambia el proveedor de datos.

Eso reduce muchísimo la cantidad de componentes duplicados y hace que el frontend sea más mantenible.
