
---

# 36. Registro (2026-09-26): Robustez de email en produccion (D-109..D-124)

## 0. Contexto del registro

El 2026-09-26 en produccion (Render, pi-follow-app) el registro de un usuario
termino en un dead-end: el envio del email de verificacion fallo con
Error: Connection timeout y el comando respondio **503**. El usuario reintento
y recibio **409 CONFLICT "Ya existe una cuenta con este email"**, sin forma de
entender que el primer intento si habia creado la cuenta: quedaba
permanentemente inaccesible, porque un usuario pending no puede autenticarse.

Causa raiz del incidente: MailService propagaba el error SMTP al listener y el
flujo HTTP no lo contenia. El sintoma (409) era el efecto de segundo orden; el
defecto era el 503 original.

La numeracion **D-109..D-124** se asigna al formalizar este registro. El
contenido refleja lo aprobado por el usuario y por product-manager-hcdv en la
sesion de analisis; la asignacion numerica de esta seccion la hace el TL y debe
considerarse canonica a partir de aqui.

## 1. Frontera de error y contratos HTTP

- **D-109** - MailService es la FRONTERA DE ERROR del subsistema de email: sus
  metodos publicos resuelven siempre, nunca lanzan. Un fallo de envio NUNCA
  revierte la accion de negocio que lo origino ni produce 5xx. Aplica a los 9
  flujos por email (verificacion, reset, reset-completed, welcome, 3 de
  transferencia, invitacion de plataforma, invitaciones de concesionaria/taller).
  *Razon*: el 503 del incidente corto-circulaba la causa y obligaba al usuario a
  repetir una operacion ya persistida.
- **D-110** - egister, orgot-password y esend-verification responden
  **siempre 201 con cuerpo anti-enumeracion**, exista o no la cuenta. El estado
  del envio no se infiere del status HTTP.
- **D-111** - Solo egister expone el resultado del envio, en
  emailVerification.state: 'accepted' | 'failed' (RegisterResponseDto). No
  hay riesgo de enumeracion: el solicitante acaba de crear la cuenta y ya
  conoce su existencia. orgot-password y esend-verification NO agregan el
  campo: ahi el estado seria un orador de existencia de cuentas.
- **D-115** - ccepted significa que el relay SMTP acepto el mensaje en el
  handshake. **NO significa entregado.** Sin DSN ni webhook de bounce no se
  ofrece un estado delivered; ofrecerlo seria mentir. Si alguna vez existe
  confirmacion de entrega, sera un estado NUEVO y explicito.

## 2. Clasificacion de errores, reintentos y timeouts

- **D-112** - Todo envio se ejecuta como Command -> Handler -> Evento -> Listener
  -> MailService, en ese orden. El estado de exito precede siempre a la
  emision. Los listeners siguen siendo la frontera que absorbe el error y
  correlaciona por id de dominio.
- **D-113** - Clasificacion transitorio vs permanente segun **RFC 5321: 4xx
  transitorio, 5xx permanente** (mas allowlist de codigos de red de Node).
  Maximo **3 intentos totales**, backoff exponencial 2s / 8s con jitter.
  **El reintento reenvia el MISMO token y el MISMO payload**: un timeout de SMTP
  es ambiguo (el servidor pudo aceptar el mensaje y perder la respuesta), asi
  que regenerar el token produciria un link de verificacion o invitacion muerto
  sin que nada lo delate.
  *Correccion aplicada durante la implementacion*: la primera version clasificaba
  como transitorio todo >= 500, lo que reintentaba un 550 (buzon
  inexistente) tres veces. Detectado por test; la regla canonica lo evita.
- **D-114** - Timeouts obligatorios en la conexion SMTP (connectionTimeout,
  greetingTimeout, socketTimeout). Sin ellos, un relay colgado retiene el
  listener indefinidamente y el unico sintoma observable es la ausencia de
  emails.

## 3. Seguridad

- **D-116** - TLS con verificacion de certificado **habilitada por default**
  (SMTP_REJECT_UNAUTHORIZED=true) y equireTLS en el puerto 587. Poner
  alse abre la conexion a MITM sobre los links de invitacion, que son la via
  de onboarding del owner de un taller o concesionaria. Cualquier excepcion es
  una decision explicita del operador, nunca un default.
- **D-120** - **Los tokens nunca se loguean** (invitacion, verificacion, reset).
  La correlacion de un envio fallido es por id de dominio; cuando el evento no
  transporta un id, por email **enmascarado** (maskEmail, helper compartido
  para que el formato no diverja entre archivos).
- **D-121** - esend-verification tiene damping **silencioso** por destinatario
  (5/hora). Al alcanzar el limite se responde el mismo 201 sin enviar nada: un
  429 o un mensaje distinto del tipo "lo limitamos" seria un orador de cuentas.
- **D-122** - El damping es **in-memory** y se acepta asi en el MVP
  mono-instancia: es control de abuso, **no frontera de seguridad**, y un
  restart o un segundo deploy lo reinician. Si alguna vez pasa a ser un control
  de seguridad real, debe moverse a almacenamiento compartido ANTES de
  depender de el. Deuda registrada, no olvido.
- **D-117** - Una invitacion a miembro ACTIVO debe notificarse por email en el
  MVP. **PENDIENTE de producto**: depende del journey de aceptacion de
  invitacion (P-3). Hoy el listener solo envia en pending_claim (wizard de
  onboarding); el skip preserva el comportamiento vigente y evita que a un
  miembro regular le llegue el link del wizard, que su own invitation
  rechazaria por INVITATION_USED. **Fase 2, no implemented.**

## 4. Observabilidad

- **D-118** - GET /api/health expone el estado de degradacion del servicio de
  correo con **minimo privilegio**: solo smtp.configured. No devuelve host,
  puerto, proveedor, ultimo error ni contadores, porque es un endpoint publico
  y un orador de infraestructura es un activo para un atacante.
  *Limite honesto de la senal*: la alcanzabilidad real del relay NO se puede
  determinar desde ahi sin enviar un correo de prueba, y un endpoint publico que
  dispara correos es un vector de spam. La alcanzabilidad se lee en los logs.
- **D-123** - Logs estructurados de resultado de envio: Mail accepted con
  ttempts, y Mail failed after retries con code, sin PII ni tokens.
- **D-124** - **Fase 1 NO persiste estado de entrega.** No hay columna de
  delivery state, ni tabla de intentos, ni outbox: seria infraestructura nueva
  sin necesidad para el incidente que la motiva. El estado vive en el log y, para
  el solicitante de un registro, en la respuesta. Persistirlo es Fase 2.

## 5. Transferencias

- **D-119** - Las notificaciones de transferencia usan **email + panel in-app**.
  Un fallo de email no altera el contrato HTTP del comando que origino la
  transferencia. No se abre un canal adicional "solo cuando falla", porque
  notificar unicamente el error es peor producto que el flujo normal.

## 6. Hallazgos de seguridad FUERA de este alcance (requieren decision propia)

1. **get-invitations expone el token de invitacion en claro** y
   InvitationResponseDto lo incluye. Es un token activo y reutilizable. No se
   corrige aqui porque el cambio de contrato (y el journey de aceptacion que lo
   necesita) es decision de producto/seguridad, no un ajuste de robustez de
   email.
2. **Token en la URL del frontend** (/invitations/{token}): llega al navegador
   y potencialmente a Referer. Es la decision vigente de D-106 del producto,
   pero conviene revisarla cuando exista el journey de aceptacion.

## 7. Correccion de etiquetado (importante para el futuro)

El prefijo **D-106 aparece con dos significados distintos** en el repositorio:

1. En este registro, **D-106** es "Atenciones durante la tenencia: la
   concesionaria puede registrar CareEpisodes", decision **diferida, pendiente de
   revision Security** (seccion 30, D-TL-18).
2. En varios comentarios de codigo y titulos de spec de listeners de email
   (user-invitation, workshop-invitation, dealership-invitation, etc.),
    "D-106" se usa para decisiones de email de invitacion que **este registro
    nunca definiio**.

**No hay colision de numeracion** (el registro llega a D-108, asi que D-109..D-124
estan libres), pero si un **etiquetado incorrecto** que hoy manda a un lector a
buscar una decision de CareEpisodes cuando quiere entender un email. Los
comentarios de los listeners tocados en esta fase se realinearon a D-109..D-124.
Los specs con el titulo historico "D-106 mail de invitacion" quedan pendientes de
alinear (cambio de texto, sin cambio de comportamiento).

## 8. Estado de la Fase 1

**IMPLEMENTADA y verificada**: frontera de error sin excepciones, clasificacion
RFC 5321 con reintentos, timeouts, TLS seguro, correlacion sin PII, damping
silencioso, health minimo, RegisterResponseDto con estado de entrega, y tests
del camino de error (antes 0 cobertura). Suite completa en verde: **90 suites /
759 tests**.

**FUERA de esta fase**: persistencia del estado de entrega (D-124), notificacion
por email de invitaciones a miembro activo (D-117 / P-3), correccion de la
exposicion de tokens en get-invitations (hallazgo 6.1).

**Diagnostico que sigue abierto**: los timeouts de `connectionTimeout` /
`greetingTimeout` hacen que el fallo sea visible y acotado en el tiempo, pero NO
arreglan la causa. La conectividad saliente hacia el relay SMTP desde Render
sigue sin diagnosticar y requiere conocer `SMTP_HOST` / `SMTP_PORT` /
proveedor. Este registro no afirma ningun proveedor concreto porque no fue
verificado.