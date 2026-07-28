# Kiosco — Recibos públicos, Apariencia y archivos de imagen

Actualización incremental para el repositorio `mi-kiosco`. No reemplaza Firestore ni elimina productos, pedidos o configuración existente.

## Funciones incluidas

### 1. Apariencia administrativa renovada

- Nombre público de la tienda.
- Texto corto o subtítulo.
- Color principal.
- Emoji alternativo.
- Tiempo estimado de entrega.
- Carga del logo desde el dispositivo del administrador.
- URL alternativa de logo.
- Vista previa antes de publicar.
- Sincronización en tiempo real mediante `config/theme`.
- Aplicación inmediata del nombre, logo, subtítulo y color en la web y la app Expo.

La identidad dentro de la aplicación se actualiza en vivo. El ícono instalado en la pantalla de inicio de Android/iOS y el nombre del paquete son recursos de compilación y requieren una nueva build para cambiar.

La carga admite archivos identificados como imagen de hasta 8 MB. Los formatos que el navegador puede decodificar se convierten a PNG cuando es necesario. Para máxima compatibilidad entre Android, iPhone, navegadores y PDF se recomienda PNG, JPG o WEBP. No existe soporte real para cualquier formato binario arbitrario.

### 2. Recibos PDF

El administrador dispone de una sección **Recibos** para:

- seleccionar un pedido;
- emitir el recibo PDF;
- descargarlo;
- copiar el enlace público del cliente;
- reutilizar el mismo correlativo sin duplicarlo.

El PDF incluye:

- logo y datos del negocio;
- RUC, dirección, teléfono y correo;
- serie y correlativo atómico;
- fecha, cliente y método de pago;
- cantidad, unidad, descripción, precio y total por producto;
- operación gravada, IGV 18 % y total;
- QR y enlace público aleatorio.

El diseño toma como referencia visual la estructura de comprobantes peruanos, pero el documento generado es informativo. No reemplaza una boleta o factura electrónica autorizada por SUNAT.

### 3. Descarga pública para el cliente

- Web: panel **Mis recibos** dentro de los pedidos del cliente.
- Expo: botón **Ver o descargar recibo** en Historial y Seguimiento.
- El PDF se abre mediante un enlace con token aleatorio.
- El cliente no necesita credenciales de administrador.
- El recibo solo se vuelve público después de que el administrador lo emite.

### 4. Seguridad de imágenes

`storage.rules` se actualiza para que:

- productos y logos sean públicamente visibles;
- solo un teléfono listado en `config/admin.phones` pueda crear, modificar o eliminar imágenes;
- los archivos tengan MIME `image/*`;
- el tamaño máximo sea 8 MB;
- el resto de rutas quede bloqueado.

## Instalación

Desde la carpeta descomprimida:

```bash
node scripts/apply-receipts-appearance.mjs \
  ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco
```

El instalador:

1. crea una copia de seguridad `.kiosco-receipts-backup-FECHA`;
2. actualiza la web, Expo y `kiosco-api`;
3. agrega CSS y JavaScript a `index.html`;
4. actualiza los recursos del Service Worker;
5. ajusta las reglas existentes de Firestore cuando reconoce su estructura;
6. reemplaza `storage.rules` con la variante administrativa.

El comando puede ejecutarse primero en modo diagnóstico:

```bash
node scripts/apply-receipts-appearance.mjs \
  ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco \
  --dry-run
```

## Configuración requerida

### `config/admin`

Debe existir en Firestore:

```json
{
  "phones": ["+51999999999"]
}
```

El teléfono debe usar el mismo formato E.164 que Firebase Authentication.

### `config/theme`

El panel administra estos campos:

```json
{
  "storeName": "Mi Kiosco",
  "storeTagline": "Productos actualizados en tiempo real.",
  "storeLogoUrl": "https://...",
  "storeLogoPath": "branding/logo/...",
  "storeEmoji": "🛍️",
  "accentColor": "#f97316",
  "etaMinutes": 30
}
```

### `config/billing`

El panel crea o actualiza:

```json
{
  "businessName": "Mi Kiosco",
  "ruc": "20123456789",
  "series": "B001",
  "nextNumber": 1,
  "address": "Lima, Perú",
  "phone": "+51999999999",
  "email": "ventas@ejemplo.com",
  "documentTitle": "RECIBO DE VENTA",
  "includesIgv": true
}
```

### Backend público

Edite:

```text
js/kiosco-upgrade-config.js
```

Y coloque la URL real:

```javascript
window.KIOSCO_UPGRADE_CONFIG = Object.freeze({
  apiBaseUrl: 'https://SU-PROYECTO.vercel.app',
  firebaseVapidKey: '...',
  enableCallMeBot: false,
  storeUrl: 'https://mi-kiosco-c7313.web.app'
});
```

Sin `apiBaseUrl`, la apariencia seguirá funcionando, pero no será posible emitir ni descargar recibos PDF.

## Validación local

### Backend

```bash
cd ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco/kiosco-api
npm install
npm run check
```

### Expo

```bash
cd ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco/kiosco-app
npm install
npx expo-doctor
npx expo start --clear
```

### Web

```bash
cd ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco
npx firebase-tools emulators:start --only hosting
```

Abra `http://127.0.0.1:5000`.

## Reglas

Revise siempre antes de desplegar:

```bash
cd ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco
git diff -- firestore.rules storage.rules
```

Después:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,storage
```

La lectura pública de pedidos conserva el seguimiento sin autenticación pedido anteriormente, pero tiene una limitación de privacidad: el nombre y el teléfono no son credenciales. La solución de privacidad fuerte requiere autenticación del cliente o un token aleatorio de seguimiento por pedido.

## Flujo de prueba

1. Iniciar sesión como administrador.
2. Entrar en **Apariencia**.
3. subir un logo PNG/JPG/WEBP y cambiar color/nombre/subtítulo;
4. confirmar la actualización inmediata en la web y Expo Go;
5. crear un pedido de prueba;
6. entrar en **Recibos** y pulsar **Emitir**;
7. abrir el perfil del cliente o la app Expo;
8. pulsar **Ver o descargar recibo**;
9. comprobar logo, correlativo, productos, IGV, total y QR.

## Archivos principales

```text
web/js/kiosco-receipts-appearance.js
web/css/kiosco-receipts-appearance.css
kiosco-api/api/boleta.js
kiosco-app/src/services/receiptService.js
rules/storage.rules
scripts/apply-receipts-appearance.mjs
```
