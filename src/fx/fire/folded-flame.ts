// Editable studio recipe; see its intent and project example before changing the visual contract.
import {createRecipeSpec,createRecipeEffect} from "../../authoring/recipes.js";
export const recipe=createRecipeSpec("flame",{intentRef:"authoring/fire/folded-flame.intent.json"});
const effect=createRecipeEffect(recipe);
export const meta=effect.meta;
export const contacts=effect.contacts;
export const draw=effect.draw;
