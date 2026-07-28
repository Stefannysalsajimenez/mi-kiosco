# Seguridad y limitaciones reales

## 1. No existe una garantía de backend comercial gratuito e ilimitado

La implementación usa Vercel porque técnicamente encaja con funciones Node.js y GitHub. Sin embargo, el plan Hobby está orientado a uso personal y no comercial, y tiene cuotas mensuales. Para una tienda operada comercialmente, revise las condiciones vigentes y migre a un plan permitido antes de depender del servicio en producción.

La afirmación «Railway ofrece 500 horas gratis al mes» ya no describe su oferta actual. Railway Free entrega un crédito mensual pequeño y Railway Hobby es de pago.

Render Free dispone de horas mensuales, pero la propia documentación indica que no debe usarse para producción y suspende el servicio después de 15 minutos sin tráfico.

Conclusión: el código puede desplegarse sin costo para demostración, evaluación o uso personal permitido, pero no debe prometerse operación comercial indefinida y gratuita.

## 2. Autorización administrativa

`/api/stats` y `/api/boleta` validan el Firebase ID token y exigen una de estas condiciones:

- UID incluido en `ADMIN_UIDS`; o
- custom claim `admin: true`.

Esto evita que cualquier usuario autenticado pueda generar documentos o consultar estadísticas.

Las funciones `/api/notify` y `/api/whatsapp` son invocadas por el cliente después de crear un pedido. Para reducir abuso:

- aceptan únicamente IDs Firestore con formato válido;
- exigen que la orden exista y sea reciente;
- aplican idempotencia en el documento de la orden;
- FCM usa una reserva temporal para evitar carreras concurrentes.

No exponga la cuenta de servicio de Firebase en JavaScript, GitHub, Firebase Hosting ni Expo.

## 3. Seguimiento por nombre

El requisito de consultar pedidos sin autenticación filtrando únicamente por `customer` no proporciona control de identidad.

Consecuencias:

- dos personas con el mismo nombre reciben resultados coincidentes;
- un tercero puede probar nombres y consultar pedidos;
- las reglas Firestore no pueden saber que un nombre ingresado pertenece realmente al visitante.

La implementación conserva este comportamiento porque fue solicitado. Para un uso real con privacidad, la solución correcta es autenticar al cliente y guardar `customerUid`, o asignar un token de seguimiento aleatorio por pedido y consultar por ese token.

## 4. Tokens FCM

El repositorio actual permite lectura pública general de `config` y escritura a cualquier usuario autenticado. Si `config/admin` contiene tokens FCM, quedarían expuestos o podrían alterarse. Aplique `firestore-config-rules.patch.txt` antes de activar notificaciones; el parche exige UID administrativo o custom claim `admin: true` y excluye `config/admin` de la regla genérica.

Los tokens pueden expirar o invalidarse. `/api/notify` elimina automáticamente los tokens que FCM reporta como inválidos.

## 5. WhatsApp y CallMeBot

CallMeBot exige activación individual por parte del destinatario y una API key asociada al número. No permite enviar libremente a cualquier cliente solo por conocer su teléfono.

La función se entrega desactivada por defecto y utiliza una lista opt-in guardada en variables de Vercel. No es sustituto de WhatsApp Business Platform y no debe emplearse para mensajería masiva.

## 6. Boleta PDF y SUNAT

El PDF contiene serie, correlativo, cliente, productos, subtotal, IGV, total, QR y pie de página, pero es una representación informativa.

No implementa:

- XML UBL;
- firma digital;
- envío a SUNAT u OSE;
- CDR;
- resumen diario, comunicación de baja ni contingencia;
- consulta de validez tributaria.

Una emisión electrónica válida requiere RUC habilitado, certificado digital y el flujo técnico autorizado por SUNAT, directamente o mediante PSE/OSE según corresponda.

## 7. Correlativo

El número se reserva mediante una transacción Firestore. Una vez reservado, no se reutiliza para otra orden. Si la generación del PDF falla después de reservarlo, el pedido conserva ese número para que un reintento genere el mismo documento.

No edite manualmente `billing.number` ni reduzca `config/billing.nextNumber`.

## 8. Caja local

El historial se lee desde `localStorage`. Por tanto:

- existe solo en el navegador y perfil donde se registró;
- puede perderse al limpiar datos del navegador;
- no se sincroniza entre dispositivos;
- no constituye un libro de caja centralizado.

El Excel es una exportación operativa, no un respaldo tributario.

## 9. Dominios gratuitos

Freenom ya no es una fuente confiable de dominios gratuitos. Un dominio personalizado normalmente debe comprarse o administrarse desde un proveedor que permita TXT y A/AAAA. Firebase no cobra un adicional por enlazar el dominio, pero el registrador sí puede cobrar por el dominio.

El dominio `mi-kiosco-c7313.web.app` permanece como opción sin comprar un dominio.
