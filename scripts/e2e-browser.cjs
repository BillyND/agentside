// Loads the built extension in Playwright's Chromium against the real daemon
// and walks the main flows, saving screenshots to $OUT (default /tmp/agentside-e2e).
// Run from a directory where `playwright` resolves:  node scripts/e2e-browser.cjs
const { createRequire } = require("module");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = createRequire(path.join(process.cwd(), "x.js"))("playwright");

const ROOT = path.resolve(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const ID = JSON.parse(fs.readFileSync(path.join(ROOT, "extension-id.json"), "utf8")).id;
const OUT = process.env.OUT || "/tmp/agentside-e2e";
const WORK = path.join(OUT, "work");
const PROFILE = path.join(OUT, "profile");

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROFILE, "NativeMessagingHosts"), { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });
  const manifest = path.join(os.homedir(), "Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentside.bridge.json");
  fs.copyFileSync(manifest, path.join(PROFILE, "NativeMessagingHosts/com.agentside.bridge.json"));

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 420, height: 820 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const step = (msg) => console.log("•", msg);
  const text = (sel) => page.textContent(sel).then((s) => (s || "").trim());
  const answers = () => page.$$eval(".prose.assistant", (els) => els.map((e) => e.textContent.trim()).join(" | "));
  async function finishTurn(timeout = 150000) {
    const deadline = Date.now() + timeout;
    const before = await page.$$eval(".turn-meta", (e) => e.length);
    while (Date.now() < deadline) {
      const btn = await page.$(".permission:not(.resolved) .btn.primary");
      if (btn) await btn.click();
      if ((await page.$$eval(".turn-meta", (e) => e.length)) > before) return;
      await page.waitForTimeout(400);
    }
    throw new Error("turn did not finish");
  }

  await page.goto(`chrome-extension://${ID}/panel.html`);
  await page.evaluate((work) => chrome.storage.local.set({ settings: { langSetting: "vi", theme: "light", defaultAgent: "claude" }, lastCwd: work, recentDirs: [work, "/tmp"], lastKey: null }), WORK);
  await page.reload();

  // The draft session starts right away, so models arrive before any message.
  await page.waitForSelector(".model-picker", { timeout: 30000 });
  step(`agent: ${await text(".agent-name")} · model before sending: ${await text(".model-label")}`);
  // Folder comes from the recent list (the "Choose folder…" item opens the OS dialog).
  await page.click(".folder-picker .popover-trigger");
  await page.locator(".folder-menu .menu-item", { hasText: path.basename(WORK) }).first().click();
  await page.waitForSelector(".model-picker", { timeout: 30000 });
  await shot("01-empty-light-vi");

  await page.click(".model-picker .popover-trigger");
  await shot("02-model-menu");
  await page.locator(".model-menu .menu-item", { hasText: "Sonnet" }).first().click();
  await page.click(".model-picker .popover-trigger");
  const low = page.locator(".model-menu .menu-item", { hasText: "Thấp" });
  if (await low.count()) await low.click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  step(`picked before sending: ${await text(".model-label")}`);

  // Image + a tool call behind a permission prompt.
  await page.setInputFiles('.composer input[type="file"]', path.join(ROOT, "tests/fixtures/red.png"));
  await page.waitForSelector(".attachment img");
  await page.fill(".composer textarea", "Ảnh đính kèm màu gì (một từ)? Sau đó chạy bash `echo xin-chao > hello.txt` và trả lời ngắn gọn bằng markdown.");
  await shot("03-attachment");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".permission .btn.primary", { timeout: 90000 });
  await shot("04-permission");
  step(`permission: ${await text(".permission .perm-eyebrow")} — ${await text(".permission .perm-title")}`);
  await finishTurn();
  await shot("05-answer");
  step(`answer: ${(await answers()).slice(0, 180)}`);
  step(`hello.txt: ${fs.readFileSync(path.join(WORK, "hello.txt"), "utf8").trim()}`);
  step(`user thumbnails shown: ${await page.$$eval(".user-images img", (e) => e.length)}`);

  // Bypass mode (the reported bug)
  await page.click(".mode-toggle .popover-trigger");
  await page.locator(".menu-item", { hasText: "Bỏ qua quyền" }).click();
  await page.waitForFunction(() => document.querySelector(".mode-name")?.textContent.includes("Bỏ qua quyền"), null, { timeout: 15000 });
  step(`mode: ${await text(".mode-name")}; errors: ${await page.$$eval(".notice.error", (e) => e.length)}`);

  // Slash command
  await page.fill(".composer textarea", "/conte");
  await page.waitForSelector(".slash-menu");
  await shot("06-slash");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".cmd-output", { timeout: 60000 });
  step(`/context: ${(await text(".cmd-output")).slice(0, 50)}`);

  // Dark + English, history, settings
  await page.evaluate(() => chrome.storage.local.set({ settings: { langSetting: "en", theme: "dark", defaultAgent: "claude" } }));
  await page.reload();
  await page.waitForSelector(".user-bubble", { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot("07-chat-dark-en");
  await page.click('.header-actions button[title="History"]');
  await page.waitForFunction(() => document.querySelectorAll(".modal .row").length > 3, null, { timeout: 30000 });
  await shot("08-history");
  step(`history rows: ${await page.$$eval(".row", (e) => e.length)}`);
  await page.keyboard.press("Escape");
  await page.click(".header-actions .popover-trigger");
  await page.locator(".menu-item", { hasText: "Settings" }).click();
  await page.waitForSelector(".settings");
  await shot("09-settings");

  // Codex: switch agent from the header, models before sending, several steps.
  await page.click(".header-back");
  await page.click(".agent-switcher .popover-trigger");
  await page.locator(".menu-item", { hasText: "Codex" }).click();
  await page.waitForFunction(() => document.querySelector(".agent-name")?.textContent === "Codex", null, { timeout: 15000 });
  await page.waitForSelector(".model-picker", { timeout: 60000 });
  step(`codex model before sending: ${await text(".model-label")}`);
  await shot("10-codex-empty");
  await page.fill(".composer textarea", "Run `ls` and then `cat hello.txt` as two separate shell commands, then tell me in one sentence what hello.txt contains.");
  await page.keyboard.press("Enter");
  await finishTurn();
  await page.waitForTimeout(400);
  await shot("11-codex-answer");
  step(`codex: ${(await answers()).slice(0, 180)}`);
  step(`codex steps: ${(await page.$$eval(".steps-toggle", (e) => e.map((x) => x.textContent))).join(", ") || "single tool rows"}`);

  step(`page errors: ${JSON.stringify(errors)}`);
  await ctx.close();
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
