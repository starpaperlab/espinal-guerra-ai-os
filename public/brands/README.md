# Logos de las marcas

Añade los archivos oficiales sin alterar sus proporciones:

- `ceo-rentable-os.png`
- `plannerlab.png`
- `star-paper-lab.png`
- `emprendedora-digital-con-ia.png`

Se recomienda PNG transparente o SVG original autorizado. Para usar SVG cambia la extensión de `logo` en `src/modules/catalog.ts`; utiliza únicamente SVG de confianza. También puedes cambiar la ruta o usar `null` si una marca no tiene logo.

No se incluyen logotipos oficiales porque no fueron suministrados. La interfaz muestra iniciales como identidad provisional mientras carga una imagen o si el archivo falta o falla. No se generan ni se presentan logos ficticios como oficiales. Cada imagen se ajusta con `object-fit: contain`, sin recortes ni deformación.
