// src/authoring/project.ts
function cloneJSON(value) {
  const seen = /* @__PURE__ */ new Set();
  function visit(v, depth) {
    if (depth > 64) throw new RangeError("Project nesting exceeds 64 levels");
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number" && Number.isFinite(v)) return;
    if (!v || typeof v !== "object" || seen.has(v)) throw new TypeError("Project data must be finite, acyclic JSON");
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
      throw new TypeError("Runtime instances and typed arrays do not belong in project JSON");
    seen.add(v);
    for (const [key, child] of Object.entries(v)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new TypeError("Reserved project key");
      visit(child, depth + 1);
    }
    seen.delete(v);
  }
  visit(value, 0);
  return JSON.parse(JSON.stringify(value));
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function number(value, fallback, min, max, label) {
  const result = value === void 0 ? fallback : value;
  if (typeof result !== "number" || !Number.isFinite(result) || result < min || result > max) throw new RangeError(`Invalid ${label}`);
  return result;
}
function resolveProject(input) {
  const p = object(cloneJSON(input), "Project");
  if (p.schema !== void 0 && p.schema !== "poku.project/v1") throw new RangeError("Unsupported project schema");
  if (typeof p.id !== "string" || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(p.id)) throw new RangeError("Project id must be category/name");
  const kind = p.kind ?? "2d";
  if (!["2d", "act", "3d", "recipe", "character", "sequence"].includes(kind)) throw new RangeError("Unknown project kind");
  const seed = number(p.seed ?? p.options?.seed, 1, 0, 4294967295, "seed");
  if (!Number.isInteger(seed)) throw new RangeError("Seed must be an integer");
  const layers = object(p.layers ?? {}, "layers");
  if (Object.values(layers).some((v) => typeof v !== "boolean")) throw new TypeError("Layer visibility must be boolean");
  if (!Array.isArray(p.edits ?? [])) throw new TypeError("edits must be an array");
  for (const key of ["actor", "target"]) if (p[key] !== void 0 && typeof p[key] !== "boolean") throw new TypeError(`${key} must be boolean`);
  for (const key of ["name", "bg", "notes", "intentRef", "intentSha256", "sourceRevision"])
    if (p[key] !== void 0 && typeof p[key] !== "string") throw new TypeError(`${key} must be text`);
  const out = {
    schema: "poku.project/v1",
    id: p.id,
    name: p.name ?? p.id,
    kind,
    seed,
    options: { ...object(p.options ?? {}, "options"), seed },
    fps: number(p.fps, 30, 1, 240, "fps"),
    bg: p.bg ?? "dark",
    actor: p.actor ?? true,
    target: p.target ?? true,
    layers: { ...layers },
    edits: p.edits ?? [],
    notes: p.notes ?? ""
  };
  for (const key of ["seconds", "hold", "margin", "pad", "cameraMotion"]) {
    if (p[key] !== void 0) out[key] = number(p[key], 0, 0, key === "seconds" ? 3600 : 4096, key);
  }
  for (const key of ["renderProfile", "exportSettings", "pixelStyle", "recipe", "character", "sequence"])
    if (p[key] !== void 0) out[key] = object(p[key], key);
  for (const key of ["intentRef", "intentSha256", "sourceRevision"])
    if (p[key] !== void 0) out[key] = p[key];
  return out;
}
var createProject = (input) => resolveProject(input);
function parseProject(json) {
  if (json.length > 32 * 1024 * 1024) throw new RangeError("Project exceeds 32 MiB");
  return resolveProject(JSON.parse(json));
}
var serializeProject = (project) => JSON.stringify(resolveProject(project), null, 2) + "\n";
function createRecipePack(project, examples = [], lessons = []) {
  if (examples.some((x) => !Number.isFinite(x.time) || x.time < 0 || typeof x.note !== "string")) throw new RangeError("Invalid example");
  if (lessons.some((x) => typeof x !== "string")) throw new TypeError("Lessons must be text");
  return { schema: "poku.recipe-pack/v1", project: resolveProject(project), examples: cloneJSON(examples), lessons: [...lessons] };
}

export {
  cloneJSON,
  resolveProject,
  createProject,
  parseProject,
  serializeProject,
  createRecipePack
};
