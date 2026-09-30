// 测试 main.js 的解析函数（用 node 加载 + vm 执行 + 喂入缓存 HTML）
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const code = fs.readFileSync(
  path.join(__dirname, "main.js"),
  "utf-8"
);

const context = {
  console,
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  Set,
  decodeURIComponent,
  encodeURIComponent,
  JSON,
  Math,
  parseInt,
  String,
};
vm.createContext(context);
vm.runInContext(code, context);

const { parseEntries, parseZhMeaning, parseRelated, splitPos } = context;

function test(name, fn) {
  try {
    fn();
    console.log("PASS", name);
  } catch (e) {
    console.log("FAIL", name, "->", e.message);
  }
}

test("parseEntries battery (en)", () => {
  const html = fs.readFileSync("/tmp/plugintest/en_battery.html", "utf-8");
  const entries = parseEntries(html);
  if (entries.length !== 1) throw new Error("expect 1 entry, got " + entries.length);
  const e = entries[0];
  if (e.word !== "battery" || e.pos !== "n.") throw new Error("word/pos wrong: " + e.word + " " + e.pos);
  if (e.paragraphs.length < 2) throw new Error("paragraphs < 2");
  if (!e.paragraphs[0].startsWith("1530s")) throw new Error("first para wrong: " + e.paragraphs[0].slice(0, 20));
  console.log("   word=" + e.word, "pos=" + e.pos, "paras=" + e.paragraphs.length);
  console.log("   para0:", e.paragraphs[0].slice(0, 70));
});

test("parseEntries run (en, 多词性)", () => {
  const html = fs.readFileSync("/tmp/plugintest/en_run.html", "utf-8");
  const entries = parseEntries(html);
  if (entries.length !== 2) throw new Error("expect 2 entries, got " + entries.length);
  if (entries[0].pos !== "v." || entries[1].pos !== "n.") throw new Error("pos wrong: " + entries[0].pos + "," + entries[1].pos);
  console.log("   entries:", entries.map((e) => e.pos + "(" + e.paragraphs.length + ")").join(", "));
});

test("parseZhMeaning battery (zh)", () => {
  const html = fs.readFileSync("/tmp/plugintest/zh_battery.html", "utf-8");
  const meaning = parseZhMeaning(html);
  if (!meaning.includes("电池")) throw new Error("meaning wrong: " + meaning);
  console.log("   meaning =", meaning);
});

test("parseRelated battery (en)", () => {
  const html = fs.readFileSync("/tmp/plugintest/en_battery.html", "utf-8");
  const related = parseRelated(html);
  if (!related.some((x) => x.includes("batter"))) throw new Error("no batter in related");
  console.log("   related =", JSON.stringify(related));
});

test("splitPos", () => {
  if (splitPos("battery (n.)").pos !== "n.") throw new Error("splitPos (n.) failed");
  if (splitPos("sus-").pos !== null) throw new Error("splitPos prefix failed");
  console.log("   ok");
});
