# Pot-App 词源词典插件（基于 Etymonline）

在 [Pot](https://github.com/pot-app/pot-desktop)（划词翻译）中查询英文单词的**词源**，同时返回 **eEnglish 原文 + 官方中文翻译**。数据来自 [etymonline.com](https://www.etymonline.com) 及其官方中文站。

## 功能

- 英文词源原文（按词性分段，如 `n.` / `v.` / 前缀词条 `sus-`）
- 官方中文释义与中文词源
- 关联词条（Entries linking to）
- 变体词自动回退（如查 `batteries` 自动定位到 `battery`）
- 中文页缺失时自动降级为仅英文

## 使用方法

1. 下载 `.potext` 文件（见 [Releases](../../releases) 或 Actions 产物）
2. 打开 Pot → 偏好设置 → 服务设置 → 翻译 → 添加外部插件 → 安装外部插件
3. 选择 `.potext` 文件，安装成功
4. 将「Etymonline 词源」添加到服务列表即可使用

## 词典返回格式

返回 Pot 标准词典 JSON：

```json
{
  "explanations": [
    {
      "trait": "n.",
      "explains": ["电池; 攻击; 殴打", "1530s, \"action of battering\"..."]
    }
  ],
  "associations": ["batter (v.)", "barrage", "..."]
}
```

## 开发

- `info.json`：插件元数据
- `main.js`：插件主逻辑（`translate` 函数）
- `test_parse.js` / `test_e2e.js`：本地解析/端到端测试（`node test_parse.js`）

打包：将 `info.json`、`icon.svg`、`main.js` 压缩为 zip，重命名为 `plugin.com.pot-app.etymonlineword.potext`。

> 本项目对应的独立命令行工具（Python 版，含缓存/批量）见同仓库 `../` 的 `etymonlineWord` 项目。
