# Identidad oficial Espinal Guerra

Archivos esperados (no suministrados en el repositorio):

- `espinal-guerra-logo.png`: original en sus colores oficiales, para fondos claros.
- `espinal-guerra-logo-white.png`: variante blanca oficial con fondo completamente transparente, para el sidebar azul.

También se admite SVG original de confianza. Cambia las rutas en `src/config/corporate-identity.ts`, nunca en las páginas. Configura allí nombre, eslogan, visualización, paleta y fuentes. Si una variante falta, usa `null` o conserva su ruta esperada: el componente mostrará una identidad textual discreta sin imagen rota.

No recolorear mediante filtros, no recrear alas, no extraer versiones aproximadas del moodboard y no incluir imágenes base64. Deben entregarse los archivos oficiales por separado. Se usa `object-fit: contain`, conservando proporciones y sin recortes.
