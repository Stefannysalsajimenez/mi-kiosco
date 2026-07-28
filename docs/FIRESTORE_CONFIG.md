# Modelo Firestore agregado

## Colección `orders`

Campos nuevos o formalizados:

| Campo | Tipo | Uso |
|---|---:|---|
| `paymentMethod` | string | `cash`, `yape`, `plin` o `card` |
| `source` | string | `web` o `expo` |
| `notificationClaimedAt` | timestamp | reserva temporal para evitar envíos FCM simultáneos |
| `notificationSentAt` | timestamp | idempotencia del push |
| `notificationSuccessCount` | number | tokens FCM aceptados |
| `notificationFailureCount` | number | tokens FCM fallidos |
| `whatsappClaimedAt` | timestamp | reserva temporal para impedir envíos simultáneos |
| `whatsappSentAt` | timestamp | idempotencia del mensaje opt-in |
| `whatsappLastAttemptAt` | timestamp | último intento de mensajería |
| `billing.series` | string | serie reservada |
| `billing.number` | number | correlativo reservado |
| `billing.issuedAt` | timestamp | emisión del PDF |

Estados aceptados por las mejoras:

- `pending`
- `preparing`
- `ready`
- `done`
- `rejected`

## `config/admin`

```json
{
  "fcmTokens": [],
  "fcmUpdatedAt": "server timestamp"
}
```

Este documento no debe tener lectura pública.

## `config/payments`

Formato recomendado:

```json
{
  "yape": {
    "phone": "999999999",
    "qrUrl": "https://dominio/qr-yape.png"
  },
  "plin": {
    "phone": "999999999",
    "qrUrl": "https://dominio/qr-plin.png"
  }
}
```

También se admiten, por compatibilidad, campos planos como `yapePhone` y `yapeQrUrl`.

## `config/billing`

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

## Índices

Las consultas añadidas no requieren índices compuestos:

- `orders where customer == ...`
- `orders where createdAt >= ...`

Firestore puede solicitar un índice si posteriormente se combinan filtros y ordenamientos. Use únicamente el enlace generado por Firebase para crear el índice específico.
