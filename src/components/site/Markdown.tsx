import { Fragment, type ReactNode } from "react";

/**
 * A small, safe renderer for text written in the admin: # / ## / ### headings, paragraphs (blank line),
 * "- " bullets, "1. " numbered lists, **bold**, *italic*, [links](https://…) and bare https:// links.
 * Nothing is ever inserted as HTML.
 */
export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => { if (para.length) { out.push(<p key={out.length}>{inline(para.join(" "))}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    out.push(list.ordered ? <ol key={out.length} className="list-decimal">{items}</ol> : <ul key={out.length} className="list-disc">{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (h) {
      flushPara(); flushList();
      const Tag = h[1].length === 1 ? "h2" : h[1].length === 2 ? "h2" : "h3";
      out.push(<Tag key={out.length}>{inline(h[2])}</Tag>);
    } else if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol && !ul);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)![1]);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += " " + line.trim(); // continuation of a list item
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return <div className={`fc-prose ${className}`}>{out}</div>;
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\((?:https?:\/\/|mailto:|\/)[^)\s]+\)|https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;

function inline(s: string): ReactNode {
  return s.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]/.test(part) && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) return <a key={i} href={link[2]} {...ext(link[2])}>{link[1]}</a>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} {...ext(part)}>{part}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
const ext = (href: string) => (/^https?:\/\//.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {});
