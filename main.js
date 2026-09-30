async function translate(text, from, to, options) {
    const { utils } = options;
    const fetch = getFetch(utils);

    const word = String(text || "").trim().toLowerCase().split(/\s+/)[0];
    if (!word) {
        throw "Empty word";
    }

    // 1. 抓英文页
    let enHtml = await fetchWord(fetch, word, false);

    // 2. 解析英文词条（词性标题 + 词源段落）
    let entries = parseEntries(enHtml);

    // 3. 变体词搜索回退（如 batteries -> battery）
    let resolvedWord = word;
    if (entries.length === 0) {
        const real = await searchWord(fetch, word);
        if (real && real !== word) {
            enHtml = await fetchWord(fetch, real, false);
            entries = parseEntries(enHtml);
            if (entries.length > 0) {
                resolvedWord = real;
            }
        }
    }

    if (entries.length === 0) {
        throw "No etymology found for: " + word;
    }

    // 4. 抓中文页：与英文页之间加间隔，失败重试一次，避免连续请求被 Cloudflare 拦截
    let zhHtml = "";
    for (let attempt = 0; attempt < 2 && !zhHtml; attempt++) {
        await sleep(attempt === 0 ? 600 : 1500);
        try {
            zhHtml = await fetchWord(fetch, resolvedWord, true);
        } catch (e) {
            zhHtml = "";
        }
    }
    const zhMeaning = parseZhMeaning(zhHtml);
    const zhEntries = parseEntries(zhHtml);

    // 5. 组装词典 JSON。
    // pot-app 渲染规则：explanations.explains[0] 加粗（放概要，唯一加粗处）；
    // associations 每条独立一行、不加粗（放词源段落）。
    const result = {};

    // 概要（单词中文意思）加粗置顶
    if (zhMeaning) {
        result.explanations = [{ trait: "", explains: [zhMeaning] }];
    }

    // 英文词源段落（先）
    const enParas = [];
    for (const e of entries) {
        for (const p of e.paragraphs) enParas.push(p);
    }
    // 中文词源段落（后）
    const zhParas = [];
    for (const ze of zhEntries) {
        if (ze) for (const p of ze.paragraphs) zhParas.push(p);
    }

    // associations：空行（概要后）→ 英文段落 → 空行 → 中文段落 → 空行 → 关联词
    const assoc = [""];
    for (const p of enParas) assoc.push(p);
    if (zhParas.length > 0) {
        assoc.push("");
        for (const p of zhParas) assoc.push(p);
    }
    const related = parseRelated(enHtml);
    if (related.length > 0) {
        assoc.push("");
        for (const r of related) assoc.push(r);
    }

    if (assoc.length > 0) {
        result.associations = assoc;
    }
    return result;
}

function sleep(ms) {
    return new Promise((resolve) => {
        if (typeof setTimeout === "function") {
            setTimeout(resolve, ms);
        } else {
            resolve();
        }
    });
}

// 兼容不同版本的 fetch 注入方式，并强制按文本解析响应（etymonline 返回 HTML，而非 JSON）
function getFetch(utils) {
    let rawFetch;
    if (utils && utils.tauriFetch) {
        rawFetch = utils.tauriFetch;
    } else if (utils && utils.http && utils.http.fetch) {
        rawFetch = utils.http.fetch;
    } else {
        throw "No fetch util available";
    }
    // 关键：pot 的 tauriFetch 默认按 JSON 解析响应，遇到 HTML 会抛 "Failed to parse response"。
    // 这里强制 responseType 为 Text（tauri v1 的 ResponseType.Text = 2），让 res.data 返回 HTML 字符串。
    return (url, options) => rawFetch(url, Object.assign({}, options, { responseType: 2 }));
}

function fetchWord(fetch, word, isZh) {
    const base = isZh
        ? "https://www.etymonline.com/cn"
        : "https://www.etymonline.com";
    const url = `${base}/word/${encodeURIComponent(word)}`;
    return fetch(url, { method: "GET" }).then((res) => {
        if (!res.ok) {
            throw `Http Request Error\nHttp Status: ${res.status}`;
        }
        return toText(res.data);
    });
}

function searchWord(fetch, word) {
    const url = `https://www.etymonline.com/search?q=${encodeURIComponent(word)}`;
    return fetch(url, { method: "GET" })
        .then((res) => {
            if (!res.ok) return null;
            const html = toText(res.data);
            const re = /<a[^>]*href="(\/word\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/g;
            let m;
            while ((m = re.exec(html)) !== null) {
                const label = stripTags(m[2]);
                if (label.includes("Related entries")) continue;
                const slug = m[1].split("/word/")[1].replace(/\/+$/, "");
                return decodeURIComponent(slug);
            }
            return null;
        })
        .catch(() => null);
}

function toText(data) {
    if (typeof data === "string") return data;
    if (data instanceof Uint8Array) {
        try {
            return new TextDecoder("utf-8").decode(data);
        } catch (e) {
            return "";
        }
    }
    if (data instanceof ArrayBuffer) {
        try {
            return new TextDecoder("utf-8").decode(new Uint8Array(data));
        } catch (e) {
            return "";
        }
    }
    return data ? JSON.stringify(data) : "";
}

function decodeEntities(s) {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;|&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(s) {
    return decodeEntities(String(s || ""))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// 按文档顺序提取 h1/h2/p 标签，做状态机解析（与 Python 版解析逻辑一致）
function parseEntries(html) {
    const entries = [];
    let current = null;
    let inEntries = false;

    const re = /<(h1|h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[1];
        const text = stripTags(m[2]);

        if (tag === "h1") {
            inEntries = true;
            current = null;
            continue;
        }

        if (tag === "h2") {
            if (text.includes("Entries linking") || text.includes("相关词汇")) {
                inEntries = false;
                current = null;
            } else if (
                ["More to explore", "Share", "About", "Support", "Apps", "分享", "支持", "应用"].some(
                    (x) => text.includes(x)
                )
            ) {
                inEntries = false;
                current = null;
            } else if (inEntries && text) {
                const { word, pos } = splitPos(text);
                current = { word, pos, paragraphs: [] };
                entries.push(current);
            }
            continue;
        }

        if (tag === "p" && current) {
            // 排除时间戳/元信息段（"also from ..." 或 class 含 text-sm/battleship-gray）
            if (m[0].includes("text-sm") || m[0].includes("battleship-gray")) continue;
            if (text.toLowerCase().startsWith("also from")) continue;
            if (text) {
                current.paragraphs.push(text);
            }
        }
    }
    return entries;
}

function splitPos(text) {
    const m = text.match(/^(.*?)\s*\(([^()]+)\)$/);
    if (m) {
        return { word: m[1].trim(), pos: m[2].trim() };
    }
    return { word: text.trim(), pos: null };
}

function parseZhMeaning(html) {
    if (!html) return "";
    const idx = html.indexOf("的意思");
    if (idx === -1) return "";
    const after = html.slice(idx);
    const m = after.match(/<div[^>]*class="[^"]*pl-2[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    return m ? stripTags(m[1]) : "";
}

function parseRelated(html) {
    const associations = [];
    const start = html.indexOf("Entries linking");
    if (start === -1) return associations;
    const end = html.indexOf("More to explore", start);
    const section = html.slice(start, end === -1 ? html.length : end);

    const re = /<a[^>]*href="\/word\/[^"#]+"[^>]*>([\s\S]*?)<\/a>/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(section)) !== null) {
        if (m[0].includes("crossreference")) continue; // 跳过正文里的交叉引用链接
        const label = stripTags(m[1]);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        associations.push(label);
    }
    return associations;
}
