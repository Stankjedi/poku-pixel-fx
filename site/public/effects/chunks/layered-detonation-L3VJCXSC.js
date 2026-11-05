import {
  createRecipeEffect,
  createRecipeSpec
} from "./chunk-J4Q4JDPH.js";
import "./chunk-FLVIEPJE.js";
import "./chunk-FEXYTCCO.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/explosions/layered-detonation.ts
var recipe = createRecipeSpec("explosion", { intentRef: "authoring/explosions/layered-detonation.intent.json" });
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
