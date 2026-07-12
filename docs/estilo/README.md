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

El set completo es guía de QA. Dos copias comprimidas de las referencias de
cuerpo (`apps/web/public/assets/style/`, ~30 KB cada una) se envían **solo** al
generar Cuerpo con Flux.2 Klein: Frente sigue siendo la identidad canónica y las
referencias aportan exclusivamente técnica, silueta y acabado. Esta combinación
fue validada también con piel oscura, pelo turquesa, ojos rojos, túnica marfil y
bastón: Cuerpo conservó todas las configuraciones. Schnell sigue siendo la vía
gratuita base; si se agota la cuota, se conserva la imagen anterior en vez de
cachear arte inferior.

`fiamy-cuerpo-rejected.png` es el anti-ejemplo: piel de muñeca suavizada,
iluminación de estudio, acabado CGI brillante y facciones idealizadas. Ninguna
toma de cuerpo puede cambiar a ese lenguaje visual aunque conserve el personaje.

Los colores de piel, iris y pelo elegidos por el jugador son restricciones de
identidad, no sugerencias. Un cambio de prompt se acepta solo si conserva esos
tres colores y se compara visualmente contra esta referencia.
