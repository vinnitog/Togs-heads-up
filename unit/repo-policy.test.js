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
  assert.match(serviceWorker, /togs-heads-up-v10/);
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

test("responsive menu keeps accessible state and keyboard escape behavior", () => {
  const app = read("src/App.jsx");
  const styles = read("src/styles.css");

  assert.match(app, /aria-controls="dashboard-menu"/);
  assert.match(app, /aria-expanded=\{isMenuOpen\}/);
  assert.match(app, /id="dashboard-menu"/);
  assert.match(app, /aria-label="Navegação principal do painel"/);
  assert.match(app, /aria-current=\{activeView === item\.id \? "page" : undefined\}/);
  assert.match(app, /event\.key !== "Escape"/);
  assert.match(app, /menuToggleRef\.current\?\.focus\(\)/);

  assert.match(styles, /\.menu-toggle\s*\{\s*display:\s*none;/s);
  const tabletRules = styles.slice(
    styles.indexOf("@media (max-width: 1080px)"),
    styles.indexOf("@media (max-width: 760px)"),
  );
  assert.match(tabletRules, /\.menu-toggle\s*\{[^}]*display:\s*inline-flex;/s);
  assert.match(tabletRules, /\.api-menu\s*\{[^}]*display:\s*none;/s);
  assert.match(tabletRules, /\.api-menu\.open\s*\{[^}]*display:\s*grid;/s);
  assert.match(tabletRules, /\.menu-group\s*\{[^}]*minmax\(150px, 1fr\)/s);

  const phoneRules = styles.slice(styles.indexOf("@media (max-width: 460px)"));
  assert.match(phoneRules, /\.menu-group\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  assert.match(styles, /\.api-menu button\s*\{[^}]*min-height:\s*44px;/s);
});

test("service worker bypasses external APIs before asset caching", () => {
  const serviceWorker = read("public/sw.js");
  const externalCheck = serviceWorker.indexOf("const isExternalRequest = requestUrl.origin !== self.location.origin");
  const bypassGuard = serviceWorker.indexOf(
    'if (isExternalRequest || acceptsDynamicData || requestUrl.pathname.includes("/api/"))',
  );
  const assetCache = serviceWorker.lastIndexOf("event.respondWith(");

  assert.ok(externalCheck >= 0, "service worker should identify cross-origin requests");
  assert.ok(bypassGuard > externalCheck, "external request guard should use the origin check");
  assert.ok(assetCache > bypassGuard, "external APIs should return before the asset cache handler");
  assert.match(serviceWorker.slice(bypassGuard, assetCache), /\{\s*return;\s*\}/);
});

test("APOD fallback messaging stays explicit and in Portuguese", () => {
  const app = read("src/App.jsx");

  assert.match(app, /translationStatus === "partial"/);
  assert.match(app, /Parte do conteúdo está no original/);
  assert.match(app, /Conteúdo original em inglês/);
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
