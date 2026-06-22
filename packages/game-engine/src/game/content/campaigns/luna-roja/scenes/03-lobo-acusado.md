---
campaignId: luna-roja
sceneId: lobo-acusado
kind: scene
tags: [capilla, acusado, romance, testimonio]
---
# El Lobo Acusado

## Resumen literario
La capilla huele a cera apagada y lana mojada. El acusado ya no parece una bestia; parece alguien que eligio callar y esta pagando por dos. Mara no lo mira de frente. El alcalde tampoco. En esta escena, cada pregunta debe decidir si se arranca verdad, se ofrece misericordia o se usa el amor de dos personas como herramienta.

## Acciones recomendadas
- id: offer_mercy_before_truth; label: Ofrecer misericordia antes de exigir nombres; type: negotiate; stat: alma; difficulty: 13; stakes: abrir confesion sin romper al acusado; success: revela a Mara; partial: exige protegerla; failure: acusado se cierra; d6CostUse: relacion; affectsNPC: accused_wolf; dangerDeltaOnSuccess: 0; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 2; exhaustionReplacementSuccess: pedir a Mara que confirme; exhaustionReplacementFailure: probar con objeto
- id: compare_letter_seal; label: Comparar la carta rota con el sello lunar frente a Mara; type: investigate; stat: mente; difficulty: 15; stakes: vincular archivo; success: blood_debt_letter confirmada; partial: carta danada; failure: alcalde la reclama; d6CostUse: objeto; revealsClue: blood_debt_letter; dangerDeltaOnSuccess: 0; dangerDeltaOnPartial: 1; dangerDeltaOnFailure: 2; exhaustionReplacementSuccess: llevar carta al juicio; exhaustionReplacementFailure: reconstruir sello con campana
