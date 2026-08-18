# Kiosco - mantenimiento integral

Este paquete se copia sobre el repositorio actual de Kiosco. Mantiene Firebase, JavaScript Vanilla, Bootstrap 5, Bootstrap Icons, PWA y la estructura existente `web/js`, `web/css` e `index.html`.

## Objetivo

La actualización conserva las mejoras funcionales de tienda y administración e incorpora mantenimiento técnico, refuerzo de seguridad y una biblioteca de imágenes administrable desde el propio panel. El propietario puede subir, reutilizar, cambiar y quitar imágenes sin editar código ni tocar GitHub. La opción de pegar una dirección URL se mantiene.

## Archivos incluidos

- `web/js/kiosco-upgrade-config.js`: configuración pública segura y cargador del sistema.
- `web/js/kiosco-system.js`: mejoras funcionales, seguridad operativa, biblioteca de imágenes, permisos, offline y administración.
- `web/css/kiosco-system.css`: estilos responsive para tienda, panel, accesibilidad, imágenes y biblioteca.
- `web/sw.js`: caché PWA actualizado e inclusión del sistema en el app shell.
- `firestore.rules`: autorización reforzada e incorporación de `media_assets`.
- `storage.rules`: acceso restringido para el Storage legado.
- `COMO_APLICAR.txt`: instalación, prueba y despliegue.
- `MANTENIMIENTO_SEGURIDAD.txt`: detalle técnico y limitaciones conocidas.

## Biblioteca de imágenes

La administración incorpora `Biblioteca de imágenes` con tres carpetas lógicas:

- Productos.
- Logos.
- General.

Desde allí el administrador puede:

- Subir archivos desde PC o móvil.
- Arrastrar y soltar archivos.
- Guardar una imagen usando una dirección URL.
- Buscar y filtrar imágenes.
- Copiar la URL de una imagen.
- Eliminar imágenes que ya no estén en uso.
- Reutilizar imágenes guardadas en productos.
- Reutilizar imágenes guardadas como logo.

Las referencias se guardan en Firestore en `media_assets`. Una imagen asociada a un producto o al logo registra su uso; por seguridad, la biblioteca impide eliminar manualmente una imagen mientras siga referenciada.

Cuando se cambia o quita la imagen de un producto, se libera automáticamente la referencia anterior. Cuando se elimina un producto, el sistema intenta liberar también su imagen. Lo mismo ocurre al cambiar o quitar el logo.

## Imágenes de productos

El formulario conserva tres métodos:

1. Subir archivo desde el dispositivo.
2. Elegir una imagen de la Biblioteca.
3. Pegar una dirección URL externa.

Además incluye vista previa, validación, drag & drop, botón para pegar desde el portapapeles y botón para quitar la imagen actual.

## Logo

En Apariencia se puede:

- Subir un logo desde el dispositivo.
- Elegir un logo de la Biblioteca.
- Pegar y guardar una dirección URL externa.
- Quitar el logo personalizado.

## Almacenamiento de archivos

Las nuevas cargas usan Cloudinary mediante Upload API con un Upload Preset unsigned. El API Secret nunca se coloca en el frontend.

Configuración inicial, una sola vez:

1. Crear una cuenta de Cloudinary.
2. Crear un Upload Preset con modo `Unsigned`.
3. Limitar el preset a archivos visuales admitidos, máximo 10 MB y nombres únicos.
4. Iniciar sesión como administrador principal.
5. Ir a `Administración > Apariencia > Imágenes del sistema`.
6. Guardar `Cloud name` y `Upload preset`.

Las cargas se organizan lógicamente en `kiosco/products`, `kiosco/logos` y `kiosco/general`. Si el preset de Cloudinary fija su propia carpeta, esa configuración puede prevalecer en el proveedor; Kiosco mantiene de todas formas su clasificación interna en Firestore.

### Eliminación física en Cloudinary

Kiosco elimina inmediatamente la asociación del producto/logo y retira la imagen de su biblioteca cuando ya no tiene usos. Si Cloudinary devuelve un `delete_token` vigente, también intenta eliminar físicamente el archivo. Los tokens de borrado del cliente tienen una ventana limitada; pasado ese tiempo, la eliminación física requiere una operación firmada del lado servidor. En ese caso Kiosco marca el recurso como retirado del sistema para que no vuelva a aparecer ni utilizarse.

No se expone API Secret para forzar borrados desde el navegador.

## Privacidad y seguridad

- Los parámetros sensibles conocidos se eliminan de la URL.
- `config/admin`, `config/staff` y `config/media` no son públicos.
- `media_assets` solo puede ser leído o modificado por administradores/personal reconocido.
- Los cambios administrativos de productos/categorías requieren administrador o personal reconocido.
- El Storage legado no permite escritura pública.
- Los clientes bloqueados no pueden listarse desde una sesión pública.
- Las sesiones administrativas no son de lectura pública.
- La reducción de stock del checkout queda vinculada al pedido creado en la misma transacción.
- No se almacenan API secrets en los archivos frontend.

## Funcionalidades mantenidas

- Vista cuadrícula/lista.
- Filtro y ordenamiento local.
- Oferta y producto del día.
- Estado abierto/cerrado.
- Modo accesible.
- Variantes de producto.
- Pedir de nuevo.
- Clientes bloqueados.
- Splash screen.
- Gestos táctiles.
- Vibración y beep administrativo.
- Caché local y comportamiento offline.
- Registro de sesiones.
- Modo mantenimiento.
- Permisos granulares del personal.
- Botón volver arriba.
- Responsive en PC, tablet y móvil.

## Validación

Desde la raíz:

```bash
node --check web/js/kiosco-upgrade-config.js
node --check web/js/kiosco-system.js
node --check web/sw.js
```

Prueba local:

```bash
firebase serve --only hosting
```

Despliegue:

```bash
firebase deploy --only firestore:rules,storage,hosting
```

## Compatibilidad de pedidos

El historial de clientes actual no usa una identidad Firebase individual para cada comprador. Para no romper esa funcionalidad, `orders` conserva lectura pública. No deben guardarse contraseñas, tokens, claves privadas ni secretos dentro de pedidos. Una migración futura a clientes autenticados permitiría cerrar también esa lectura.
