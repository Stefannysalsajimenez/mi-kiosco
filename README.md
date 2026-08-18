# Kiosco — actualización integral

Este paquete se copia sobre el repositorio actual de Kiosco. Mantiene Firebase, JavaScript Vanilla, Bootstrap 5, Bootstrap Icons y la estructura existente `web/js`, `web/css` e `index.html`.

## Aplicación

1. Haz una copia de seguridad de tu proyecto actual.
2. Copia el contenido de esta carpeta sobre la raíz de `mi-kiosco` y acepta reemplazar los archivos indicados.
3. No elimines los demás archivos del proyecto.
4. Despliega reglas y hosting:

```bash
firebase deploy --only firestore:rules,storage,hosting
```

Si solo cambias el frontend:

```bash
firebase deploy --only hosting
```

## Archivos incluidos

- `web/js/kiosco-upgrade-config.js`: conserva la configuración existente y carga las mejoras antes de la inicialización de la aplicación.
- `web/js/kiosco-system.js`: funcionalidades de tienda, productos, administración, accesibilidad, offline, seguridad operativa y permisos.
- `web/css/kiosco-system.css`: estilos responsive, lista/cuadrícula, accesibilidad, ofertas, mantenimiento y componentes administrativos.
- `firestore.rules`: reglas para personal, clientes bloqueados, sesiones y módulos existentes.
- `storage.rules`: imágenes de productos JPG, PNG, WEBP o GIF, máximo 5 MB.

El `index.html` actual no se reemplaza. El proyecto ya carga `web/js/kiosco-upgrade-config.js`; este archivo incorpora de forma automática `kiosco-system.css` y `kiosco-system.js`, evitando perder los modales, módulos y scripts que ya existen.

## Mejoras incluidas

### Imágenes de producto

- Placeholder correcto: `https://ejemplo.com/imagen.jpg`.
- Vista previa automática con debounce de 600 ms.
- Error visible cuando una URL no puede cargar.
- Botón para pegar URL desde el portapapeles.
- Dimensiones y peso estimado de imágenes remotas.
- Dimensiones y peso real del archivo local.
- Drag & drop para JPG, PNG, WEBP y GIF hasta 5 MB.
- Subida compatible con Firebase Storage cuando el bucket está habilitado.
- URL externa disponible como alternativa.

### Catálogo público

- Vista cuadrícula y lista con preferencia `kk_view_mode`.
- Vista lista por defecto en pantallas móviles cuando no existe preferencia previa.
- Precio mínimo/máximo con `kk_price_filter`.
- Contador de productos encontrados.
- Ordenamiento local con `kk_sort_mode`.
- Orden por precio, nombre y fecha de creación sin consultas adicionales a Firestore.
- Botón flotante para volver arriba.
- Producto del día.
- Oferta del día con cuenta regresiva.
- Estado Abierto/Cerrado basado en `config/settings.schedule`.
- Modo de lectura fácil con `kk_accessible`.

### Carrito y pedidos

- Variantes de productos con precio adicional.
- El nombre y precio de la variante se mantienen al crear el pedido.
- Pedido anterior con “Pedir de nuevo”.
- Revisión local de productos disponibles antes de reconstruir el carrito.
- Validación de clientes bloqueados antes de enviar un pedido.
- Bloqueo de confirmación cuando no hay conexión.
- El carrito se conserva en `localStorage`.
- Advertencia cuando la tienda está fuera de horario.

### Administración

- Oferta del día configurable desde Apariencia.
- Producto del día configurable desde Apariencia.
- Modo mantenimiento en tiempo real.
- Vibración `[200, 100, 200]` y beep de 800 Hz para nuevos pedidos.
- Toggle `kk_vibration` cuando el dispositivo soporta vibración.
- Clientes bloqueados con motivo, fecha y administrador responsable.
- Desbloqueo desde Personal.
- Registro de sesiones de administradores y empleados autenticados.
- Vista de últimas 50 sesiones, ordenada en JavaScript.
- Navegador, sistema operativo, resolución y tipo de dispositivo.
- Permisos granulares de empleados por módulo y acción.

### PWA, móvil y conectividad

- Splash de carga mostrado antes de `DOMContentLoaded` y retirado cuando llegan los primeros productos o a los 4 segundos como fallback.
- Swipe izquierda para abrir carrito.
- Swipe derecha para cerrar carrito.
- Swipe derecha para abrir menú administrativo.
- Swipe izquierda para cerrar menú administrativo.
- Pull to refresh en la tienda.
- Caché local de productos `kk_prods_cache` y categorías `kk_cats_cache`.
- Banner de desconexión.
- Catálogo y carrito utilizables con los últimos datos almacenados.
- Reconexión automática a Firestore al recuperar Internet.

## Firestore

Se utilizan los siguientes documentos y colecciones nuevas:

- `config/offer`
- `config/featured`
- `config/maintenance`
- `config/staff` conserva `members` y añade `phones` para validar personal en reglas.
- `blocked_clients/{id}`
- `session_log/{id}`

No se utiliza `orderBy()` combinado con `where()`. El ordenamiento de sesiones, productos, clientes bloqueados y pedidos del perfil se realiza en JavaScript.

## Permisos del personal

Cada miembro puede tener:

```text
permissions.dashboard
permissions.orders
permissions.products.view/create/edit/delete
permissions.categories.view/create/edit/delete
permissions.cash
permissions.expenses
permissions.schedule
permissions.staff
permissions.audit
permissions.appearance
```

El administrador principal de `config/admin.phones` siempre conserva acceso completo. Los empleados se validan contra `config/staff.members`; el sistema mantiene además `config/staff.phones` para que las reglas de Firestore reconozcan al personal autorizado.

## Consideración de Firebase Storage y plan gratuito

La tienda funciona con URL externas sin depender de Storage. Si el bucket de Firebase Storage del proyecto está habilitado, la subida directa también funciona con los límites definidos en `storage.rules`. Si Firebase impide usar el bucket por condiciones de facturación del proyecto, utiliza el campo URL externa; las demás mejoras no dependen de Storage ni de Cloud Functions.

## Validación rápida

Desde la raíz del proyecto:

```bash
node --check web/js/kiosco-upgrade-config.js
node --check web/js/kiosco-system.js
```

Después abre la aplicación y valida como mínimo:

- tienda pública en escritorio y móvil;
- filtros, ordenamiento y cambio de vista;
- agregar producto normal y producto con variante;
- confirmar pedido;
- modo offline y recuperación de conexión;
- formulario de producto e imágenes;
- Apariencia, Personal, Pedidos y Auditoría/Sesiones;
- permisos con un empleado de prueba;
- mantenimiento activado y desactivado en tiempo real.
