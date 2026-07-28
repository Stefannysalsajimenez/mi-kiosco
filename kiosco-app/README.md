# Kiosco App — Expo Go

Aplicación React Native compatible con Expo Go. Consume las mismas colecciones `products`, `orders` y `config/payments` del proyecto Firebase de la web.

## Funcionalidad incluida

- Tienda con productos Firestore en tiempo real.
- Búsqueda, carrito y control de cantidades.
- Modal de pedido con Efectivo, Yape, Plin y Tarjeta.
- Lectura de número/QR desde `config/payments`.
- Creación transaccional de pedidos, validación de stock y descuento de inventario con `source: "expo"`.
- Historial por nombre del cliente mediante `onSnapshot`.
- Seguimiento en tiempo real: pendiente, preparación, listo, completado o rechazado.
- Aviso FCM al administrador a través de `POST /api/notify`.
- Perfil básico guardado localmente con AsyncStorage.

## Instalación

1. Copie `.env.example` como `.env` y complete la configuración web de Firebase y la URL de Vercel.
2. Ejecute:

```bash
npm install
npx expo-doctor
npx expo start
```

3. Instale Expo Go en el teléfono y escanee el QR mostrado por Expo. El teléfono y la computadora deben poder comunicarse por la misma red; use el modo Tunnel si la red local lo bloquea.

## Firebase

La aplicación usa Firebase JS SDK porque funciona dentro de Expo Go. No use `@react-native-firebase/firestore` para esta variante: esa biblioteca requiere módulos nativos y una development build.

Las reglas actuales deben permitir lectura pública de productos, creación pública de pedidos y lectura de pedidos según el modelo elegido. El seguimiento exclusivamente por `customer` es funcional, pero no proporciona identidad fuerte: dos personas con el mismo nombre podrían ver pedidos coincidentes. Para producción se recomienda autenticación del cliente y un `customerUid`.
