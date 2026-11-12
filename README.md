# Realidad Aumentada — Video 3

Página web de realidad aumentada para el Video 3. Son dos formas:

- **index.html** → AR de **piso/superficie** (sin marcador). Apuntas la cámara al piso y el personaje aparece parado en el suelo. *Esta es la recomendada.*
- **marcador.html** → AR con **marcador HIRO** (imprimes el marcador y el personaje aparece encima).

> Por defecto usan un personaje 3D de prueba. Tú reemplazas el modelo por tu Goku (ver más abajo).

---

## 1) Subir a GitHub + Vercel (para probarlo en el celular)

La cámara web **solo funciona con HTTPS**, por eso hay que publicarlo (no sirve abrir el archivo directo).

1. Crea un repositorio nuevo en **https://github.com** (ej. `goku-ar`).
2. Sube estos archivos (`index.html`, `marcador.html`, `README.md`) al repo.
3. Entra a **https://vercel.com** → inicia sesión con tu GitHub.
4. **Add New… → Project** → elige tu repo `goku-ar` → **Import**.
5. No cambies nada (es un sitio estático, sin build) → **Deploy**.
6. Vercel te da una URL tipo `https://goku-ar.vercel.app`.
7. **Abre esa URL en tu celular** y toca "Ver en AR".

---

## 2) Poner a Goku (reemplazar el personaje de prueba)

1. Consigue un modelo 3D de Goku en formato **`.glb`** (descárgalo de un sitio de modelos 3D que permita su uso).
2. Pon el archivo `goku.glb` **en la misma carpeta** del repo.
3. En **index.html**, cambia esta línea:
   ```html
   src="https://cdn.jsdelivr.net/.../CesiumMan.glb"
   ```
   por:
   ```html
   src="goku.glb"
   ```
4. En **marcador.html**, cambia `gltf-model="..."` por `gltf-model="goku.glb"`.
5. Vuelve a subir los cambios a GitHub → Vercel redespliega solo.

---

## 3) Notas por celular

- **Android:** funciona directo (usa Scene Viewer / ARCore).
- **iPhone:** la versión de piso necesita además un archivo **`goku.usdz`** y agregar en `index.html`:
  ```html
  ios-src="goku.usdz"
  ```
  (iOS usa "Quick Look" y solo entiende el formato `.usdz`).

---

## Cómo grabar el video

1. Activa la grabadora de pantalla del celular.
2. Abre la página publicada → "Ver en AR".
3. Mueve el celular apuntando al piso hasta que detecte la superficie.
4. Toca el piso → el personaje aparece parado en el suelo real.
5. Camina alrededor, acércate/aléjate, y detén la grabación.
