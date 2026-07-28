# Kiosco API — Vercel Serverless Functions

Backend Node.js para Firebase Admin, notificaciones FCM, estadísticas, mensajería opt-in y generación de boletas PDF.

## Endpoints

- `POST /api/notify` — recibe `{ "orderId": "..." }`, valida que el pedido sea reciente, aplica idempotencia y envía FCM a `config/admin.fcmTokens`.
- `POST /api/whatsapp` — recibe `{ "orderId": "..." }`; solo envía si el teléfono está previamente autorizado en `CALLMEBOT_CLIENT_KEYS_JSON`.
- `GET /api/stats?period=day|week|month` — requiere `Authorization: Bearer <Firebase ID token>`.
- `POST /api/boleta` — requiere token Firebase y `{ "orderId": "..." }`; reserva correlativo mediante transacción.

## Deploy en Vercel, en 3 pasos

1. Suba `kiosco-api/` al repositorio y, en Vercel, seleccione **Add New → Project → Import Git Repository**. Defina `kiosco-api` como **Root Directory**.
2. Copie las variables de `.env.example` en **Project Settings → Environment Variables**. Para `FIREBASE_SERVICE_ACCOUNT_BASE64`, descargue una cuenta de servicio desde Firebase/Google Cloud y codifique el JSON completo en Base64. Configure también `ADMIN_UIDS` con los UID autorizados. Nunca confirme el JSON ni la clave privada en Git.
3. Presione **Deploy**. Copie la URL final, por ejemplo `https://kiosco-api.vercel.app`, y colóquela en `window.KIOSCO_UPGRADE_CONFIG.apiBaseUrl` del frontend.

Cada push a la rama vinculada genera un despliegue automático. El plan Hobby tiene cuotas y está restringido por Vercel a uso personal/no comercial. Para una tienda comercial debe revisarse y contratarse un plan permitido; no debe describirse como backend productivo gratuito e ilimitado.


## Autorización administrativa

`GET /api/stats` y `POST /api/boleta` aceptan únicamente tokens Firebase cuyo UID figure en `ADMIN_UIDS` o que incluyan el custom claim `admin: true`. Un usuario autenticado sin ese permiso recibe HTTP 403.

## Documentos Firestore requeridos

`config/admin`:

```json
{
  "fcmTokens": []
}
```

`config/billing`:

```json
{
  "businessName": "Kiosco",
  "ruc": "20123456789",
  "address": "Lima, Perú",
  "phone": "+51 999 999 999",
  "series": "B001",
  "nextNumber": 1
}
```

## CallMeBot

CallMeBot exige que cada número active previamente su propia API key. Guarde el mapeo exclusivamente en Vercel:

```json
{"51999999999":"123456"}
```

Esta integración no sustituye WhatsApp Business API y no es adecuada para mensajería comercial masiva.

## Alcance tributario

El PDF es una representación profesional e informativa. No genera XML UBL, firma digital, envío a SUNAT/OSE, CDR ni baja/resumen diario. Para una boleta electrónica con validez tributaria se requiere un RUC habilitado, certificado digital y un flujo autorizado por SUNAT u OSE/PSE.
