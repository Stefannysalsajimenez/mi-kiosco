# Implementación paso a paso

## 1. Preparar una rama

Desde el repositorio `mi-kiosco`:

```bash
git checkout main
git pull --ff-only
git checkout -b feature/kiosco-mejoras-integrales
```

Ejecute el instalador desde la carpeta extraída del paquete:

```bash
node scripts/apply-upgrade.mjs /ruta/al/repositorio/mi-kiosco
```

Revise los cambios:

```bash
git status --short
git diff -- index.html sw.js js/cart.js js/admin.js
```

El instalador preserva el descuento transaccional de inventario, agrega `paymentMethod` al mismo alta de pedido y cambia la clave de caja diaria para calcular la fecha en `America/Lima`.

## 2. Crear configuración Firestore

Cree o actualice estos documentos desde Firebase Console.

### `config/admin`

```json
{
  "fcmTokens": []
}
```

Los tokens se agregan automáticamente cuando un administrador presiona **Activar avisos**.

### `config/payments`

```json
{
  "yape": {
    "phone": "999999999",
    "qrUrl": "https://.../qr-yape.png"
  },
  "plin": {
    "phone": "999999999",
    "qrUrl": "https://.../qr-plin.png"
  }
}
```

`qrUrl` es opcional. Debe ser una URL HTTPS pública. Puede usar Firebase Storage respetando sus cuotas.

### `config/billing`

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

No reduzca `nextNumber` después de emitir documentos. El endpoint reserva el correlativo dentro de una transacción Firestore y reutiliza el número si la misma orden ya fue facturada.

## 3. Configurar Firebase Cloud Messaging

1. Abra Firebase Console → Project settings → Cloud Messaging.
2. En **Web Push certificates**, genere o copie la clave pública VAPID.
3. Pegue la clave en `js/kiosco-upgrade-config.js`:

```js
firebaseVapidKey: 'CLAVE_PUBLICA_VAPID'
```

4. Despliegue la web mediante HTTPS. FCM web no debe probarse desde `file://`.
5. Inicie sesión como administrador y pulse **Activar avisos**.
6. Confirme que `config/admin.fcmTokens` contiene el token.

## 4. Desplegar `kiosco-api` en Vercel

1. Importe el repositorio en Vercel.
2. Configure **Root Directory** como `kiosco-api`.
3. Copie todas las variables de `kiosco-api/.env.example` a Vercel.

Variables obligatorias:

- `FIREBASE_SERVICE_ACCOUNT_BASE64`, o las tres variables individuales de Firebase Admin.
- `ADMIN_UIDS`: UID o UIDs de los administradores, separados por coma.
- `ALLOWED_ORIGINS`: dominios Firebase y dominio personalizado.
- `PUBLIC_STORE_URL`: URL pública de la tienda.

Para producir la variable Base64 en Linux o Git Bash:

```bash
base64 -w 0 service-account.json
```

En PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

No agregue `service-account.json` al repositorio.

Tras el deploy, copie la URL de Vercel en:

```js
apiBaseUrl: 'https://SU-PROYECTO.vercel.app'
```

## 5. Configurar administrador autorizado

Obtenga el UID en Firebase Console → Authentication → Users. Colóquelo en `ADMIN_UIDS`.

El backend acepta un usuario cuando se cumple una de estas condiciones:

- su UID está en `ADMIN_UIDS`; o
- su token tiene el custom claim `admin: true`.

No basta con que el usuario esté autenticado.

## 6. WhatsApp opcional

La función está desactivada por defecto:

```js
enableCallMeBot: false
```

Para habilitarla:

1. Cada cliente debe activar CallMeBot desde su propio WhatsApp.
2. Guarde el mapeo teléfono/API key únicamente en Vercel:

```json
{"51999999999":"API_KEY_DEL_CLIENTE"}
```

3. Active `enableCallMeBot: true`.

Los teléfonos peruanos de nueve dígitos se normalizan automáticamente con el prefijo `51`.

No use este mecanismo para campañas, mensajes masivos o clientes que no dieron consentimiento.

## 7. Revisar reglas Firestore

Aplique manualmente el cambio de `docs/firestore-config-rules.patch.txt` para impedir que los tokens FCM queden expuestos o sean modificados por cualquier usuario autenticado. Reemplace `REEMPLAZAR_UID_ADMIN` por el UID administrativo o configure el custom claim `admin: true`.

El seguimiento solicitado por nombre requiere lectura pública de pedidos con el modelo actual. Esto permite que un tercero consulte pedidos si conoce o prueba otro nombre. Revise `docs/SEGURIDAD_Y_LIMITACIONES.md` antes de mantenerlo en producción.

## 8. Probar la web

Pruebe en un Hosting preview channel:

```bash
firebase hosting:channel:deploy kiosco-mejoras
```

Valide:

- creación de pedido con cada método de pago;
- recepción del push con el panel cerrado;
- estados Pendiente, En preparación, Listo y Rechazado;
- métricas Hoy, Semana y Mes;
- historial de caja y Excel;
- PDF y correlativo;
- comportamiento offline básico de la PWA.

La matriz completa está en `docs/PRUEBAS.md`.

## 9. Ejecutar la app Expo

```bash
cd kiosco-app
cp .env.example .env
npm install
npx expo-doctor
npx expo start
```

Complete en `.env` la configuración web de Firebase y la URL de Vercel. Abra el QR con Expo Go.

## 10. Desplegar Firebase Hosting

Cuando el preview sea correcto:

```bash
firebase deploy --only hosting
```

Si también modificó reglas después de revisarlas:

```bash
firebase deploy --only firestore:rules
```

## 11. Commit sugerido

```bash
git add .
git commit -m "feat: integrar pagos, seguimiento, reportes, FCM, boletas y app Expo"
git push -u origin feature/kiosco-mejoras-integrales
```
