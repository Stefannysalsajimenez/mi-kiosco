# Kiosco — mejoras finales de categorías, recibos y pagos

Este paquete es incremental. Debe aplicarse después de las mejoras anteriores de backend, Expo responsive, apariencia y recibos.

## Alcance

### Categorías y subcategorías desde el producto

- Agrega un botón `+` al lado de **Categoría** y **Subcategoría** en el modal de productos.
- Permite crear la categoría sin salir del producto.
- La subcategoría exige seleccionar primero una categoría principal.
- Firestore actualiza los selectores mediante el `onSnapshot` existente.
- La nueva opción queda seleccionada automáticamente.

### Recibos visibles sin depender obligatoriamente de Vercel

- Agrega filtros **Hoy**, **Semana** y **Mes**.
- Permite **Emitir**, **Ver**, **Imprimir** y copiar el enlace público.
- Evita emitir recibos de pedidos rechazados.
- Si `apiBaseUrl` está configurado, abre el PDF generado por `/api/boleta`.
- Si `apiBaseUrl` no está configurado, reserva el correlativo con una transacción de Firestore y abre una representación imprimible servida por Firebase Hosting.
- El cliente puede abrir el enlace desde la web o Expo y usar **Imprimir / guardar PDF**.
- El formato mantiene los datos comerciales, detalle, subtotal, IGV, total y método de pago. Es una representación informativa; no reemplaza un comprobante electrónico validado por SUNAT.

### Confirmación de pedido y comprobante de pago

- Opciones visibles: **Efectivo**, **Tarjeta** y **Billetera digital**.
- Para billetera digital se selecciona **Yape** o **Plin**.
- Tarjeta, Yape y Plin requieren adjuntar una imagen del pago.
- La imagen se comprime antes de guardarse y se almacena en `paymentProofs/{orderId}`.
- Solo el administrador puede leer comprobantes de pago.
- La sección Recibos permite abrir, descargar e imprimir la imagen del pago.
- Notas limitadas a 300 caracteres, con contador visible.

### Expo

- Selector de imagen mediante `expo-image-picker`.
- Vista previa y opción para quitar o reemplazar la imagen.
- La imagen se envía después de crear el pedido.
- El enlace del recibo usa Vercel si está configurado; en caso contrario usa Firebase Hosting.

## Aplicación

Desde la carpeta descomprimida:

```bash
npm install
npm run verify

node scripts/apply-final-improvements.mjs \
  ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco
```

El instalador también amplía `firebase.json` para que Firebase Hosting no publique `kiosco-api`, `kiosco-app`, documentación, scripts, reglas ni archivos de npm cuando el directorio público sea `.`.

El instalador crea un respaldo:

```text
.kiosco-final-backup-AAAA-MM-DDTHH-MM-SS
```

También puede revisarse sin escribir archivos:

```bash
node scripts/apply-final-improvements.mjs \
  ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco \
  --dry-run
```

## Dependencia de Expo

Instalar la versión compatible con el SDK actual:

```bash
cd ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco/kiosco-app
npx expo install expo-image-picker
npx expo-doctor
npx expo start --clear
```

No usar `npm audit fix --force`, porque puede cambiar React Native o Expo a versiones incompatibles.

## Configuración de Expo

En `kiosco-app/.env` debe existir:

```env
EXPO_PUBLIC_KIOSCO_STORE_URL=https://mi-kiosco-c7313.web.app
```

`EXPO_PUBLIC_KIOSCO_API_URL` puede mantenerse con el valor de reemplazo mientras no se use el backend PDF. El recibo imprimible seguirá funcionando mediante Firebase Hosting.

## Reglas de Firestore

El instalador agrega reglas para `paymentProofs`. Antes de desplegar:

```bash
cd ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco
git diff -- firestore.rules
```

Luego desplegar únicamente las reglas:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

La escritura pública del comprobante está limitada a:

- pedidos existentes;
- pedidos que indiquen `paymentProofExpected == true`;
- el mismo método de pago registrado en el pedido;
- imágenes comprimidas de hasta 420 000 caracteres;
- una creación por documento de pedido.

La lectura, modificación y eliminación quedan restringidas al administrador.

## Publicación de Hosting

Después de completar todas las pruebas locales, revise primero el cambio de exclusiones:

```bash
git diff -- firebase.json
```

Cuando el resultado sea correcto, publique la web:

```bash
npx firebase-tools deploy --only hosting
```

## Hosting local

```bash
cd ~/OneDrive/Escritorio/kiosco-pwa/mi-kiosco
npx firebase-tools emulators:start --only hosting
```

Abrir:

```text
http://127.0.0.1:5000
```

## Pruebas web

1. Iniciar sesión como administrador.
2. Abrir **Productos** y editar un producto.
3. Pulsar `+` en Categoría, crear una y confirmar que quede seleccionada.
4. Elegir esa categoría, pulsar `+` en Subcategoría y crear una.
5. Realizar un pedido con Efectivo; no debe pedir imagen.
6. Realizar un pedido con Tarjeta; debe exigir imagen.
7. Realizar un pedido con Billetera digital y elegir Yape o Plin.
8. Escribir 301 caracteres en Notas; el campo debe detenerse en 300.
9. Entrar en **Recibos** y probar Hoy, Semana y Mes.
10. Emitir un recibo y confirmar que abra una pestaña nueva.
11. Pulsar **Imprimir / guardar PDF**.
12. Abrir **Pago** y verificar Descargar e Imprimir.

## Pruebas Expo

1. Abrir la app con Expo Go.
2. Agregar productos y abrir Confirmar pedido.
3. Elegir Tarjeta, Yape o Plin.
4. Seleccionar una imagen y verificar la vista previa.
5. Enviar el pedido y confirmar que aparezca en el administrador.
6. Emitir el recibo desde la web.
7. Abrir Pedidos o Seguimiento en Expo.
8. Abrir el recibo desde el navegador del teléfono e imprimir o guardar como PDF.

## Consideraciones de seguridad y costo

La imagen se comprime y se guarda en Firestore para mantener el flujo dentro del plan gratuito y evitar una carga pública abierta en Storage. Aun así, cualquier endpoint o colección que acepte contenido de clientes sin autenticación puede recibir abuso. Para una operación comercial sostenida se recomienda autenticar clientes o emitir un token de carga por pedido desde el backend.

Los recibos locales son documentos comerciales informativos. La emisión electrónica real ante SUNAT requiere el flujo tributario autorizado, certificado digital y envío del comprobante electrónico correspondiente.
