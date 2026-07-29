import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownContentProps {
  content: string;
  /** Extra classes applied to the wrapper (font size / color context). */
  className?: string;
}

/**
 * Shared Markdown renderer for the 牆 (wall) — posts, replies and AI comments.
 *
 * Uses react-markdown with GFM (tables, strikethrough, task lists, autolinks).
 * Raw HTML is NOT rendered (no rehype-raw), so pasted `<script>` / `<img onerror>`
 * shows as inert text — react-markdown escapes it by default, keeping us safe
 * without a separate sanitizer. Links open in a new tab with noopener.
 *
 * Styling mirrors the previous plain-text look (petal tokens, relaxed leading)
 * and adds sensible spacing for headings / lists / code / quotes.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-petal-rose-deep underline underline-offset-2 hover:opacity-80 break-words"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h1 className="font-display text-lg font-semibold mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="font-display text-base font-semibold mt-3 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="font-display text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-petal-rose-deep/40 pl-3 my-2 text-petal-ink-soft italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    // Fenced code blocks carry a language- class; inline code does not.
    const isBlock = /\blanguage-/.test(className || '');
    if (isBlock) {
      return (
        <code className="block bg-petal-cream-2 rounded-md p-3 my-2 overflow-x-auto font-mono text-[13px] whitespace-pre">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-petal-cream-2 rounded px-1 py-0.5 font-mono text-[13px]">{children}</code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  hr: () => <hr className="my-3 border-petal-rule" />,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-petal-rule px-2 py-1 text-left font-medium bg-petal-cream-2">{children}</th>
  ),
  td: ({ children }) => <td className="border border-petal-rule px-2 py-1">{children}</td>,
};

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className }) => (
  <div className={className}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {content}
    </ReactMarkdown>
  </div>
);

export default MarkdownContent;
