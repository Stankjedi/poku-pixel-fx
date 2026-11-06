import {
  createRecipeEffect,
  createRecipeSpec
} from "./chunk-I2CEDLVF.js";
import "./chunk-FLVIEPJE.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MBWWV6CB.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/lightning/focused-arc.ts
var recipe = createRecipeSpec("lightning", { intentRef: "authoring/lightning/focused-arc.intent.json" });
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
