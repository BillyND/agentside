import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const languages = { bash, css, diff, go, javascript, json, markdown, python, rust, sql, typescript, xml, yaml };
for (const [name, lang] of Object.entries(languages)) hljs.registerLanguage(name, lang);
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["js", "jsx", "mjs"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["yml"], { languageName: "yaml" });

let copyLabel = "Copy";
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : null;
  const body = language ? hljs.highlight(text, { language }).value : escapeHtml(text);
  const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
  return `<div class="code-block"><div class="code-head">${label}<button class="code-copy" type="button">${escapeHtml(copyLabel)}</button></div><pre><code class="hljs">${body}</code></pre></div>`;
};
renderer.link = ({ href, text }) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${text}</a>`;

marked.use({ renderer, gfm: true, breaks: false });

export function renderMarkdown(text: string, copy = "Copy"): string {
  copyLabel = copy;
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string, { ADD_ATTR: ["target"] });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
