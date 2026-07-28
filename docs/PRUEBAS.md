# Matriz de pruebas

## Precondiciones

- Preview channel de Firebase Hosting activo.
- Backend Vercel desplegado.
- `ADMIN_UIDS` configurado.
- `config/admin`, `config/payments` y `config/billing` creados.
- Regla de `config/admin` protegida.
- Navegador con permisos de notificación habilitados.

## Casos web

| ID | Caso | Resultado esperado |
|---|---|---|
| WEB-01 | Pedido con Efectivo | `orders.paymentMethod == "cash"` |
| WEB-02 | Pedido con Yape | muestra número/QR y guarda `yape` |
| WEB-03 | Pedido con Plin | muestra número/QR y guarda `plin` |
| WEB-04 | Pedido con Tarjeta | guarda `card`, sin pasarela externa |
| WEB-05 | Seguimiento Pendiente | panel se actualiza por `onSnapshot` |
| WEB-06 | Cambiar a Preparando | cliente ve `En preparación` sin recargar |
| WEB-07 | Cambiar a Listo | cliente ve `Listo` sin recargar |
| WEB-08 | Rechazar | cliente ve `Rechazado` |
| WEB-09 | Pago en tarjeta admin | tarjeta de pedido muestra icono y método |
| WEB-10 | FCM con admin cerrado | aparece notificación de nuevo pedido |
| WEB-11 | Token FCM inválido | backend lo elimina de `config/admin` |
| WEB-12 | Repetir `/notify` | no duplica el aviso del mismo pedido |

## Dashboard

| ID | Caso | Resultado esperado |
|---|---|---|
| DASH-01 | Filtro Hoy | métricas usan solo el día actual |
| DASH-02 | Filtro Semana | compara con semana anterior |
| DASH-03 | Filtro Mes | compara con mes anterior |
| DASH-04 | Producto más vendido | nombre y unidades correctos |
| DASH-05 | Hora pico | hora con mayor cantidad de pedidos |
| DASH-06 | Cliente frecuente | nombre y número de pedidos |
| DASH-07 | Métodos de pago | gráfico coincide con órdenes del período |
| DASH-08 | Top 5 | orden descendente y barras proporcionales |
| DASH-09 | Rechazados | no suman ingresos, pero siguen siendo pedidos |

## Caja

| ID | Caso | Resultado esperado |
|---|---|---|
| CASH-01 | Caja abierta | fila con estado Abierta y cierre `—` |
| CASH-02 | Caja cerrada | calcula cierre y diferencia |
| CASH-03 | Registro anterior a 30 días | no se muestra en la tabla |
| CASH-04 | Exportar | genera `.xlsx` con seis columnas |
| CASH-05 | Otro navegador | historial no aparece, por ser localStorage |

## Backend

| ID | Caso | Resultado esperado |
|---|---|---|
| API-01 | Stats sin token | HTTP 401 |
| API-02 | Stats usuario no admin | HTTP 403 |
| API-03 | Stats admin | HTTP 200 con período actual/anterior |
| API-04 | Boleta sin token | HTTP 401 |
| API-05 | Boleta admin | PDF descargable |
| API-06 | Repetir boleta | conserva serie y correlativo |
| API-07 | Dos boletas simultáneas | correlativos diferentes |
| API-08 | WhatsApp sin opt-in | HTTP 409, sin mensaje |
| API-09 | WhatsApp con opt-in | envío único e idempotente |

## Expo

| ID | Caso | Resultado esperado |
|---|---|---|
| APP-01 | Productos | actualización Firestore en tiempo real |
| APP-02 | Carrito | sumar, restar y quitar productos |
| APP-03 | Pedido | crea orden con `source: "expo"` |
| APP-04 | Historial | muestra pedidos por nombre guardado |
| APP-05 | Seguimiento | cambio de estado se refleja en vivo |
| APP-06 | Yape/Plin | muestra configuración Firestore |
| APP-07 | Reinicio | conserva nombre y teléfono en AsyncStorage |

## PWA y regresión

- Instalar PWA desde navegador compatible.
- Abrir versión instalada y verificar navegación.
- Verificar tienda, carrito, acceso admin, productos, categorías, horario y personal existentes.
- Limpiar cache del service worker al cambiar de versión si se observa contenido antiguo.
- Confirmar que no hay errores en Console ni solicitudes 4xx/5xx inesperadas.
