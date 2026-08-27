ADR-007 — Vehicle Digital Twin

Quiero tomar un concepto muy utilizado en la industria 4.0:

Digital Twin (Gemelo Digital).

No vamos a copiar el concepto completo, pero sí la filosofía.

Cada vehículo tendrá un "gemelo digital" dentro de la plataforma.

Ese gemelo será la representación digital completa de su vida útil.

¿Qué compone el Gemelo Digital?

Yo lo dividiría en ocho dominios.

1. Identidad

Información que prácticamente no cambia.

VIN

Patente

Marca

Modelo

Motor

Combustible

Año

Color 2. Propiedad

No queremos saber solamente quién es el dueño.

Queremos conocer la historia de propiedad.

2022-2025

Juan Pérez

↓

2025-Actualidad

María Gómez

Eso ya lo veníamos contemplando con VehicleOwnership.

3. Estado Actual

No es historial.

Es el "ahora".

Ejemplo:

Kilometraje

Estado general

Nivel de combustible (opcional)

Próximo service

Próxima VTV

Garantías vigentes

Alertas activas 4. Historia Clínica

Acá viven los CareEpisode.

Vehicle

↓

CareEpisode

↓

Diagnosis

↓

Evidence

↓

Treatments

↓

Warranty 5. Cronología

No muestra tablas.

Cuenta la historia.

2026

Cambio distribución

↓

2026

Cambio batería

↓

2025

Choque lateral

↓

2025

Cambio aceite 6. Documentación

No solamente PDF.

Todo.

Título

Cédula

Seguro

VTV

Manual

Facturas

Fotos

Garantías 7. Accesos

¿Quién puede ver este vehículo?

Owner

↓

Esposa

↓

Hijo

↓

Taller X

↓

Aseguradora (algún día) 8. Predicciones

Esto hoy será muy simple.

Pero en cinco años...

Puede ser increíble.

Ejemplos:

Próximo cambio aceite

↓

Próxima distribución

↓

Batería cercana al fin de vida

↓

Cubiertas próximas a reemplazo

Incluso IA.

¿Cuál es nuestra entidad principal?

Muchos sistemas tienen:

Workshop

como centro.

Nosotros no.

Nuestro centro será:

Vehicle

Todo gira alrededor del vehículo.

No alrededor del taller.

Eso cambia completamente la arquitectura.

Entonces aparece otro concepto

Y este me parece uno de los más importantes de todo el producto.

El taller no "posee" información.

El taller "contribuye" a la historia del vehículo.

Es una diferencia enorme.

Por ejemplo:

Vehículo

↓

Historia Clínica

↓

CareEpisode

↓

Creado por

Garage Central

El taller no es dueño de ese episodio.

Es el autor.

El episodio pertenece al historial del vehículo.

Beneficios de este enfoque

Esto nos permite, en el futuro:

Cambiar de taller sin perder historial.
Compartir el historial con otro taller (con autorización del propietario).
Vender el vehículo con su historial completo.
Crear un "Carfax" latinoamericano.
Integrar concesionarios, aseguradoras e inspecciones técnicas.

Ese potencial no existe si el historial pertenece al taller.

Un concepto nuevo: Health Score

Acá quiero proponerte una idea para el Post-MVP.

No implementarla ahora.

Pero sí diseñarla desde hoy.

Cada vehículo podría tener un índice de salud.

Por ejemplo:

98/100

🟢 Excelente

o

72/100

🟡 Atención

Calculado en función de:

mantenimientos vencidos,
cantidad de fallas recurrentes,
antigüedad de componentes críticos,
cumplimiento del plan de mantenimiento.

No sería un dato ingresado por un usuario.

Sería un dato calculado.

Y podría convertirse en una de las funcionalidades premium más atractivas de la plataforma.

La decisión que creo que va a marcar la diferencia del producto

Hasta ahora venimos hablando de módulos (Vehículos, Talleres, Turnos, etc.). Sin embargo, creo que deberíamos definir una visión que sirva como brújula para todas las decisiones futuras.

Mi propuesta es esta:

"No estamos construyendo un software para administrar talleres. Estamos construyendo la identidad digital y la historia clínica de cada vehículo."

Todo lo que agreguemos en el futuro debería responder a esa visión.

Si una funcionalidad ayuda a conservar, enriquecer o aprovechar la historia del vehículo, probablemente pertenece al producto.

Si solo resuelve una tarea administrativa del taller, debemos preguntarnos si aporta valor al diferencial que buscamos o si puede esperar para una etapa posterior.
