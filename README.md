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

<!-- KIOSCO_NINE_IMPROVEMENTS:README_START -->
<!-- KIOSCO_NINE_IMPROVEMENTS:README_VERSION=2 -->
## Mejoras de catálogo, gastos, inventario y analítica (2026-08)

Esta versión incorpora nueve mejoras incrementales en el frontend Vanilla JavaScript, Bootstrap 5.3 y Firebase Spark. No agrega dependencias npm al frontend, no usa Cloud Functions y no requiere índices compuestos de Firestore. Las consultas nuevas no combinan `where()` con `orderBy()`; el filtrado y ordenamiento se ejecutan en memoria.

| Mejora | Cobertura |
|---|---|
| 2 | Productos relacionados desde el array local. |
| 4 | Compartir por WhatsApp y enlace `#producto-ID`. |
| 6 | Gastos, resumen, gráfico, Excel, utilidad y reglas. |
| 8 | Alertas, desactivación atómica, reposición y auditoría. |
| 11 | Modal individual completo y compartible. |
| 16 | Calendario de calor y pedidos por hora. |
| 20 | Catálogo PDF A4 agrupado por categoría. |
| 22 | Generación, descarga y escaneo QR. |
| 25 | Plantilla, vista previa e importación Excel. |

### Productos relacionados, detalle y enlaces compartibles

- Las tarjetas de la tienda abren un modal de detalle con imagen, descripción completa, precio, categoría, subcategoría, indicador de stock, selector de cantidad y acciones de carrito.
- La sección **También te puede interesar** usa exclusivamente el array de productos que `Store` ya mantiene en memoria. Prioriza hasta cuatro productos activos de la misma categoría; cuando no existen coincidencias, usa productos activos aleatorios.
- Cada tarjeta y el modal incluyen compartir por WhatsApp mediante `https://wa.me/?text=...`.
- Las URLs de producto usan el formato `https://mi-kiosco-c7313.web.app/#producto-ID`. Al abrir una URL de producto, la tienda restablece el filtro, desplaza la tarjeta al centro, aplica un resaltado temporal y abre el modal.
- El modal utiliza `history.pushState`; al cerrarse elimina el hash sin recargar la aplicación.

### Gastos y utilidad neta

Se agregó la sección **Gastos** entre Caja y Horario. La colección `expenses` utiliza este esquema:

```text
expenses/{expenseId}
  description: string
  amount: number
  category: "Mercadería" | "Servicios" | "Transporte" | "Personal" | "Otros"
  date: timestamp
  createdAt: timestamp
```

La sección ofrece alta, edición, eliminación, filtro mensual, tarjetas por categoría, total mensual, gráfico por día y exportación Excel con SheetJS. El Dashboard incorpora **Gastos del período** y **Utilidad neta**, calculada como ingresos no rechazados menos gastos del mismo período.

Las reglas incluidas permiten leer y escribir gastos únicamente a usuarios autenticados:

```text
allow read, write: if request.auth != null;
```

### Inventario y reposición

- La transacción existente del checkout calcula `nextStock` y, cuando llega a cero, escribe también `active: false` en la misma operación atómica. El proyecto ya descontaba el inventario al crear el pedido; no se vuelve a descontar al cambiar su estado para evitar una salida duplicada.
- Productos administrativos muestran **Sin stock** en rojo intermitente para stock cero y **Stock bajo** en amarillo para cantidades de 1 a 5.
- El Dashboard incluye productos con stock cero aunque hayan quedado inactivos y los diferencia visualmente de los productos con stock bajo.
- **Reponer stock** suma una cantidad al valor actual, reactiva el producto y registra de forma atómica un documento en `audit_log` con `action`, `product`, `previousStock`, `addedQty`, `newStock`, `admin` y `createdAt`.

### Mapa de calor de pedidos

El Dashboard incluye la pestaña **Mapa de calor**:

- Calendario mensual construido con HTML y CSS Grid. La intensidad representa 0, 1–3, 4–7 y 8 o más pedidos; cada día informa pedidos e ingresos mediante tooltip.
- Gráfico Chart.js por hora para el período seleccionado previamente: Hoy, Semana o Mes.
- Ambas visualizaciones usan el array de pedidos ya cargado por `Dashboard`; no crean otra consulta a Firestore.

### Catálogo PDF

En Productos, **Exportar catálogo PDF** genera un archivo A4 vertical llamado `catalogo-YYYY-MM-DD.pdf`. Incluye portada, logo y nombre de `config/theme`, fecha, total de productos, agrupación por categoría, tabla con imagen, nombre, descripción, categoría, precio y stock, además de pie y numeración. Las imágenes se convierten a base64 mediante canvas; si el servidor remoto no permite CORS o no existe imagen, se muestra el texto `Sin imagen`.

### QR de producto y escáner

- El modal de producto y las tarjetas administrativas generan un QR con la URL pública del producto mediante el bundle navegador `qrcode@1.5.1` servido por cdnjs y permiten descargarlo como PNG. Se usa esta versión porque los paquetes npm 1.5.2–1.5.4 no publicaron el directorio `build/` precompilado.
- El header público incluye un escáner. Usa `BarcodeDetector` cuando el navegador lo soporta y `jsQR` desde CDN como alternativa. Requiere HTTPS y permiso de cámara.
- Un QR válido navega al hash correspondiente, resalta la tarjeta y abre el modal de detalle.

### Importación Excel

**Importar desde Excel** permite:

1. Descargar una plantilla SheetJS con las columnas `nombre`, `descripcion`, `precio`, `stock`, `categoria`, `subcategoria`, `imageUrl` y `activo`.
2. Cargar `.xlsx` o `.xls` y revisar las primeras cinco filas.
3. Validar nombre, precio, stock, URL, estado y categorías sin realizar consultas adicionales; los IDs se resuelven desde el array local de `Admin`.
4. Crear productos en grupos de diez promesas concurrentes y mostrar progreso, cantidad importada y errores por fila.

`stock` vacío se guarda como ilimitado. `activo` acepta `SI` o `NO` y usa `SI` cuando queda vacío. Cada producto recibe `createdAt` y `updatedAt` con `serverTimestamp()`.

### Archivos incorporados

```text
web/css/kiosco-nine-improvements.css
web/js/kiosco-product-experience.js
web/js/kiosco-admin-operations.js
web/js/kiosco-dashboard-heatmap.js
```

También se actualizaron `web/index.html`, `web/js/firebase.js`, `web/js/cart.js`, `web/js/admin.js`, `web/js/dashboard.js`, `web/sw.js` y `firestore.rules`. El Service Worker cambia de versión para invalidar la caché anterior e incluye los nuevos recursos en el app shell.

### Validación y despliegue

```bash
for file in web/js/*.js; do node --check "$file" || exit 1; done
firebase deploy --only firestore:rules
firebase deploy --only hosting
```

Para desplegar reglas y hosting en una sola operación:

```bash
firebase deploy --only firestore:rules,hosting
```

Después del despliegue, conviene cerrar y volver a abrir la PWA o aceptar la actualización del Service Worker para cargar la nueva versión del app shell.
<!-- KIOSCO_NINE_IMPROVEMENTS:README_END -->




<!-- KIOSCO_REPOSITORY_MEDIA_V120 -->
## ⚙️ Cómo funciona la carga de imágenes

- **Local:** ejecuta el frontend y `kiosco-api`; el endpoint guarda la imagen directamente en `web/uploads/`.
- **Producción:** el mismo endpoint usa GitHub Contents API con un token privado almacenado únicamente en el backend. Cada carga crea o reemplaza el archivo del producto en la rama configurada.
- **Rendimiento:** antes de enviar, Kiosco redimensiona la imagen a un máximo de 1600 px, genera WEBP y limita el archivo final a 800 KB (objetivo 500 KB). El catálogo usa carga diferida de imágenes y Firebase Hosting sirve los archivos publicados.
- **Seguridad:** el endpoint exige un Firebase ID token de un UID administrador. El token de GitHub nunca se expone al navegador.
- **Despliegue automático:** para que una carga realizada desde producción llegue a Firebase Hosting sin intervención manual, configura una vez la integración oficial con GitHub usando `firebase init hosting:github`.

### Variables privadas del backend

```env
KIOSCO_MEDIA_MODE=
KIOSCO_GITHUB_REPOSITORY=Stefannysj/mi-kiosco
KIOSCO_GITHUB_BRANCH=main
KIOSCO_GITHUB_TOKEN=TU_TOKEN_PRIVADO
```

El token recomendado es un fine-grained personal access token limitado únicamente al repositorio de Kiosco y al permiso **Contents: Read and write**.
