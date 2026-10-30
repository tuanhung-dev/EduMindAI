import { Fragment, type ReactNode } from "react";

/** Render a small, safe subset of Markdown without dangerouslySetInnerHTML. */
function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function renderBlock(lines: string[], index: number): ReactNode {
  const first = lines[0] ?? "";
  const heading = /^(#{1,4})\s+(.+)$/.exec(first);
  if (heading) {
    const text = inlineMarkdown(heading[2]);
    if (heading[1].length === 1) return <h2 key={index}>{text}</h2>;
    if (heading[1].length === 2) return <h3 key={index}>{text}</h3>;
    return <h4 key={index}>{text}</h4>;
  }
  if (lines.every(line => /^\s*[-*+]\s+/.test(line))) {
    return <ul key={index}>{lines.map((line, i) => <li key={i}>{inlineMarkdown(line.replace(/^\s*[-*+]\s+/, ""))}</li>)}</ul>;
  }
  if (lines.every(line => /^\s*\d+[.)]\s+/.test(line))) {
    return <ol key={index}>{lines.map((line, i) => <li key={i}>{inlineMarkdown(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
  }
  if (lines.every(line => /^>\s?/.test(line))) return <blockquote key={index}>{lines.map((line, i) => <p key={i}>{inlineMarkdown(line.replace(/^>\s?/, ""))}</p>)}</blockquote>;
  return <p key={index}>{lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{inlineMarkdown(line)}</Fragment>)}</p>;
}

export default function TutorRichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;
  let codeLanguage = "";
  const flush = () => {
    if (paragraph.length) {
      blocks.push(renderBlock(paragraph, blocks.length));
      paragraph = [];
    }
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flush();
      if (code === null) {
        code = [];
        codeLanguage = line.replace(/^\s*```/, "").trim().slice(0, 25);
      } else {
        blocks.push(<div className="emgpt-code" key={blocks.length}>
          {codeLanguage && <span className="emgpt-code-language">{codeLanguage}</span>}
          <pre><code>{code.join("\n")}</code></pre>
        </div>);
        code = null;
      }
      continue;
    }
    if (code !== null) { code.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^(#{1,4}\s+|\s*[-*+]\s+|\s*\d+[.)]\s+|>\s?)/.test(line)) {
      if (paragraph.length && !(/^(\s*[-*+]\s+|\s*\d+[.)]\s+|>\s?)/.test(paragraph[0]) &&
        /^(\s*[-*+]\s+|\s*\d+[.)]\s+|>\s?)/.test(line))) flush();
      if (paragraph.length && /^(#{1,4})\s+/.test(line)) flush();
      if (paragraph.length && /^(\s*[-*+]\s+|\s*\d+[.)]\s+|>\s?)/.test(line) &&
        /^(\s*[-*+]\s+|\s*\d+[.)]\s+|>\s?)/.test(paragraph[0]) &&
        paragraph[0].replace(/^\s*/, "")[0] !== line.replace(/^\s*/, "")[0]) flush();
    }
    paragraph.push(line);
    if (/^#{1,4}\s+/.test(line)) flush();
  }
  flush();
  if (code !== null) blocks.push(<div className="emgpt-code" key={blocks.length}><pre><code>{code.join("\n")}</code></pre></div>);
  return <div className="emgpt-markdown">{blocks}</div>;
}
