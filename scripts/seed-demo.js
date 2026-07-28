// ===== seed-demo.js =====
// Script para poblar Firestore con datos de demostración
// Úsalo UNA sola vez desde la consola del navegador (F12) cuando estés logueado como admin
//
// CÓMO USAR:
//   1. Abre tu Kiosco en el navegador
//   2. Inicia sesión como administrador
//   3. Abre la consola del navegador (F12 → Consola)
//   4. Pega todo este código y presiona Enter
//   5. Espera el mensaje "✅ Datos demo cargados"

(async function seedDemo() {
  if (!window.db) { console.error('Firebase no inicializado'); return; }

  console.log('🌱 Cargando datos de demostración...');

  // ── Categorías ────────────────────────────────────────────────────────────
  const categoriesData = [
    { name: 'Bebidas',   emoji: '🥤', parentId: null },
    { name: 'Snacks',    emoji: '🍿', parentId: null },
    { name: 'Comidas',   emoji: '🍽️', parentId: null },
    { name: 'Postres',   emoji: '🍰', parentId: null },
  ];

  const catIds = {};
  for (const cat of categoriesData) {
    const ref = await db.collection('categories').add({
      ...cat,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    catIds[cat.name] = ref.id;
    console.log(`  📂 Categoría: ${cat.emoji} ${cat.name}`);
  }

  // ── Subcategorías ─────────────────────────────────────────────────────────
  const subcategoriesData = [
    { name: 'Gaseosas',   emoji: '🧃', parentId: catIds['Bebidas'] },
    { name: 'Jugos',      emoji: '🍊', parentId: catIds['Bebidas'] },
    { name: 'Calientes',  emoji: '☕', parentId: catIds['Bebidas'] },
    { name: 'Dulces',     emoji: '🍬', parentId: catIds['Snacks'] },
    { name: 'Salados',    emoji: '🥨', parentId: catIds['Snacks'] },
  ];

  const subIds = {};
  for (const sub of subcategoriesData) {
    const ref = await db.collection('categories').add({
      ...sub,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    subIds[sub.name] = ref.id;
    console.log(`  └─ Subcategoría: ${sub.emoji} ${sub.name}`);
  }

  // ── Productos ─────────────────────────────────────────────────────────────
  const productsData = [
    { name: 'Coca-Cola 500ml',    description: 'Refresco clásico bien frío',        price: 3.50, emoji: '🥤', categoryId: catIds['Bebidas'],  subcategoryId: subIds['Gaseosas'], active: true },
    { name: 'Inca Kola 500ml',    description: 'La bebida de sabor nacional',        price: 3.50, emoji: '🥤', categoryId: catIds['Bebidas'],  subcategoryId: subIds['Gaseosas'], active: true },
    { name: 'Sprite 500ml',       description: 'Lima-limón refrescante',             price: 3.00, emoji: '🥤', categoryId: catIds['Bebidas'],  subcategoryId: subIds['Gaseosas'], active: true },
    { name: 'Jugo de Naranja',    description: 'Natural, recién exprimido',          price: 5.00, emoji: '🍊', categoryId: catIds['Bebidas'],  subcategoryId: subIds['Jugos'],    active: true },
    { name: 'Café Americano',     description: 'Café negro en vaso grande',          price: 4.00, emoji: '☕', categoryId: catIds['Bebidas'],  subcategoryId: subIds['Calientes'],active: true },
    { name: 'Té de Manzanilla',   description: 'Relajante y aromático',              price: 3.00, emoji: '🍵', categoryId: catIds['Bebidas'],  subcategoryId: subIds['Calientes'],active: true },
    { name: 'Chifles',            description: 'Chifles de plátano crujientes',      price: 2.00, emoji: '🍟', categoryId: catIds['Snacks'],   subcategoryId: subIds['Salados'],  active: true },
    { name: 'Papas Lays',         description: 'Papas fritas sabor clásico',         price: 2.50, emoji: '🥔', categoryId: catIds['Snacks'],   subcategoryId: subIds['Salados'],  active: true },
    { name: 'Toffees',            description: 'Caramelos de leche suaves',          price: 1.00, emoji: '🍬', categoryId: catIds['Snacks'],   subcategoryId: subIds['Dulces'],   active: true },
    { name: 'Chocolate Sublime',  description: 'El clásico peruano con maní',        price: 2.00, emoji: '🍫', categoryId: catIds['Snacks'],   subcategoryId: subIds['Dulces'],   active: true },
    { name: 'Sándwich de Pollo',  description: 'Pan de molde, pollo y mayonesa',     price: 8.00, emoji: '🥪', categoryId: catIds['Comidas'],  subcategoryId: null,               active: true },
    { name: 'Empanada de Carne',  description: 'Recién horneada, jugosa por dentro', price: 4.50, emoji: '🥟', categoryId: catIds['Comidas'],  subcategoryId: null,               active: true },
    { name: 'Hot Dog',            description: 'Salchicha con mostaza y ketchup',    price: 5.00, emoji: '🌭', categoryId: catIds['Comidas'],  subcategoryId: null,               active: true },
    { name: 'Queque de Vainilla', description: 'Trozo de queque esponjoso',          price: 3.50, emoji: '🍰', categoryId: catIds['Postres'],  subcategoryId: null,               active: true },
    { name: 'Helado de Vaso',     description: 'Sabores: vainilla, chocolate, fresa',price: 4.00, emoji: '🍦', categoryId: catIds['Postres'],  subcategoryId: null,               active: true },
    { name: 'Alfajor',            description: 'Con manjar blanco y coco rallado',   price: 2.50, emoji: '🍪', categoryId: catIds['Postres'],  subcategoryId: null,               active: true },
  ];

  for (const prod of productsData) {
    await db.collection('products').add({
      ...prod,
      stock: null,
      imageUrl: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log(`  🏷️  Producto: ${prod.emoji} ${prod.name} — S/ ${prod.price.toFixed(2)}`);
  }

  console.log('\n✅ Datos demo cargados exitosamente.');
  console.log(`   📂 ${categoriesData.length} categorías + ${subcategoriesData.length} subcategorías`);
  console.log(`   🏷️  ${productsData.length} productos`);
  console.log('\n💡 Recarga la página para ver los cambios.');
})();
