import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("workflow kit files exist", () => {
  for (const file of ["AGENTS.md", "CLAUDE.md", "PROJECT_CONTEXT.md", "test.cmd", "package.json", ".gitignore"]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} should exist`);
  }
});

test("codex and claude share the mandatory workflow", () => {
  const agents = read("AGENTS.md");
  const claude = read("CLAUDE.md");
  for (const content of [agents, claude]) {
    const order = ["senior-dev", "ui-ux-expert", "code-reviewer", "qa-senior", "qa-automate"];
    let lastIndex = -1;
    for (const step of order) {
      const index = content.indexOf(step);
      assert.ok(index > lastIndex, `${step} should appear after the previous workflow step`);
      lastIndex = index;
    }
    assert.match(content, /develop/);
    assert.match(content, /Nunca.*push direto.*main|Nunca faca push direto para `main`/s);
  }
});

test("frontend work requires ui ux review", () => {
  const agents = read("AGENTS.md");
  const claude = read("CLAUDE.md");
  assert.match(agents, /qualquer ajuste de front-end deve acionar `ui-ux-expert`/);
  assert.match(claude, /qualquer mudanca de front-end deve passar por avaliacao UI\/UX/);
});

test("browser blocked by client policy is documented", () => {
  const agents = read("AGENTS.md");
  const claude = read("CLAUDE.md");
  for (const content of [agents, claude]) {
    assert.match(content, /ERR_BLOCKED_BY_CLIENT/);
    assert.match(content, /file:\/\//);
    assert.match(content, /localhost/);
    assert.match(content, /127\.0\.0\.1/);
  }
});

test("project context records stack decision", () => {
  const context = read("PROJECT_CONTEXT.md");
  assert.match(context, /## Stack Escolhida/);
  assert.match(context, /## Motivo Da Stack/);
  assert.match(context, /## Alternativas Rejeitadas/);
  assert.match(context, /Revisao Obrigatoria De Stack/);
});

test("github pages deployment builds vite output for repository subpath", () => {
  const viteConfig = read("vite.config.js");
  const index = read("index.html");
  const manifest = read("public/manifest.webmanifest");
  const serviceWorker = read("public/sw.js");
  const workflow = read(".github/workflows/deploy-pages.yml");
  const packageJson = read("package.json");
  const testCmd = read("test.cmd");

  assert.match(viteConfig, /\/Togs-heads-up\//);
  assert.match(index, /%BASE_URL%manifest\.webmanifest/);
  assert.match(index, /%BASE_URL%icon\.svg/);
  assert.match(manifest, /"start_url": "\.\/"/);
  assert.match(manifest, /"scope": "\.\/"/);
  assert.match(serviceWorker, /togs-heads-up-v8/);
  assert.match(serviceWorker, /application\/json/);
  assert.match(serviceWorker, /application\/xml/);
  assert.match(serviceWorker, /text\/xml/);
  assert.match(serviceWorker, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /\/api\//);
  assert.match(serviceWorker, /self\.registration\.scope/);
  assert.match(workflow, /branches:\s*\n\s*- main\s*\n\s*- develop/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(packageJson, /"packageManager": "npm@11\.6\.2"/);
  assert.match(testCmd, /npm\.cmd test/);
  assert.match(testCmd, /npm\.cmd run build/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /npm install -g npm@11\.6\.2/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.match(workflow, /actions\/deploy-pages/);
});

test("app is consult only and uses public weather and astronomy APIs", () => {
  const app = read("src/App.jsx");
  const api = read("src/services/earthSpaceApi.js");
  const env = read(".env.example");

  assert.doesNotMatch(app, new RegExp("Relat" + "ar|Registrar " + "alerta|ReportPanel|PlusCircle|Trash2"));
  assert.doesNotMatch(app, new RegExp("local" + "Storage"));
  assert.doesNotMatch(app, /Dados demo|demonstrativos|SEED_INCIDENTS/);
  assert.match(app, /fetchEarthSpaceDashboard/);
  assert.match(app, /fetchIncidents/);
  assert.match(app, /searchLocations/);
  assert.match(api, /api\.open-meteo\.com/);
  assert.match(api, /geocoding-api\.open-meteo\.com/);
  assert.match(api, /servicos\.cptec\.inpe\.br/);
  assert.match(api, /planetary\/apod/);
  assert.match(api, /neo\/rest\/v1\/feed/);
  assert.match(api, /cad\.api/);
  assert.match(api, /fireball\.api/);
  assert.match(api, /mars-photos/);
  assert.doesNotMatch(api, /images-api\.nasa\.gov/);
  assert.doesNotMatch(app, /NASA Image Library|NasaLibraryPanel|nasaImages/);
  assert.match(env, /VITE_NASA_API_KEY/);
});
