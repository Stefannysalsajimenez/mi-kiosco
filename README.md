# 🛍️ Kiosco PWA

> Aplicación web progresiva para gestionar tu tienda digital en tiempo real — hecha para Perú 🇵🇪

![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)
![PWA](https://img.shields.io/badge/PWA-Instalable-blue?logo=googlechrome)
![License](https://img.shields.io/badge/Licencia-MIT-green)

---

## 🌐 Demo en vivo

👉 **[https://mi-kiosco-c7313.web.app](https://mi-kiosco-c7313.web.app)**

---

## ✨ Características principales
 
### 🏪 Tienda pública (Cliente)
- Catálogo de productos con imágenes, precios, stock y categorías en tiempo real
- Filtrado por categorías y subcategorías
- Búsqueda de productos en tiempo real
- Carrito de compras con control de cantidades
- Modal de pedido con opciones de entrega (recojo / delivery)
- Selección de fecha y hora de entrega (hasta 3 días)
- Captura de ubicación GPS para delivery
- Historial de pedidos por cliente
- Modo oscuro / claro

### 👤 Panel de administración
- **Dashboard:** estadísticas de ingresos, pedidos, ventas y stock bajo con gráficos Chart.js
- **Pedidos:** gestión en tiempo real con cambio de estado, boleta y eliminación
- **Productos:** CRUD completo con imagen, precio, stock, categoría y estado
- **Categorías:** CRUD con soporte para subcategorías
- **Caja diaria:** apertura y cierre con resumen de ventas del día
- **Horario:** configuración de días y horas de atención
- **Personal:** gestión de empleados con roles
- **Apariencia:** nombre, logo, color principal y tiempo estimado de entrega
- Exportación a Excel (Hoy / Semana / Mes)
- Registro de auditoría de cambios

### 📱 PWA
- Instalable en Android, iOS, Windows y macOS
- Funciona offline con Service Worker
- Íconos adaptativos en todos los tamaños
- Actualizaciones automáticas sin Ctrl+F5

---

## 🚀 Instalación local

### Requisitos
- Node.js v20 o superior
- Cuenta de Firebase (plan Spark gratuito)
- Firebase CLI (`npm install -g firebase-tools`)
- Proyecto Firebase con **Firestore** y **Phone Authentication** habilitados

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/Stefannysalsajimenez/mi-kiosco.git
cd mi-kiosco

# 2. Copiar y configurar credenciales
cp js/config.example.js js/config.js
# Editar js/config.js con tus credenciales de Firebase

# 3. Servir localmente
python -m http.server 8080
# Abrir http://localhost:8080
```

---

## ⚙️ Configuración Firebase

### 1. Crear proyecto en Firebase Console
- Activar **Firestore Database**
- Activar **Phone Authentication**
- Agregar dominio en Authentication → Dominios autorizados

### 2. Número de administrador en Firestore
Crea manualmente en Firestore:
```
Colección: config
Documento: admin
Campo:     phones (array)
Valores:   "+51XXXXXXXXX", "+51XXXXXXXXX"
```
> ⚠️ El número nunca se guarda en el código — solo en Firestore.

### 3. Números de prueba (sin SMS real)
En Authentication → Método de acceso → Teléfono → Números de prueba:
```
+51XXXXXXXXX  →  código: 123456
```

---

## 🔐 Seguridad

| Archivo | ¿Se sube a GitHub? |
|---|---|
| `js/config.js` | ❌ Nunca (está en `.gitignore`) |
| `js/config.example.js` | ✅ Sí (sin credenciales reales) |
| `firestore.rules` | ✅ Sí |
| `.firebaserc` | ✅ Sí |

---

## 🌐 Deploy en Firebase Hosting

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login y deploy
firebase login
firebase deploy
```

URL resultante: `https://TU-PROYECTO.web.app`

---

## 📊 Base de datos — Estructura Firestore

```
config/admin          → phones: ["+51...", "+51..."]
products/{id}         → name, price, categoryId, active, imageUrl...
categories/{id}       → name, emoji, parentId
orders/{id}           → customer, items[], total, status, createdAt
```

---

## 🛠️ Tecnologías usadas

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Firebase Firestore | 10.7.x | Base de datos en tiempo real |
| Firebase Auth | 10.7.x | Autenticación por teléfono (admin) |
| Firebase Hosting | — | Despliegue y CDN |
| Bootstrap | 5.3.3 | UI, modales, grid, formularios |
| Bootstrap Icons | 1.11.3 | Iconografía |
| Chart.js | 4.4.0 | Gráficos del dashboard |
| SheetJS (xlsx) | 0.18.5 | Exportación a Excel |
| Service Worker | v12 | Caché, offline, PWA |

## 📱 PWA — Instalación
 
La app se puede instalar directamente desde el navegador:
 
- **Chrome/Edge (escritorio):** botón "Instalar" en la barra de navegación
- **Android:** Chrome → menú → "Añadir a pantalla de inicio"
- **iOS:** Safari → compartir → "Añadir a pantalla de inicio"

---
 
## 🔄 Flujo de la aplicación
 
```
Inicio
  ├── Botón 👤 → Modal de acceso
  │     ├── "Soy Cliente" → Ingresa nombre → Tienda
  │     └── "Administrador" → Teléfono + SMS → Panel admin
  │
  ├── TIENDA
  │     ├── Ver categorías / buscar productos
  │     ├── Agregar al carrito
  │     └── Enviar pedido (con fecha, hora, GPS, notas)
  │
  └── ADMIN
        ├── Dashboard (métricas + gráficos + Excel)
        ├── Pedidos (tiempo real + estado + boleta)
        ├── Productos (CRUD + imagen + stock)
        ├── Categorías (CRUD + subcategorías)
        ├── Caja (apertura/cierre + resumen)
        ├── Horario (días y horas de atención)
        ├── Personal (empleados + roles)
        └── Apariencia (nombre, logo, color, ETA)
```
---

## 📄 Licencia

MIT © 2026 — Hecho con ❤️ para emprendedores peruanos
