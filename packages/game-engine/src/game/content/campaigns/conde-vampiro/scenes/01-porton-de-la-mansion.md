---
campaignId: conde-vampiro
sceneId: porton-de-la-mansion
kind: scene
tags: [porton, mansion, contrato]
---
# El Porton de la Mansion
## Resumen literario
El porton se abre solo hasta la mitad, como si la casa dudara de tener invitados. La aldaba tiene forma de diente, pero esta tibia. Dentro se oyen cubiertos ordenandose.
## Acciones recomendadas
- id: read_gate_contract; label: Leer el contrato tallado en la aldaba; type: investigate; stat: mente; difficulty: 12; success: descubre servant_contract; partial: abre porton con deuda; failure: puerta marca al jugador; d6CostUse: contrato; dangerDeltaOnSuccess: 0; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 2; exhaustionReplacementSuccess: preguntar al mayordomo por la firma; exhaustionReplacementFailure: entrar por jardin
