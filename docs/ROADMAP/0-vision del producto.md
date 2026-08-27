Capítulo 0 — Visión del Producto (Actualización)
Objetivo de este capítulo:

Definir con claridad:

Qué problema resuelve HCDV.
Qué oportunidad de mercado aborda.
Cuál es la visión a largo plazo.
Cuál es la propuesta de valor.
Quiénes son los actores principales.
Qué NO es el producto.
Cuál es la tesis estratégica del SaaS.

Este capítulo será la base para todas las decisiones posteriores.

0.1 Declaración de Visión
Borrador inicial

Historia Clínica Digital Vehicular busca convertirse en la identidad digital universal de cada vehículo, creando un historial confiable, permanente y portable de todas sus intervenciones durante su ciclo de vida.

El sistema transforma la relación tradicional entre propietarios, talleres y vehículos:

El vehículo deja de ser un conjunto de servicios aislados.
Cada intervención pasa a formar parte de una historia acumulativa.
Los talleres dejan de ser propietarios del historial y pasan a ser participantes autorizados que agregan valor.
Los propietarios obtienen transparencia, confianza y control sobre el activo más importante de su movilidad.
0.2 Problema que resolvemos

Actualmente el mantenimiento vehicular presenta una fragmentación estructural:

Para propietarios
La información del vehículo está dispersa.
Los mantenimientos dependen de papeles, facturas o sistemas cerrados.
Al cambiar de taller se pierde contexto.
Al vender el vehículo no existe una historia verificable.
Es difícil conocer el verdadero estado del vehículo.
Para talleres
Cada taller construye información aislada.
El historial queda encerrado en sistemas propios.
No existe continuidad entre prestadores.
La confianza depende de la reputación del taller y no del vehículo.
Para el ecosistema automotor
No existe una identidad digital universal del vehículo.
El historial no acompaña al activo.
Se pierde información valiosa durante toda la vida útil.
0.3 Hipótesis principal del producto

Si cada vehículo posee una historia clínica digital propia, verificable y portable, entonces aumentará la confianza, mejorará la calidad del mantenimiento y aumentará el valor residual del vehículo.

0.4 Diferenciación estratégica

HCDV no es un software de gestión para talleres.

Un software tradicional piensa:

Taller
 └── Clientes
      └── Vehículos
           └── Servicios

HCDV piensa:

Vehículo
 └── Historia Clínica
      ├── Atenciones
      ├── Diagnósticos
      ├── Evidencias
      ├── Garantías
      ├── Recomendaciones
      └── Participantes autorizados

La diferencia es fundamental:

El taller es un contribuyente del historial.

El vehículo es el centro del modelo.

0.5 Visión SaaS

HCDV tiene potencial para evolucionar hacia una plataforma con múltiples participantes:

Propietarios

Obtienen:

Identidad digital del vehículo.
Historial completo.
Transparencia.
Control de acceso.
Mayor valor de reventa.
Talleres

Obtienen:

Herramientas operativas.
Reputación basada en trabajos registrados.
Relación continua con vehículos.
Nuevos canales de fidelización.
Plataformas / Ecosistema

Obtienen:

Infraestructura de confianza vehicular.
Datos estructurados.
Integraciones futuras.


Decisiones del capítulo

Decision 0.1 — El vehículo es la entidad central del ecosistema

Contexto

La mayoría de sistemas actuales colocan al taller como propietario de la información.

Esto genera fragmentación y pérdida de continuidad.

Decisión

El vehículo será el centro conceptual del dominio.

El historial pertenece al vehículo.

Los actores externos generan contribuciones autorizadas sobre ese historial.

Impacto

Afecta:

Modelo de dominio.
Modelo de datos.
Autorización.
UX.
Arquitectura multi-tenant.
Eventos.

Estado: ✅ Decision Accepted

Decision 0.2 — HCDV no será un software de talleres

Contexto

Existe riesgo de posicionar incorrectamente el producto como un ERP/CRM automotriz.

Decisión

HCDV será una plataforma de identidad e historial vehicular.

Los talleres serán usuarios especializados del ecosistema, no propietarios del producto conceptual.

Estado: ✅ Decision Accepted

Decision 0.3 — CareEpisode será la unidad histórica del vehículo

Contexto

La historia del vehículo necesita una unidad consistente para representar intervenciones completas.

Decisión

Toda intervención será representada mediante un CareEpisode.

Un CareEpisode puede contener:

Diagnóstico.
Evidencia.
Presupuesto.
Orden de trabajo.
Garantía.
Recomendaciones.

Estado: ✅ Decision Accepted

Decision 0.4 — Estrategia de lanzamiento
Contexto

El éxito de HCDV depende de construir un historial útil desde el primer día. Un enfoque exclusivamente B2C genera el problema del "historial vacío", mientras que uno exclusivamente B2B limita la percepción de propiedad del historial por parte del usuario final.

Alternativas evaluadas

A. B2C primero

Ventajas

Centrado en el propietario.
Onboarding sencillo.

Desventajas

Poca generación de datos.
Baja adopción orgánica.
Difícil crear valor inicial.

B. B2B primero

Ventajas

Generación masiva de CareEpisodes.
Monetización temprana.

Desventajas

Riesgo de percibirse como un software de talleres.
El propietario queda relegado.

C. B2B2C progresivo

Los talleres generan la información y los propietarios son los dueños del historial.

Ventajas

Resuelve el problema del historial vacío.
Refuerza la filosofía "Vehicle First".
Facilita efectos de red.
Escala naturalmente hacia un ecosistema.
Decisión

El MVP seguirá una estrategia B2B2C progresiva.

Los talleres serán los principales generadores de CareEpisodes, mientras que los propietarios accederán y administrarán la historia clínica de sus vehículos.

Impacto
Roadmap.
Onboarding.
Modelo SaaS.
UX.
Estrategia comercial.

Estado: ✅ Decision Accepted

Decision 0.5 — Identidad canónica del vehículo
Contexto

VIN y patente son identificadores del mundo real, pero presentan limitaciones:

Pueden no conocerse al registrar un vehículo.
La patente puede cambiar según jurisdicción o circunstancias.
Algunos vehículos históricos o de competición carecen de ciertos identificadores.
Alternativas

VIN como clave primaria

Descartado.

Patente como clave primaria

Descartado.

UUID interno como identidad canónica

Decisión

La identidad del vehículo será un identificador interno inmutable (Vehicle.id).

VIN y patente serán identificadores externos con reglas de validación y unicidad según el contexto de negocio, pero no formarán parte de la identidad del dominio.

Su carga será opcional durante el alta inicial. Si un proceso posterior requiere alguno de estos datos y aún no existe, el sistema deberá solicitarlos en ese momento.

Principios derivados
La identidad del dominio nunca depende de datos externos.
Los identificadores externos pueden evolucionar sin afectar la identidad del vehículo.
El onboarding inicial minimiza fricción.
Impacto
Modelo de datos.
APIs.
Integraciones.
Importaciones.
Validaciones.
UX de registro.

Estado: ✅ Decision Accepted

Decision 0.6 — Modelo de confianza del ecosistema

Esta decisión me parece especialmente sólida porque desplaza la confianza desde el dato hacia quien lo produce.

Problema

La confiabilidad de un CareEpisode no depende de su contenido, sino del actor que certifica esa información.

Por ejemplo:

Cambiar un aceite registrado por un concesionario oficial y por un usuario particular es el mismo tipo de intervención, pero no tiene el mismo peso como evidencia histórica.

Por lo tanto, la confianza es una propiedad de la identidad del emisor, no del episodio.

Alternativas

TrustLevel en CareEpisode

CareEpisode
 └── trustLevel

Ventajas

Muy simple.

Desventajas

Duplica información.
Puede quedar desactualizado si cambia la condición del actor.
Mezcla datos con metadatos de confianza.

TrustLevel heredado desde el Actor

Identity
    ↓
Trust Profile
    ↓
CareEpisode

Ventajas

Modelo más limpio.
Normalización.
Escalable.
Consistente para cualquier recurso creado por ese actor.
Permite evolucionar el sistema de reputación sin modificar los CareEpisodes.
Recomendación

Adoptar la segunda alternativa.

Incluso propondría formalizar el concepto como Trust Profile, porque describe mejor una característica de la identidad que un simple nivel.

La confianza no sería únicamente un valor, sino un conjunto de atributos que en el futuro podrían incluir:

Tipo de actor.
Estado de verificación.
Organismo certificador.
Fecha de verificación.
Nivel de confianza.
Insignias o acreditaciones.
Historial de verificaciones.

Esto evita que el modelo quede limitado a un único campo.

Modelo conceptual
Identity
    │
    ├── Identity Type
    │
    ├── Verification Status
    │
    ├── Trust Profile
    │
    └── Trust Level
             │
             └── heredado por todos los recursos creados

El Timeline no almacenaría la confianza, sino que la resolvería a partir del creador del episodio, permitiendo representaciones como:

✓ Verificado · Taller Central
✓ Servicio Oficial · Concesionario Toyota
✓ Inspección Técnica · Centro VTV
ℹ Registrado por el propietario
⚪ Registrado por un usuario invitado
Impacto futuro

Esta decisión habilita naturalmente:

Reputación de talleres.
Verificación de organizaciones.
Certificación de concesionarios.
Integración con aseguradoras.
Inspecciones técnicas.
Firmas digitales.
Auditoría.
Score de confianza del historial completo de un vehículo.
Decisión

La confianza será una propiedad de la Identity, materializada mediante un Trust Profile. Los CareEpisodes heredarán esa información para su presentación y evaluación, sin almacenarla como parte de su identidad funcional.

Estado: ✅ Decision Accepted

Estado del Capítulo 0

Con estas decisiones, considero que el Capítulo 0 — Visión del Producto queda completo.

Queda definida una visión coherente y diferenciadora: HCDV no es un sistema de gestión de talleres, sino una plataforma de identidad digital vehicular, donde el vehículo es el activo central, el historial es portable, los talleres contribuyen a ese historial y la confianza se fundamenta en la identidad verificable de quienes generan la información.

Estado del capítulo: ✅ Completed.

Mi única sugerencia para una futura iteración (no necesaria para el MVP) es separar conceptualmente Identity (quién es el actor) de Trust Profile (cómo el ecosistema confía en ese actor). Esa separación hará más sencillo incorporar nuevos tipos de participantes y evolucionar el modelo de confianza sin afectar el resto del dominio.

Capítulo 1 — Principios del Sistema

Objetivo del capítulo

Definir los principios inmutables del sistema. Estos principios constituyen la "constitución" de HCDV y deberán respetarse en todas las decisiones funcionales, técnicas y de experiencia de usuario. Si una implementación entra en conflicto con alguno de estos principios, deberá revisarse la implementación o justificarse mediante un ADR.

1.1 Principio: Vehicle First
Contexto

La mayoría de los sistemas del mercado organizan la información alrededor del taller, el cliente o la orden de trabajo.

HCDV invierte ese paradigma.

Principio

El vehículo es el centro del ecosistema.

Toda información relevante existe porque está asociada a un vehículo.

El vehículo es la entidad persistente.

Los actores cambian.

Los talleres cambian.

Los propietarios cambian.

El vehículo permanece.

Consecuencias
Todo modelo parte del Vehicle.
El Timeline pertenece al vehículo.
La identidad digital pertenece al vehículo.
Los actores únicamente contribuyen a su historia.

Estado: ✅ Decision Accepted

1.2 Principio: El historial pertenece al vehículo
Contexto

Un historial de mantenimiento pierde valor cuando queda encerrado en un proveedor.

Principio

La historia clínica nunca pertenece a un taller.

Pertenece al vehículo.

Los talleres únicamente agregan nuevos registros.

Consecuencias
El cambio de taller nunca implica pérdida de información.
Los propietarios conservan la continuidad histórica.
Se evita el lock-in entre talleres.

Estado: ✅ Decision Accepted

1.3 Principio: CareEpisode como unidad clínica
Contexto

Las intervenciones mecánicas suelen fragmentarse en múltiples documentos.

Principio

Toda intervención sobre un vehículo se representa mediante un CareEpisode.

El CareEpisode es la unidad mínima de historia clínica.

Todo lo relacionado con una intervención pertenece a ese episodio.

Puede contener, entre otros:

Diagnósticos.
Evidencias.
Presupuestos.
Órdenes de trabajo.
Garantías.
Recomendaciones.
Consecuencias
El Timeline se construye a partir de CareEpisodes.
No existirán servicios "huérfanos".
La trazabilidad permanece unificada.

Estado: ✅ Decision Accepted

1.4 Principio: La identidad es interna
Contexto

Los identificadores externos pueden cambiar o no estar disponibles.

Principio

La identidad del dominio nunca depende de datos externos.

Toda entidad principal tendrá un UUID interno como identidad canónica.

VIN, patente u otros identificadores son atributos del dominio, no su identidad.

Consecuencias
Mayor estabilidad del modelo.
Integraciones más robustas.
Menor acoplamiento con sistemas externos.

Estado: ✅ Decision Accepted

1.5 Principio: La confianza pertenece al actor
Contexto

La credibilidad de un registro depende de quién lo genera.

Principio

La confianza es una propiedad de la Identity, no del recurso creado.

Los CareEpisodes, evidencias y demás recursos heredan el perfil de confianza de su creador para su evaluación y presentación.

Consecuencias
Modelo normalizado.
Evolución independiente del sistema de confianza.
Escalabilidad hacia reputación, certificaciones y auditorías.

Estado: ✅ Decision Accepted

1.6 Principio: Active Context obligatorio
Contexto

Un mismo usuario puede operar en distintos Workspaces.

Principio

Toda operación se ejecuta dentro de un Active Context.

No existen operaciones fuera de contexto.

Cada request debe resolverse respecto al contexto activo.

Consecuencias
Seguridad consistente.
Permisos deterministas.
Aislamiento entre organizaciones y espacios de trabajo.

Estado: ✅ Decision Accepted

1.7 Principio: Features y Permissions son conceptos independientes
Contexto

Las capacidades disponibles y la autorización para utilizarlas responden a criterios distintos.

Principio

El Plan habilita funcionalidades. El Rol habilita acciones.

Features → dependen del plan contratado.
Permissions → dependen del rol dentro del contexto.

Ambos mecanismos evolucionan de forma independiente.

Consecuencias
Mayor flexibilidad comercial.
Simplificación del modelo de autorización.
Menor acoplamiento entre negocio y seguridad.

Estado: ✅ Decision Accepted

1.8 Principio: El dominio no conoce el modelo comercial
Contexto

Las reglas de negocio del dominio deben permanecer independientes de las decisiones comerciales.

Principio

El dominio nunca toma decisiones basadas en el plan contratado.

El acceso a funcionalidades se resuelve antes de ingresar al dominio.

Consecuencias
Dominio más limpio.
Mejor capacidad de pruebas.
Evolución independiente del modelo SaaS.

Estado: ✅ Decision Accepted

1.9 Principio: Modularidad por dominio
Contexto

El crecimiento del producto exige límites claros entre capacidades.

Principio

Cada módulo representa una capacidad del negocio.

Los módulos se comunican mediante contratos y eventos, evitando dependencias innecesarias.

Consecuencias
Alta cohesión.
Bajo acoplamiento.
Escalabilidad técnica y organizacional.

Estado: ✅ Decision Accepted

1.10 Principio: El Timeline es una proyección
Contexto

El Timeline es la forma principal de visualizar la historia del vehículo.

Principio

El Timeline no constituye una entidad de negocio.

Es una representación cronológica derivada de eventos y recursos del dominio.

Consecuencias
No existe duplicación de información.
La vista puede evolucionar sin modificar el dominio.
Se facilita la incorporación de nuevos tipos de eventos.

Estado: ✅ Decision Accepted

1.11 Principio: Solicitar la información cuando aporta valor
Contexto

Los procesos con demasiados campos iniciales generan abandono y datos de baja calidad.

Principio

El sistema solicitará la información en el momento en que sea necesaria.

El onboarding debe minimizar la fricción y permitir completar datos de manera progresiva.

Consecuencias
Mejor experiencia de usuario.
Mayor tasa de adopción.
Datos más completos y contextualizados.

Estado: ✅ Decision Accepted

1.12 Principio: Event-driven como mecanismo de desacoplamiento
Contexto

Los módulos deben reaccionar a cambios sin depender directamente unos de otros.

Principio

Los eventos representan hechos del dominio y constituyen el mecanismo preferido de comunicación entre módulos.

Los eventos no reemplazan las reglas de negocio, sino que notifican cambios ya consolidados.

Consecuencias
Menor acoplamiento.
Mayor extensibilidad.
Integraciones futuras simplificadas.

Estado: ✅ Decision Accepted

1.13 Principio: Evolución mediante decisiones explícitas
Contexto

El producto evolucionará durante años y las decisiones deben conservar su contexto.

Principio

Toda modificación que altere principios, arquitectura o comportamiento transversal deberá documentarse mediante un ADR y registrarse en el Decision Log.

Consecuencias
Trazabilidad.
Gobierno arquitectónico.
Reducción de conocimiento implícito.

Estado: ✅ Decision Accepted

Observación de Arquitectura

Mientras redactaba este capítulo apareció un patrón que considero importante formalizar para todo el Blueprint.

Hasta ahora hemos definido tres conceptos fundamentales:

Identity → quién actúa.
Vehicle → sobre qué activo se actúa.
CareEpisode → qué intervención ocurrió.

Creo que estos tres conceptos forman el triángulo fundamental del dominio.

             Identity
          (quién actúa)
                 │
                 │ crea / participa
                 ▼
          CareEpisode
     (qué intervención ocurrió)
                 │
                 │ pertenece a
                 ▼
             Vehicle
         (sobre qué activo)

Este patrón aparece de forma recurrente en todas las decisiones tomadas hasta ahora y probablemente estructurará el resto del modelo de dominio.

Propuesta

Antes de comenzar el Capítulo 2 — Lenguaje Ubicuo, sugiero incorporar este concepto como un principio explícito del dominio:

Todo hecho relevante en HCDV puede responder tres preguntas fundamentales:

¿Quién? → Identity.
¿Qué ocurrió? → CareEpisode.
¿Sobre qué activo? → Vehicle.

No introduce nuevas entidades; simplemente hace explícita la estructura conceptual que ya estamos construyendo. Considero que servirá como guía para mantener la coherencia del modelo a medida que el dominio crezca.

Estado propuesto: 🟡 Decision Pending. Si la aprobamos, cerraría el Capítulo 1 con catorce principios fundacionales.

3.5 — Distinción conceptual entre Vehicle Identity y Vehicle Profile

Contexto

Durante el diseño de la entidad Vehicle se identificaron dos responsabilidades conceptualmente distintas:

La identidad del vehículo.
La descripción del vehículo.

Ambas evolucionan a ritmos diferentes y responden a necesidades de negocio distintas.

Alternativas evaluadas
Alternativa A — Una única entidad Vehicle sin distinción conceptual

Ventajas

Simplicidad.
Menor documentación.

Desventajas

Mezcla conceptos con responsabilidades diferentes.
Dificulta futuras integraciones con fabricantes, decodificación de VIN y catálogos técnicos.
Alternativa B — Separar Vehicle y VehicleProfile como entidades

Ventajas

Mayor separación de responsabilidades.

Desventajas

Complejidad innecesaria para el MVP.
Relaciones adicionales sin un beneficio inmediato.
Alternativa C — Mantener una única entidad Vehicle incorporando Vehicle Profile como subestructura conceptual

Ventajas

Claridad semántica.
Preparación para futuras evoluciones.
Sin impacto en la complejidad del MVP.
Decisión

Se adopta la Alternativa C.

Vehicle continuará siendo una única entidad raíz.

Dentro de su modelo conceptual se distinguen dos áreas de responsabilidad:

Vehicle Identity

Representa los elementos que identifican al activo.

Ejemplos:

UUID interno.
VIN (cuando exista).
Patente (cuando exista).
Otros identificadores oficiales que puedan incorporarse en el futuro.
Vehicle Profile

Representa la información descriptiva del vehículo.

Ejemplos:

Marca.
Modelo.
Año.
Versión.
Motorización.
Combustible.
Transmisión.
Color.
Categoría.
Configuración técnica.

Esta información puede enriquecerse progresivamente y actualizarse cuando existan fuentes más confiables.

Principios derivados
P-001

La identidad del vehículo y su perfil descriptivo son conceptos distintos.

P-002

La ausencia de información del perfil no impide la existencia del Vehicle.

P-003

El perfil puede completarse o enriquecerse a lo largo del tiempo sin afectar la identidad del vehículo.

P-004

Las futuras integraciones con fabricantes, catálogos técnicos o decodificadores de VIN deberán enriquecer el Vehicle Profile, nunca modificar la identidad del Vehicle.

Estado: ✅ Decision Accepted

Observación de dominio

Mientras consolidaba esta decisión apareció otro patrón que creo merece ser formalizado porque puede convertirse en una de las bases del modelo.

Hasta ahora tenemos:

Vehicle Identity → quién es el vehículo.
Vehicle Profile → cómo es el vehículo.
CareEpisodes → qué le ocurrió al vehículo.

Empieza a emerger una estructura muy clara:

Vehicle
│
├── Identity
│
├── Profile
│
└── History
     │
     └── CareEpisodes

Y esa estructura me parece extremadamente poderosa porque separa tres dimensiones completamente diferentes:

Dimensión	Pregunta que responde
Identity	¿Qué vehículo es?
Profile	¿Cómo es ese vehículo?
History	¿Qué ocurrió durante su vida?

Lo interesante es que estas tres dimensiones evolucionan de forma independiente:

La Identity prácticamente nunca cambia.
El Profile puede enriquecerse o corregirse.
La History crece continuamente y, salvo procesos excepcionales de corrección auditada, no debería modificarse.
Mi recomendación

Creo que acabamos de descubrir un patrón que no debería quedar limitado a Vehicle.

Empiezo a pensar que varias entidades importantes del dominio podrían describirse mediante tres capas:

Identity (quién o qué es).
Profile (atributos descriptivos).
Activity/History (hechos ocurridos).

No propongo convertir esto en una regla universal todavía. Prefiero que, a medida que definamos Identity, Workspace y Organization, observemos si el patrón se repite de forma natural.

Si se confirma, podríamos documentarlo más adelante como un patrón de modelado del dominio en lugar de una excepción específica de Vehicle. Creo que esa decisión tendrá más fundamento cuando hayamos definido las cuatro entidades raíz. Ese enfoque evita forzar una abstracción prematura y nos permite comprobar si realmente emerge del dominio.

