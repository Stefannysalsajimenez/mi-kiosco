# Kiosco — tienda digital y panel de administración

Kiosco es una solución de venta digital pensada para un negocio minorista peruano. Permite que una persona vea productos, arme un pedido y lo envíe desde una interfaz web o móvil. Al mismo tiempo, el propietario o administrador dispone de un panel para gestionar el catálogo, pedidos, caja, horarios, personal, recibos, auditoría y apariencia del negocio.

Sitio web actual: `https://mi-kiosco-c7313.web.app`

## ¿Qué problema resuelve?

Kiosco concentra en un solo sistema las tareas más comunes de una tienda pequeña:

- mostrar un catálogo de productos;
- buscar y filtrar por categorías;
- agregar productos al carrito;
- registrar y administrar pedidos;
- controlar productos, precios, stock y descuentos;
- revisar indicadores de venta;
- gestionar caja, horario y personal;
- generar recibos informativos;
- revisar auditoría de acciones;
- personalizar nombre, logotipo y colores;
- funcionar como PWA para una experiencia similar a una aplicación instalada.

## ¿Qué es cada parte del proyecto?

| Carpeta o servicio | Para qué sirve |
| --- | --- |
| `web/` | Tienda pública y panel de administración. Está construida con HTML, CSS, JavaScript Vanilla y Bootstrap 5. |
| `kiosco-api/` | Backend serverless. Protege operaciones administrativas y genera funciones que no deben ejecutarse directamente en el navegador. |
| `kiosco-app/` | Aplicación móvil construida con React Native y Expo. |
| `docs/` | Documentación y material complementario del proyecto. |
| Firebase Auth | Autenticación de usuarios y administradores. |
| Firestore | Base de datos para productos, categorías, pedidos, configuración y demás información operativa. |
| Firebase Hosting | Publicación de la aplicación web/PWA. |
| Cloudinary | Almacenamiento externo de las imágenes nuevas del catálogo de productos. Las imágenes ya no se suben a Firebase Storage. |

## Funciones principales

### Para el cliente

- catálogo responsive;
- búsqueda de productos;
- categorías y subcategorías;
- detalle del producto;
- carrito de compra;
- cantidades y validación de stock;
- envío de pedidos;
- modo claro y oscuro;
- PWA instalable;
- experiencia adaptada a PC, laptop, tablet y celular.

### Para administración

- Dashboard;
- Pedidos;
- Productos;
- Categorías;
- Caja;
- Horario;
- Personal;
- Auditoría;
- Recibos;
- Apariencia;
- exportaciones y reportes donde corresponda.

## Diseño responsive

La navegación móvil no depende de un icono de hamburguesa:

- en la tienda, las categorías se muestran como una barra horizontal desplazable;
- en administración, las secciones se muestran como una barra horizontal desplazable;
- el carrito conserva su acceso móvil;
- las tarjetas mantienen dos columnas en teléfonos normales y una columna en pantallas extremadamente angostas;
- los modales se adaptan a desktop, tablet y celular; en teléfonos usan el alto disponible para evitar formularios comprimidos;
- el icono flotante de WhatsApp se elimina de las tarjetas de producto. La función de compartir el carrito se mantiene.

## Imágenes de productos

Las imágenes nuevas de productos se almacenan en Cloudinary y no en Firebase Storage.

El flujo es:

1. El administrador elige una imagen desde el formulario del producto.
2. El navegador pide al backend `/api/media` una firma temporal.
3. El archivo se carga directamente a Cloudinary.
4. Cloudinary guarda el original dentro de `kiosco/productos/<ID_DEL_PRODUCTO>/`.
5. Firestore guarda únicamente la URL pública y un identificador de la imagen.
6. Al reemplazar o eliminar un producto, el backend solicita la eliminación de la imagen correspondiente.

El sistema mantiene compatibilidad con imágenes antiguas que ya estuvieran en Firebase Storage. No es necesario migrarlas para publicar esta mejora.

### Formatos

El selector acepta imágenes que el navegador identifique como `image/*` y formatos comunes como JPG, JPEG, PNG, WEBP, GIF, SVG, AVIF, BMP, HEIC, HEIF, TIFF e ICO. La validación final la realiza Cloudinary según los formatos admitidos por su plataforma.

Para el plan gratuito se limita cada imagen a 10 MB.

## Tecnologías

- HTML5
- CSS3
- JavaScript Vanilla
- Bootstrap 5.3
- Bootstrap Icons
- Firebase Auth
- Firebase Firestore
- Firebase Hosting
- Firebase PWA / Service Worker
- Cloudinary para imágenes de catálogo
- Node.js 20+
- Vercel Functions para el backend existente
- React Native + Expo para `kiosco-app/`
- Chart.js
- SheetJS
- jsPDF

No es necesario convertir el frontend web a TypeScript o TSX para estas mejoras. Se conserva JavaScript Vanilla porque es el patrón actual de `web/`.

## Estructura general

```text
mi-kiosco/
├── web/                   # Tienda, panel admin y PWA
│   ├── css/
│   ├── icons/
│   ├── js/
│   ├── index.html
│   └── sw.js
├── kiosco-api/            # Backend serverless
│   ├── api/
│   │   └── _lib/
│   └── .env.example
├── kiosco-app/            # App móvil Expo
├── docs/                  # Documentación
├── scripts/               # Utilidades del repositorio
├── firebase.json
├── firestore.rules
└── README.md
```

## Requisitos para desarrollo

- Node.js 20 o superior para `kiosco-api/`;
- npm;
- Firebase CLI para publicar el frontend y las reglas;
- una cuenta Firebase correspondiente al proyecto;
- una cuenta Cloudinary para las imágenes nuevas;
- acceso al despliegue del backend configurado en `kiosco-api/`.

## Configuración de Cloudinary

Crear una cuenta de Cloudinary y obtener en el panel:

- Cloud name;
- API key;
- API secret.

En el backend, agregar estas variables de entorno:

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_ASSET_FOLDER=kiosco/productos
```

`CLOUDINARY_API_SECRET` es un secreto de servidor. Nunca debe copiarse en `web/js/`, en Firestore ni en un archivo publicado por Firebase Hosting.

En `web/js/kiosco-upgrade-config.js`, configurar el origen del backend:

```js
window.KIOSCO_UPGRADE_CONFIG = Object.freeze({
  apiBaseUrl: '',
  mediaApiBaseUrl: 'https://TU-BACKEND.vercel.app',
  firebaseVapidKey: '',
  enableCallMeBot: false,
  storeUrl: 'https://mi-kiosco-c7313.web.app'
});
```

`mediaApiBaseUrl` puede apuntar al mismo backend usado por `apiBaseUrl`. Se separa para que las imágenes puedan habilitarse sin obligar a activar otras funciones opcionales.

## Configuración del backend

El archivo `kiosco-api/.env.example` contiene las variables que deben configurarse en el entorno de despliegue.

Además de Cloudinary, el backend requiere la configuración existente de Firebase Admin y los UID autorizados:

```env
ADMIN_UIDS=
ALLOWED_ORIGINS=https://mi-kiosco-c7313.web.app,https://mi-kiosco-c7313.firebaseapp.com
```

El endpoint de imágenes exige un Firebase ID Token válido y privilegios de administrador. El navegador nunca recibe el API secret de Cloudinary.

## Desarrollo local

Desde la raíz:

```bash
npm install
npm run verify
```

Para comprobar el backend:

```bash
cd kiosco-api
npm install
npm run check
npm run dev
```

Para servir el frontend puede usarse Firebase CLI o cualquier servidor HTTP estático local. Evitar abrir `web/index.html` directamente con `file://`, porque varias funciones PWA y de red requieren HTTP/HTTPS.

## Publicación

### Frontend

Desde la raíz del proyecto:

```bash
npx firebase-tools login
npx firebase-tools deploy --only hosting
```

Si también se modificaron reglas de Firestore:

```bash
npx firebase-tools deploy --only firestore:rules
```

### Backend

Publicar `kiosco-api/` en el proveedor serverless ya configurado por el proyecto y registrar las variables de entorno de Firebase Admin, CORS y Cloudinary.

Después, colocar la URL pública del backend en `mediaApiBaseUrl`.

## Datos y seguridad

- Firestore sigue siendo la base de datos operativa.
- Firebase Auth sigue administrando la autenticación.
- Las imágenes nuevas del catálogo se guardan fuera de Firebase.
- El API secret de Cloudinary permanece exclusivamente en el backend.
- Los endpoints administrativos validan el Firebase ID Token.
- Las imágenes antiguas de Firebase Storage siguen mostrándose para conservar compatibilidad.
- No se deben versionar `.env`, claves privadas, tokens, service accounts ni secretos de API.

## Recibos

Los recibos generados por Kiosco son representaciones informativas del pedido. No deben considerarse comprobantes electrónicos tributarios válidos ante SUNAT salvo que el proyecto incorpore una integración fiscal autorizada para ese fin.

## PWA

La web usa un Service Worker para:

- cachear el shell de la aplicación;
- mejorar la carga de recursos;
- ofrecer comportamiento offline parcial;
- aplicar actualizaciones de versión;
- permitir una experiencia instalable cuando el navegador lo soporte.

Cuando se publique una versión nueva y el navegador conserve recursos anteriores, cerrar y volver a abrir la PWA o recargarla después de que aparezca el aviso de actualización.

## Verificación recomendada antes de producción

Probar como mínimo:

1. tienda en 320 px, 375 px, 414 px, 768 px, 1024 px, 1366 px y 1920 px;
2. categorías horizontales en tablet y móvil;
3. panel admin sin menú hamburguesa;
4. creación de un producto con imagen;
5. edición de un producto sin cambiar su imagen;
6. reemplazo de una imagen;
7. eliminación de un producto con imagen;
8. visualización de imágenes antiguas almacenadas en Firebase Storage;
9. carrito y envío de pedido;
10. modales de producto, pedido, personal y configuración;
11. modo claro y modo oscuro;
12. PWA después de una recarga y después de una actualización del Service Worker.

## Nota sobre servicios gratuitos

El código está preparado para funcionar con los niveles gratuitos disponibles de los servicios utilizados, pero cada proveedor mantiene sus propios límites, condiciones y cuotas. Antes de usar el sistema para una operación comercial real, revisar las condiciones vigentes de Firebase, Cloudinary y del proveedor donde se despliegue `kiosco-api/`.

## Estado del proyecto

Kiosco es un sistema funcional en evolución. La prioridad de estas mejoras es mantener compatibilidad con el comportamiento existente mientras se mejora la experiencia responsive y se separa el almacenamiento de imágenes del catálogo respecto de Firebase.
