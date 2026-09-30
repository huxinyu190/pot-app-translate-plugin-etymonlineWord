// 端到端测试：mock tauriFetch，验证 translate 完整流程
const fs = require("fs");
const vm = require("vm");

const code = fs.readFileSync(require("path").join(__dirname, "main.js"), "utf-8");
const context = {
  console, TextDecoder, Uint8Array, ArrayBuffer, Set,
  decodeURIComponent, encodeURIComponent, JSON, Math, parseInt, String,
};
vm.createContext(context);
vm.runInContext(code, context);
const translate = context.translate;

const read = (f) => fs.readFileSync("/tmp/plugintest/" + f, "utf-8");
const EMPTY = "<html><body><div></div></body></html>";
const SEARCH = '<a href="/word/battery">battery (n.)</a>';

function mockFetch(url) {
  const m = {
    "https://www.etymonline.com/word/battery": read("en_battery.html"),
    "https://www.etymonline.com/cn/word/battery": read("zh_battery.html"),
    "https://www.etymonline.com/word/run": read("en_run.html"),
    "https://www.etymonline.com/cn/word/run": read("zh_run.html"),
    "https://www.etymonline.com/word/batteries": EMPTY,
    "https://www.etymonline.com/cn/word/batteries": EMPTY,
    "https://www.etymonline.com/search?q=batteries": SEARCH,
  };
  const data = m[url];
  if (data !== undefined) {
    return Promise.resolve({ ok: true, status: 200, data });
  }
  return Promise.resolve({ ok: true, status: 200, data: EMPTY });
}

const utils = { tauriFetch: (url, opts) => mockFetch(url) };
const options = { config: {}, utils };

async function main() {
  // 1. 正常词 battery（概要加粗放 explanations；段落放 associations，每条一行不加粗）
  const battery = await translate("battery", "en", "zh", options);
  console.log("=== battery ===");
  console.log("explanations（英文单词 + 中文意思，均加粗）:", JSON.stringify(battery.explanations));
  console.log("associations 条目数:", battery.associations.length, "（期望 8 = 空行 + 2英 + 空行 + 2中 + 空行 + 1关联）");
  battery.associations.forEach((a, i) => console.log(`  [${i}]`, JSON.stringify(a.slice(0, 32))));

  // 2. 多词性 run
  const run = await translate("run", "en", "zh", options);
  console.log("\n=== run（多词性）===");
  console.log("explanations 词性:", run.explanations.map((e) => e.trait).join(", "));
  console.log("associations 数:", run.associations ? run.associations.length : 0);

  // 3. 变体词 batteries -> battery
  const bat = await translate("batteries", "en", "zh", options);
  console.log("\n=== batteries（变体回退）===");
  console.log("trait:", bat.explanations[0].trait, "| 首条:", bat.explanations[0].explains[0]?.slice(0, 40));

  console.log("\n全部完成");
}
main().catch((e) => console.error("E2E 失败:", e));
