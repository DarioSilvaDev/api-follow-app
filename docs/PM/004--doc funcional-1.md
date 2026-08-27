Product Blueprint - Capítulo 1
User Journey Map del MVP

Antes de hablar de pantallas, definamos los actores.

No tenemos "tipos de usuarios".

Tenemos personas usando distintos contextos.

Para el MVP identifico cuatro actores principales.

Actor 1 - Propietario del vehículo

Su objetivo nunca es administrar un taller.

Su objetivo es cuidar su vehículo.

Quiere:

Registrar sus vehículos.
Conocer su estado.
Recordar mantenimientos.
Encontrar talleres.
Compartir el historial.
Aprobar presupuestos.
Tener toda la documentación.
Actor 2 - Recepcionista del taller

Su trabajo es recibir vehículos.

No repara.

No diagnostica.

Necesita rapidez.

Actor 3 - Mecánico

Su trabajo es ejecutar una Atención.

No administra clientes.

No administra pagos.

Necesita información técnica.

Actor 4 - Dueño del taller

Su objetivo es administrar la operación.

Quiere ver:

carga de trabajo
productividad
estado de las Atenciones
clientes
empleados
Journey 1
Registro del propietario
Landing

↓

Registro

↓

Confirmación email

↓

Contexto Personal

↓

Dashboard vacío

↓

Registrar primer vehículo

Primer logro del usuario:

"Mi vehículo ya existe en la plataforma."

Eso es importante.

No el login.

Journey 2
Registrar un vehículo

No me gusta un formulario enorme.

Lo dividiría.

Paso 1

Identificación

Patente

VIN (opcional)

Marca

Modelo

Año
Paso 2

Información adicional

Motor

Combustible

Color

Fotos
Paso 3

Propiedad

¿Sos el propietario?

SI

↓

VehicleOwnership
Resultado

Se crea:

Vehicle

↓

VehicleOwnership

↓

Historia Clínica

(vacía)

No espera a la primera Atención.

La historia nace con el vehículo.

Journey 3
Buscar un taller

Esto me parece uno de los diferenciales.

El propietario podrá buscar.

Especialidad

↓

Ubicación

↓

Calificación

↓

Servicios

↓

Disponibilidad

Selecciona uno.

Journey 4
Solicitar un turno
Vehículo

↓

Servicio

↓

Fecha

↓

Observaciones

↓

Enviar

El taller recibe una solicitud.

No una Atención.

Esto es importante.

Journey 5
Recepción del vehículo

Acá nace oficialmente la Atención.

Turno

↓

Recepción

↓

Check-in

↓

Nueva Atención

Se registran:

kilometraje
combustible
observaciones
fotos
accesorios (auxilio, matafuegos, etc.)

Este paso protege tanto al cliente como al taller.

Journey 6
Diagnóstico

El mecánico:

Abre Atención

↓

Agrega diagnóstico

↓

Adjunta fotos

↓

Adjunta videos

↓

Recomendaciones

Todavía no hay presupuesto.

Journey 7
Presupuesto

El recepcionista o asesor crea.

Diagnóstico

↓

Repuestos

↓

Mano de obra

↓

Impuestos

↓

Total

Estado:

Pendiente
Journey 8
Aprobación

El propietario recibe una notificación.

Puede:

Aceptar
Rechazar
Solicitar cambios

Me gusta mucho esta tercera opción.

Porque ocurre constantemente.

Journey 9
Reparación

Cuando aprueba.

La Atención pasa a:

IN_PROGRESS

El mecánico:

registra avances
agrega fotos
cambia estados
agrega repuestos utilizados
registra mano de obra
Journey 10
Control de calidad

Antes de entregar.

Checklist.

Ejemplo:

✓ Reparación realizada

✓ Prueba dinámica

✓ Sin pérdidas

✓ Limpieza

✓ Documentación
Journey 11
Entrega

La Atención se cierra.

Automáticamente:

se actualiza el Timeline
se actualiza la Historia Clínica
se crean las garantías
se generan los próximos mantenimientos (si corresponde)

Esto debería ser completamente automático.

Journey 12
Seguimiento

Acá aparece una idea que creo que será uno de nuestros diferenciales.

Una Atención nunca desaparece.

Puede generar:

Garantía

↓

Revisión

↓

Nuevo mantenimiento

↓

Recordatorio

↓

Nuevo episodio relacionado

No termina cuando el vehículo sale.

¿Qué acabamos de descubrir?

Fijate que nunca hablamos de tablas.

Nunca hablamos de APIs.

Hablamos de un flujo.

Y de ese flujo salen naturalmente los módulos.

Creo que encontramos la verdadera entidad del MVP

Hasta ahora pensábamos:

Vehicle

Después:

CareEpisode

Pero ahora veo algo más importante.

El flujo completo gira alrededor de una palabra:

Atención.

La Atención:

nace en la recepción,
evoluciona con el diagnóstico,
puede tener varios presupuestos,
genera una o varias órdenes de trabajo,
termina con la entrega,
deja un registro permanente en la Historia Clínica.

Es, en términos funcionales, la unidad de trabajo del taller y, en términos de dominio, nuestro CareEpisode.
