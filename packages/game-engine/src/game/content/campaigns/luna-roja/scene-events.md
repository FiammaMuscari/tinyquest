---
campaignId: luna-roja
kind: scene_event
tags: [events]
---
# Eventos dinamicos

## bells_start
sceneId: cadaver-bajo-el-molino
trigger: peligro 4
description: campanas suenan sin sacristan.
mechanicalEffect: faction village_mob alert +1
narrativeUse: marca que la aldea se mueve.

## mob_hits_door
sceneId: lobo-acusado
trigger: peligro 7
mechanicalEffect: route chapel_confession blocked si no hay trust.

## beast_drags_witness
sceneId: bosque-rojo
trigger: fallo combate
mechanicalEffect: secondary npc missing, route forced_trial +1.
