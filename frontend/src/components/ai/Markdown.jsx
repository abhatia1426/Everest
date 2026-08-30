import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Markdown renderer tuned for analyst prose.
 *
 * Every element is mapped explicitly so output inherits the app's typography
 * and theme tokens rather than browser defaults — the report should look like
 * part of Everest, not like a pasted document.
 */
export function Markdown({ children, className = '' }) {
  if (!children) return null

  return (
    <div className={`text-sm leading-relaxed text-text-secondary ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children: c }) => <p className="mb-3 last:mb-0">{c}</p>,
          strong: ({ children: c }) => (
            <strong className="font-semibold text-text-primary">{c}</strong>
          ),
          em: ({ children: c }) => <em className="italic">{c}</em>,
          ul: ({ children: c }) => (
            <ul className="mb-3 space-y-1.5 last:mb-0">{c}</ul>
          ),
          ol: ({ children: c }) => (
            <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{c}</ol>
          ),
          li: ({ children: c }) => (
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
              <span className="min-w-0 flex-1">{c}</span>
            </li>
          ),
          h1: ({ children: c }) => (
            <h3 className="mb-2 mt-4 text-base font-bold text-text-primary first:mt-0">{c}</h3>
          ),
          h2: ({ children: c }) => (
            <h4 className="mb-2 mt-4 text-sm font-bold text-text-primary first:mt-0">{c}</h4>
          ),
          h3: ({ children: c }) => (
            <h5 className="mb-1.5 mt-3 text-xs font-bold uppercase tracking-wider text-text-secondary first:mt-0">
              {c}
            </h5>
          ),
          a: ({ children: c, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer font-medium text-accent hover:underline"
            >
              {c}
            </a>
          ),
          // Inline code is used for tickers and figures; blocks stay rare by design.
          code: ({ inline, children: c }) =>
            inline ? (
              <code className="num rounded bg-tint/[0.06] px-1.5 py-0.5 text-[0.85em] text-text-primary">
                {c}
              </code>
            ) : (
              <code className="num block overflow-x-auto rounded-lg bg-tint/[0.05] p-3 text-xs text-text-primary">
                {c}
              </code>
            ),
          blockquote: ({ children: c }) => (
            <blockquote className="mb-3 border-l-2 border-accent/40 pl-3 italic">{c}</blockquote>
          ),
          table: ({ children: c }) => (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full text-xs">{c}</table>
            </div>
          ),
          th: ({ children: c }) => (
            <th className="border-b border-subtle px-2 py-1.5 text-left font-semibold text-text-secondary">
              {c}
            </th>
          ),
          td: ({ children: c }) => (
            <td className="border-b border-subtle px-2 py-1.5 text-text-primary">{c}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
