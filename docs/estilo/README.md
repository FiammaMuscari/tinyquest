# Set dorado visual

`fiamy-frente-reference.png`, `fiamy-cuerpo-reference-1.png` y
`fiamy-cuerpo-reference-2.png` fijan el contrato de estilo para protagonistas,
NPC y avatares: concept art dark-fantasy pintado, rostro suavemente modelado,
anatomía elegante, fondo oscuro y pinceladas amplias claramente visibles.

## Set dorado principal (2026-07-12)

- `golden-frente-elfa.png` y `golden-frente-humana.png`: encuadre cercano 3/4,
  facciones bellas semirrealistas, ojos expresivos sin proporción anime.
- `golden-cuerpo-elfa-dorada.png`, `golden-cuerpo-elfa-blanca.png` y
  `golden-cuerpo-humana.png`: figura parada legible, ropa medieval delicada,
  silueta elegante y color canónico consistente.
- `golden-portada-deuda-ceniza.jpg`: referencia para portadas y escenas; grupo
  integrado en un ambiente de óleo cinematográfico, sin collage de rostros.

Estas imágenes son guía de QA y prompt, no inputs enviados en cada inferencia:
usar multi-referencia agotó la cuota gratuita de Workers AI y empeoró el
fallback. El proveedor gratuito principal es Flux 1 Schnell; si agota su cuota,
la aplicación conserva la imagen anterior y reintenta en lugar de cachear arte
de calidad inferior.

`fiamy-cuerpo-rejected.png` es el anti-ejemplo: piel de muñeca suavizada,
iluminación de estudio, acabado CGI brillante y facciones idealizadas. Ninguna
toma de cuerpo puede cambiar a ese lenguaje visual aunque conserve el personaje.

Los colores de piel, iris y pelo elegidos por el jugador son restricciones de
identidad, no sugerencias. Un cambio de prompt se acepta solo si conserva esos
tres colores y se compara visualmente contra esta referencia.
