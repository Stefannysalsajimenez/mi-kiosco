# Dominio personalizado en Firebase Hosting

## Aclaración de costo

Firebase Hosting permite conectar un dominio personalizado sin un cargo adicional específico por el enlace o el certificado administrado. El dominio no lo entrega Firebase: debe poseerse o registrarse por separado.

No dependa de Freenom como fuente estable de dominios gratuitos. En 2026 no existe una garantía general de obtener allí un dominio gratuito. Para mantener costo cero, conserve `mi-kiosco-c7313.web.app`. Para una marca comercial, compre un dominio en un registrador confiable.

## Conectar el dominio raíz

1. Abra Firebase Console.
2. Entre al proyecto `mi-kiosco-c7313`.
3. Abra **Hosting**.
4. Seleccione **Add custom domain**.
5. Escriba el dominio, por ejemplo `micomerciokiosco.pe`.
6. Firebase mostrará un registro TXT para verificar propiedad.
7. En el proveedor DNS cree exactamente el TXT indicado.
8. Espere la propagación y pulse **Verify**.
9. Firebase mostrará los registros A que debe crear para el dominio raíz.
10. Elimine registros A o AAAA anteriores que entren en conflicto, solo después de confirmar que no pertenecen a otro servicio necesario.
11. Cree los registros indicados por Firebase. Use siempre los valores mostrados en la consola; no copie una IP de una guía antigua.
12. Espere la propagación. Firebase aprovisionará el certificado SSL administrado automáticamente.

La propagación DNS y la emisión del certificado pueden tardar. No retire el dominio `web.app` durante la transición.

Documentación oficial:

- https://firebase.google.com/docs/hosting/custom-domain

## Redireccionar `www` al dominio raíz

En Firebase Hosting:

1. Agregue primero el dominio raíz como sitio conectado.
2. Seleccione **Add custom domain** otra vez.
3. Ingrese `www.sudominio.com`.
4. Elija la opción para redirigir el dominio hacia el sitio existente.
5. Configure los registros DNS que Firebase indique para `www`.

Esta redirección por host se configura desde la asociación de dominios en Firebase Console; no es un redirect de ruta de `firebase.json`.

## Usar un dominio `.pe` de NIC Perú

1. Registre o use un dominio existente desde NIC Perú.
2. Identifique dónde se administran sus DNS: NIC Perú o los nameservers de otro proveedor.
3. En Firebase Hosting agregue el dominio `.pe`.
4. Cree el TXT de verificación en la zona DNS.
5. Tras verificar, cree los registros A indicados por Firebase.
6. Agregue `www` como dominio de redirección si lo necesita.
7. Espere la propagación y confirme que el navegador muestra HTTPS válido.

No cambie los nameservers si no es necesario. Solo necesita que el proveedor DNS permita crear TXT y A.

## Checklist

- [ ] Dominio verificado por TXT.
- [ ] A/AAAA sin conflictos.
- [ ] Dominio raíz conectado.
- [ ] `www` redirige al dominio raíz.
- [ ] Certificado SSL activo.
- [ ] `ALLOWED_ORIGINS` de Vercel contiene el nuevo origen HTTPS.
- [ ] `PUBLIC_STORE_URL` usa el nuevo dominio.
- [ ] `storeUrl` en `js/kiosco-upgrade-config.js` usa el nuevo dominio.
- [ ] FCM abre el nuevo dominio.
