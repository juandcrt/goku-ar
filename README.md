# Torre Eiffel en Realidad Aumentada

Página web de realidad aumentada: apuntas la cámara del celular al piso y aparece la **Torre Eiffel en 3D**, fija en el lugar donde la pones, y puedes caminar a su alrededor (360°).

- **index.html** → AR de **piso/superficie** (sin marcador). *Esta es la recomendada.*
- **marcador.html** → AR con **marcador HIRO** (imprimes el marcador y la torre aparece encima).

El modelo es **`torre.glb`** (~560 KB): estructura de celosía con patas curvas, arcos, tres plataformas, cúpula y antena, con las proporciones de la torre real (330 m) escaladas a **1,5 m**.
Se genera con:

```
node herramientas/generar-torre.mjs
```

Para cambiar el tamaño en AR edita `ALTURA_AR` al inicio de ese archivo (también puedes pellizcar en AR para agrandarla o achicarla).

---

## Publicar (GitHub + Vercel)

La cámara solo funciona con **HTTPS**, por eso hay que publicarlo.
El proyecto ya está conectado: cada `git push` a `main` hace que Vercel lo vuelva a publicar solo.

```
git add .
git commit -m "cambios"
git push
```

---

## Notas por celular

- **Android (Chrome):** el AR se abre dentro de Chrome (WebXR). La primera vez pide permiso de cámara: toca **Permitir**. Necesita **"Servicios de Google Play para RA" (ARCore)** instalado desde la Play Store.
- **iPhone (Safari):** se abre en Quick Look; model-viewer convierte el modelo automáticamente.

---

## Cómo grabar el video

1. Activa la grabadora de pantalla del celular.
2. Abre la página publicada → "Ver en AR".
3. Mueve el celular apuntando al piso hasta que detecte la superficie.
4. Toca el piso → la torre queda fija en ese lugar.
5. Camina alrededor, acércate/aléjate, y detén la grabación.
