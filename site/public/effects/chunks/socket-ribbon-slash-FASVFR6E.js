import {
  createRecipeEffect,
  createRecipeSpec
} from "./chunk-PLGU4LXO.js";
import "./chunk-JIMPAKU2.js";
import "./chunk-WFSCDWU6.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/melee/socket-ribbon-slash.ts
var recipe = createRecipeSpec("ribbon-slash", { intentRef: "authoring/melee/socket-ribbon-slash.intent.json" });
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
