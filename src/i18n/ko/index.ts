import moves from "./moves.js";
import fire from "./fire.js";
import explosions from "./explosions.js";
import water from "./water.js";
import ice from "./ice.js";
import lightning from "./lightning.js";
import scifi from "./scifi.js";
import melee from "./melee.js";
import impacts from "./impacts.js";
import projectiles from "./projectiles.js";
import spawn from "./spawn.js";
import arcane from "./arcane.js";
import holy from "./holy.js";
import shadow from "./shadow.js";
import status from "./status.js";
import nature from "./nature.js";
import weather from "./weather.js";
import ui from "./ui.js";
import pickups from "./pickups.js";
import transitions from "./transitions.js";
import critters from "./critters.js";
import tags_moves from "./tags_moves.js";
import tags_ui_pickups from "./tags_ui_pickups.js";
import tags_critters_weather from "./tags_critters_weather.js";
import tags_status_spawn from "./tags_status_spawn.js";
import tags_arcane_holy from "./tags_arcane_holy.js";
import tags_explosions_projectiles from "./tags_explosions_projectiles.js";
import tags_fire_water from "./tags_fire_water.js";
import tags_ice_lightning from "./tags_ice_lightning.js";
import tags_melee_impacts from "./tags_melee_impacts.js";
import tags_nature_shadow from "./tags_nature_shadow.js";
import tags_scifi_transitions from "./tags_scifi_transitions.js";

export const effectsKo: Record<string, { name: string; desc: string }> = Object.assign({}, moves, fire, explosions, water, ice, lightning, scifi, melee, impacts, projectiles, spawn, arcane, holy, shadow, status, nature, weather, ui, pickups, transitions, critters);
export const tagsKo: Record<string, string> = Object.assign({}, tags_moves, tags_ui_pickups, tags_critters_weather, tags_status_spawn, tags_arcane_holy, tags_explosions_projectiles, tags_fire_water, tags_ice_lightning, tags_melee_impacts, tags_nature_shadow, tags_scifi_transitions);

Object.assign(effectsKo, {
  "shadow/black-dragon-slash": { name: "흑룡참", desc: "흑룡의 얼굴이 진동하며 포효하고, 거대한 검격이 앞의 공간을 갈라냅니다." },
  "arcane/celestial-supernova": { name: "천체 초신성", desc: "별이 떠올라 다중 궤도와 성운 파편으로 폭발합니다." },
  "arcane/dimensional-convergence": { name: "차원 융합 소환", desc: "마법진과 회전 궤도가 차원의 핵을 열어냅니다." },
  "arcane/magic-castle": { name: "별빛 마법성", desc: "빛나는 마법진 위로 환영의 성과 별이 나타납니다." },
  "fire/solar-crown-detonation": { name: "태양 왕관 폭발", desc: "압축된 태양이 왕관 광선과 이중 충격파로 터집니다." },
  "fire/volcanic-cataclysm": { name: "화산 대격변", desc: "지면의 균열에서 용암 분수와 불타는 암편이 솟습니다." },
  "lightning/ion-stormburst": { name: "이온 폭풍 폭발", desc: "이온핵과 번개가 충격파를 일으키며 흩어집니다." },
  "holy/seraphic-verdict": { name: "천사의 심판", desc: "황금 날개와 마법진이 광휘의 기둥을 내립니다." },
  "shadow/abyssal-fracture": { name: "심연의 균열", desc: "보랏빛 균열이 열리고 파편이 회전하며 퍼집니다." },
  "water/abyssal-maelstrom": { name: "심해의 대소용돌이", desc: "나선 물기둥과 물결이 깊은 소용돌이를 만듭니다." },
  "nature/prismatic-blossom": { name: "프리즘 꽃개화", desc: "수정 꽃잎과 덩굴 사이로 빛나는 꽃가루가 흩어집니다." },
});
