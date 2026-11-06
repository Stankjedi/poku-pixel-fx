import {
  createRecipeEffect,
  createRecipeSpec
} from "./chunk-I2CEDLVF.js";
import "./chunk-FLVIEPJE.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/melee/tempered-crescent.ts
var recipe = createRecipeSpec("thrown-blade", { intentRef: "authoring/melee/tempered-crescent.intent.json" });
var effect = createRecipeEffect(recipe);
var meta = effect.meta;
var contacts = effect.contacts;
var draw = effect.draw;
export {
  contacts,
  draw,
  meta,
  recipe
};
