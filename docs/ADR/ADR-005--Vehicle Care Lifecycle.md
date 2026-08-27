ADR-005 — Vehicle Care Lifecycle
Objetivo

Definir el ciclo de vida completo de una intervención sobre un vehículo.

No importa si es:

cambio de aceite
alineación
embrague
distribución
choque
electricidad
inspección

Todos siguen el mismo proceso.

Primera decisión
El mantenimiento es un Episodio

No una Orden.

No un Presupuesto.

No un Turno.

Un Episodio.

¿Por qué?

Porque un episodio puede contener muchas cosas.

Ejemplo

Cliente llega

↓

Ruido en suspensión

Se diagnostica

Amortiguadores

-

Bieletas

Se hace presupuesto.

El cliente acepta.

Se cambia todo.

Durante el trabajo encuentran:

Pérdida en caja

Se hace un segundo presupuesto.

El cliente acepta.

Se repara.

Todo pertenece al mismo episodio.

No son dos órdenes distintas.

Entonces...

El centro del modelo no debería ser la Orden.

Debería ser el Episodio.

Conceptualmente:

Vehicle

↓

Care Episode

↓

Diagnosis

↓

Estimate

↓

Work Orders

↓

Services

↓

Parts

↓

Photos

↓

Warranty

↓

Timeline

Todo cuelga del episodio.

¿Cómo nace un episodio?

Hay varias formas.

Caso 1

Turno

Reserva

↓

Llega el vehículo

↓

Nuevo episodio
Caso 2

Walk-in

Sin turno.

Entra

↓

Nuevo episodio
Caso 3

Grúa

Entra

↓

Nuevo episodio
Caso 4

Seguimiento

El cliente vuelve por una garantía.

También pertenece al episodio anterior o crea uno nuevo según la política del taller.

Estados del episodio

Yo no usaría muchos.

OPEN

El vehículo ingresó.

INSPECTION

Se está diagnosticando.

WAITING_APPROVAL

Hay presupuesto pendiente.

APPROVED

Se autorizó.

IN_PROGRESS

Se está reparando.

QUALITY_CHECK

Control final.

READY

Listo para entregar.

DELIVERED

Entregado.

CANCELLED

Cancelado.

Nada más.

¿Qué contiene un episodio?

Yo lo dividiría en secciones.

Información de ingreso

Fecha.

Sucursal.

Recepcionista.

Cliente.

Vehículo.

Kilometraje.

Nivel combustible.

Observaciones.

Motivos

El cliente dice:

Hace un ruido.

No el mecánico.

El cliente.

Diagnóstico

Lo completa el mecánico.

Ejemplo

Se detecta desgaste en...

Se recomienda...
Evidencias

Fotos.

Videos.

Audios.

PDF.

Presupuestos

Puede haber varios.

Órdenes de trabajo

Puede haber varias.

Repuestos

Muchos.

Mano de obra

Muchas tareas.

Garantías

Muchas.

Acá aparece algo que me entusiasma muchísimo

La Historia Clínica.

¿Qué debería mostrar?

No órdenes.

No facturas.

No presupuestos.

Mostraría únicamente episodios.

Ejemplo

2026

Cambio distribución

Garage Central
2025

Reparación caja

Transmisiones López
2025

Cambio aceite

Lubricentro Norte

Cuando abrís uno.

Recién ahí ves:

diagnóstico
fotos
presupuesto
garantía
factura
etc.

Eso hace muchísimo más simple la lectura.

Diferencia entre Episodio y Orden

Esto es clave.

Un episodio responde:

¿Qué le pasó al vehículo?

Una orden responde:

¿Qué hizo el taller?

No es lo mismo.

Ejemplo

Problema

Sobrecalentamiento

Diagnóstico

Radiador roto

Orden 1

Desarme

Orden 2

Cambio radiador

Orden 3

Prueba hidráulica

Todo pertenece al mismo episodio.

Eventos

Acá EventEmitter empieza a brillar.

Ejemplo

CareEpisodeCreated

↓

Notificación.

VehicleCheckedIn

↓

Actualizar dashboard.

DiagnosisCompleted

↓

Crear presupuesto.

EstimateApproved

↓

Crear OT.

WorkStarted

↓

Actualizar timeline.

WorkCompleted

↓

Control calidad.

VehicleDelivered

↓

Cerrar episodio.

↓

Actualizar historial.

↓

Crear garantía.

¿Y el timeline del vehículo?

Acá quiero proponerte algo que creo que puede ser uno de los grandes diferenciales del producto.

El Timeline no debería mostrar entidades.

No debería decir:

Orden #1542

Ni

Presupuesto #18

Eso le importa al taller.

No al propietario.

El Timeline debería contar la historia del vehículo.

Por ejemplo:

📅 12/08/2026

El vehículo ingresó por una pérdida de refrigerante.

↓

Se diagnosticó un radiador fisurado.

↓

Se reemplazó el radiador y el refrigerante.

↓

Se realizaron pruebas de presión.

↓

Vehículo entregado.

↓

Garantía: 6 meses / 10.000 km.

El usuario entiende qué ocurrió sin conocer la estructura interna del sistema.

Hay una decisión que me gustaría tomar ahora porque va a impactar todo el modelo

Hasta este punto seguimos hablando de "episodios", pero creo que deberíamos ir un paso más allá y definir el Aggregate Root del dominio del mantenimiento.

Mi propuesta es que el agregado principal no sea la Orden de Trabajo, sino el CareEpisode (o el nombre que finalmente elijamos en español, como "Intervención", "Atención" o "Caso de Servicio").

Todo lo demás (Diagnosis, Estimate, WorkOrder, Warranty, Evidence, Labor, Parts) dependería de ese agregado.

Aunque no vamos a implementar DDD formalmente en el MVP, pensar el dominio de esta forma tiene una ventaja enorme: toda la historia clínica del vehículo queda organizada alrededor de una única unidad de negocio. Además, encaja perfectamente con la arquitectura basada en eventos que queremos construir con @nestjs/event-emitter.

Antes de seguir con el diseño

Creo que llegamos al primer punto donde conviene abrir el debate antes de continuar con más ADR.

Hay una decisión de producto que va a afectar la base de datos, la UX y prácticamente todos los módulos futuros:

¿Queremos adoptar oficialmente el concepto de "Care Episode" (Episodio de Atención/Intervención) como la entidad principal del historial del vehículo, o preferís mantener un modelo más tradicional centrado en la Orden de Trabajo?

Mi recomendación es adoptar el Care Episode. Es más cercano a la visión de una Historia Clínica Vehicular, permite agrupar múltiples presupuestos y órdenes dentro de un mismo problema del vehículo, y nos diferencia claramente de la mayoría de los sistemas para talleres. Además, el usuario final entiende mucho mejor la historia de su vehículo cuando ve "intervenciones" que cuando ve una lista de documentos administrativos. Creo que esa decisión va a marcar la identidad del producto.

si, me parece una buena idea adoptar el care episode

Excelente. Personalmente creo que esta puede ser la decisión más importante del proyecto. No exagero.

Creo que acabamos de dejar de diseñar un software para talleres y empezamos a diseñar una plataforma de salud vehicular.

Y eso cambia completamente la forma en que vamos a pensar el resto del sistema.

Quiero proponerte una regla

A partir de hoy, hay una pregunta que debemos hacernos cada vez que diseñemos un módulo.

En lugar de preguntar:

¿Dónde guardamos esto?

Vamos a preguntar:

¿Esto pertenece al Care Episode?

Si la respuesta es sí...

Entonces debe colgar del episodio.

No de otra entidad.

Creo que es momento de hacer una pausa y mirar el panorama completo

Hasta ahora definimos:

User
│
▼
Active Context
│
▼
Workspace
│
▼
Permission Engine
│
▼
Care Episode

¿Ves el patrón?

Todo empieza a tener un eje.

Y todavía falta el último eje.

Lo que creo que será el verdadero corazón del sistema

Hasta ahora hablamos de:

Vehículos

Talleres

Usuarios

Órdenes

Presupuestos

Pero...

¿qué es realmente lo que queremos conservar durante 20 años?

No son las órdenes.

No son los presupuestos.

No son las facturas.

Es la historia del vehículo.

Entonces quiero hacer un cambio de paradigma

Hasta ahora pensábamos:

Vehicle

↓

Work Orders

↓

Invoices

↓

Quotes

Yo propondría pensar:

Vehicle

↓

Timeline

↓

Care Episodes

↓

Events

Y recién después aparecen

Presupuestos
Órdenes
Garantías
Fotos
Documentos
Repuestos
El Timeline pasa a ser el Aggregate funcional

No el Care Episode.

Sé que parece contradictorio.

El Aggregate técnico sigue siendo el CareEpisode.

Pero funcionalmente...

el usuario nunca entra a ver episodios.

El usuario entra a ver la historia.

Ejemplo.

Toyota Corolla

──────────────────────────────

2026

🟢 Cambio distribución

Garage Central

──────────────

2026

🟡 Batería reemplazada

Electricidad Gómez

──────────────

2025

🔵 Reparación caja

Transmisiones López

──────────────

2025

🟢 Cambio aceite

Lubricentro Norte

Eso es exactamente lo que el propietario quiere ver.

Entonces aparece un concepto nuevo

Y acá es donde creo que podemos diferenciarnos de absolutamente todos.

El vehículo tiene una Historia Clínica.

No un historial.

Hay diferencia.

Un historial es una lista.

Una Historia Clínica tiene estructura.

Ejemplo

Vehículo

↓

Timeline

↓

Care Episode

↓

Diagnosis

↓

Treatments

↓

Evidence

↓

Recommendations

↓

Warranty

↓

Follow-up

Esto se parece muchísimo más a un hospital.

Y creo que eso es exactamente lo que queremos transmitir.

Entonces...

Me gustaría introducir un nuevo concepto.

Vehicle Medical Record

No como tabla.

Sino como concepto funcional.

Todo vehículo posee una Historia Clínica.

Siempre.

Aunque nunca haya ido a un taller.

Primer episodio

Cuando alguien registra un vehículo.

Ya existe la historia.

Está vacía.

Segundo episodio

Cambio aceite.

Tercer episodio

Choque.

Cuarto episodio

Garantía.

Todo queda ordenado cronológicamente.

¿Quién escribe en la Historia Clínica?

Acá aparece algo que me entusiasma muchísimo.

No solamente talleres.

También:

✔ Concesionarios

✔ Lubricentros

✔ Electricistas

✔ Chapistas

✔ Gomerías

✔ Dueño

✔ Centros de inspección

✔ VTV

✔ Compañías de seguros (en el futuro)

✔ Dispositivos IoT (algún día)

Todos agregan episodios.

Nunca modifican los anteriores.

Esto cambia la filosofía de permisos

Hoy pensábamos:

Workshop

↓

Puede editar vehículo

Ahora pienso:

Workshop

↓

Puede agregar Episodios

Es mucho más potente.

Porque el historial nunca pierde integridad.

Entonces...

Creo que el modelo de Ownership que diseñamos hace unos días cobra muchísimo más sentido.

Porque el vehículo deja de pertenecer al taller.

El historial tampoco.

El historial pertenece al vehículo.

Exactamente como la historia clínica pertenece al paciente.

Y ahora viene una idea que me gustaría discutir antes de seguir diseñando

Creo que estamos usando el nombre Care Episode porque es un término muy conocido en sistemas clínicos y describe muy bien el concepto técnico.

Pero me pregunto si ese debería ser el nombre que usemos en el producto.

Por ejemplo, imaginá que un mecánico entra al sistema y ve un botón que dice:

Nuevo Care Episode

Creo que le resultaría extraño.

En cambio, internamente podríamos llamarlo CareEpisode, pero en la interfaz utilizar una terminología mucho más natural, por ejemplo:

Intervención
Atención
Servicio
Caso de Servicio
Trabajo
Ingreso al Taller

Mi sugerencia sería separar el nombre del dominio técnico del lenguaje del usuario.

En el código: CareEpisode.
En la base de datos: care_episodes.
En la API: CareEpisodeCreated.
En la interfaz: "Intervención" o "Ingreso de Servicio", según el contexto.

Eso nos permite conservar un modelo de dominio muy sólido sin obligar a los usuarios a aprender terminología técnica que no forma parte de su día a día.
