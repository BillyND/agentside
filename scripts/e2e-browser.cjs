// Loads the built extension in Playwright's Chromium against the real daemon
// and walks the main flows, saving screenshots to $OUT (default /tmp/agentdock-e2e).
// Run from a directory where `playwright` resolves:  node scripts/e2e-browser.cjs
const { createRequire } = require("module");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = createRequire(path.join(process.cwd(), "x.js"))("playwright");

const ROOT = path.resolve(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const ID = JSON.parse(fs.readFileSync(path.join(ROOT, "extension-id.json"), "utf8")).id;
const OUT = process.env.OUT || "/tmp/agentdock-e2e";
const WORK = path.join(OUT, "work");
const PROFILE = path.join(OUT, "profile");

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(path.join(PROFILE, "NativeMessagingHosts"), { recursive: true });
  fs.mkdirSync(WORK, { recursive: true });
  const manifest = path.join(os.homedir(), "Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentdock.bridge.json");
  fs.copyFileSync(manifest, path.join(PROFILE, "NativeMessagingHosts/com.agentdock.bridge.json"));

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

  await page.goto(`chrome-extension://${ID}/panel.html`);
  await page.evaluate(() => chrome.storage.local.set({ settings: { langSetting: "vi", theme: "light", defaultAgent: "claude" }, lastCwd: "" }));
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".composer-row .chip"), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  step("panel connected; agent chip: " + (await page.textContent(".composer-row .chip")));
  await shot("01-empty-light-vi");

  // Folder
  await page.click(".folder-chip");
  await page.fill(".folder-menu input", WORK);
  await page.keyboard.press("Enter");

  // Claude: a tool call that needs permission
  await page.fill(".composer textarea", "Chạy lệnh bash `echo xin-chao > hello.txt`, sau đó trả lời ngắn gọn bằng markdown: một tiêu đề và một danh sách 2 ý về file vừa tạo.");
  await page.keyboard.press("Enter");
  const allow = await page.waitForSelector(".permission .btn.primary", { timeout: 60000 });
  await shot("02-permission");
  step("permission card: " + (await page.textContent(".permission .perm-title")));
  await allow.click();
  await page.waitForSelector(".turn-meta", { timeout: 120000 });
  await page.waitForTimeout(300);
  await shot("03-answer");
  step("answer: " + (await page.$$eval(".prose.assistant", (els) => els.map((e) => e.textContent.trim()).join(" | "))).slice(0, 160));
  step("hello.txt: " + fs.readFileSync(path.join(WORK, "hello.txt"), "utf8").trim());

  // Mode → bypass (the bug the user hit)
  await page.click(".mode-chip");
  const bypass = page.locator(".menu-item", { hasText: "Bỏ qua quyền" });
  await bypass.click();
  await page.waitForFunction(() => document.querySelector(".mode-chip")?.textContent.includes("Bỏ qua quyền"), null, { timeout: 15000 });
  const modeErrors = await page.$$eval(".notice.error", (els) => els.map((e) => e.textContent));
  step("mode after switch: " + (await page.textContent(".mode-chip")) + (modeErrors.length ? " ERRORS: " + modeErrors.join(";") : ""));

  // Slash menu
  await page.fill(".composer textarea", "/con");
  await page.waitForSelector(".slash-menu");
  await shot("04-slash");
  step("slash items: " + (await page.$$eval(".slash-item", (e) => e.length)));
  await page.fill(".composer textarea", "/context");
  await page.keyboard.press("Escape");
  await page.fill(".composer textarea", "/context");
  await page.locator(".composer textarea").press("End");
  await page.evaluate(() => document.querySelector(".slash-menu") && null);
  await page.keyboard.press("Space");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".cmd-output", { timeout: 60000 });
  step("/context output: " + (await page.textContent(".cmd-output")).slice(0, 60).replace(/\n/g, " "));

  // Dark theme + English, history and settings views
  await page.evaluate(() => chrome.storage.local.set({ settings: { langSetting: "en", theme: "dark", defaultAgent: "claude" } }));
  await page.reload();
  await page.waitForSelector(".user-bubble", { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot("05-chat-dark-en");
  await page.click('.header-actions button[title="History"]');
  await page.waitForSelector(".row", { timeout: 30000 });
  await page.waitForTimeout(300);
  await shot("06-history");
  step("history rows: " + (await page.$$eval(".row", (e) => e.length)));
  await page.click('.header-actions .popover-trigger');
  await page.click(".menu-item");
  await page.waitForSelector(".settings");
  await shot("07-settings");

  // Codex in a new chat
  await page.click(".header-back");
  await page.click('.header-actions button[title="New chat"]');
  await page.click(".composer-row .chip-popover .popover-trigger");
  await page.locator(".menu-item", { hasText: "Codex" }).click();
  await page.click(".folder-chip");
  await page.fill(".folder-menu input", WORK);
  await page.keyboard.press("Enter");
  await shot("08-codex-empty");
  await page.fill(".composer textarea", "Run `cat hello.txt` in the shell and tell me what it prints, in one short sentence.");
  await page.keyboard.press("Enter");
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const btn = await page.$(".permission:not(.resolved) .btn.primary");
    if (btn) await btn.click();
    if (await page.$(".turn-meta")) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(400);
  await shot("09-codex-answer");
  step("codex: " + (await page.$$eval(".prose.assistant", (els) => els.map((e) => e.textContent.trim()).join(" | "))).slice(0, 160));
  step("codex tools: " + (await page.$$eval(".tool-name", (els) => els.map((e) => e.textContent).join(", "))));

  step("page errors: " + JSON.stringify(errors));
  await ctx.close();
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
