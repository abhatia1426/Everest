import { ArrowRight, Search, Sparkles } from 'lucide-react'

import { Surface } from '../ui/Surface'

/**
 * The Investigate composer.
 *
 * A workspace, not a chat. You pick a question Everest can answer and a tool
 * that reads named sources; you do not type into an open-ended box and hope.
 * The free-text field exists to let you phrase the question in your own words,
 * but the TOOL is what determines what actually gets read, and the tool grid
 * says so under every name.
 *
 * PROVIDER DISPLAY. The chip leads with "Everest AI". The exact provider and
 * model live in its tooltip, sourced from the server, because the model is a
 * pinned implementation detail — surfacing `gemini-3.6-flash` in the primary UI
 * would make the product look like a wrapper around someone else's model
 * rather than a tool with a data contract.
 */
export function Investigate({
  ask,
  onAskChange,
  prompts,
  activeToolId,
  onSelectTool,
  tools,
  disabledReasons,
  onRun,
  running,
  provider,
  children,
}) {
  return (
    <Surface as="section" className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-subtle px-4 py-3.5 sm:px-5">
        <h2 className="t-eyebrow">Investigate</h2>
        <span
          className="ml-auto flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full
            bg-tint/[0.05] px-2.5 py-1 text-[10.5px] font-semibold text-text-secondary"
          title={providerTip(provider)}
        >
          <Sparkles size={11} />
          {provider?.label || 'Everest AI'}
        </span>
      </header>

      <div className="px-4 py-4 sm:px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!running) onRun()
          }}
          className="glass-control flex flex-col items-stretch gap-2.5 rounded-panel p-1.5 pl-4
            sm:flex-row sm:items-center"
        >
          <Search size={15} className="hidden shrink-0 text-text-tertiary sm:block" />
          <label htmlFor="ai-ask" className="sr-only">
            Ask Everest AI about your portfolio
          </label>
          <input
            id="ai-ask"
            value={ask}
            onChange={(event) => onAskChange(event.target.value)}
            placeholder="Ask about your positions, watchlist or contracts"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] tracking-[-0.01em]
              text-text-primary outline-none placeholder:text-text-tertiary max-sm:px-3"
          />
          <button type="submit" disabled={running} className="btn-primary shrink-0 px-4 py-2.5 text-[12.5px]">
            {running ? 'Working…' : 'Ask Everest'}
            {running ? null : <ArrowRight size={11} />}
          </button>
        </form>

        {/* ---------------------------------------------- answerable now */}
        {prompts.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="t-eyebrow !text-[10px] !text-text-tertiary">Answerable now</span>
            {prompts.map(({ prompt, tool }) => {
              const active = prompt === ask
              return (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    onAskChange(prompt)
                    onSelectTool(tool.id)
                  }}
                  title={`Runs “${tool.name}” over ${lowerFirst(tool.uses)}`}
                  className={`rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold
                    transition-colors duration-150 ${
                      active
                        ? 'border-accent bg-accent/[0.14] text-accent'
                        : 'border-subtle bg-tint/[0.04] text-text-secondary hover:text-text-primary'
                    }`}
                >
                  {prompt}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="mt-3 text-[11.5px] leading-relaxed text-text-secondary">
            Everest has nothing it can answer yet — the questions it supports all read your
            positions or your watchlist. Add either and they appear here.
          </p>
        )}

        {/* ------------------------------------------------------- tools */}
        <div className="mt-3.5 grid grid-cols-1 gap-2 border-t border-subtle pt-3.5 min-[960px]:grid-cols-2">
          {tools.map((tool) => {
            const active = tool.id === activeToolId
            const reason = disabledReasons[tool.id]
            const Icon = tool.icon

            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectTool(tool.id)}
                aria-pressed={active}
                title={`${tool.name} — runs the ${tool.registryName} tool. Reads: ${tool.uses}`}
                className={`flex items-start gap-2.5 rounded-panel p-3 text-left transition-colors
                  duration-150 ${
                    active
                      ? 'bg-tint/[0.05] shadow-[inset_0_0_0_1px_var(--accent-blue)]'
                      : 'shadow-[inset_0_0_0_1px_var(--border)] hover:bg-tint/[0.04]'
                  } ${reason ? 'opacity-60' : ''}`}
              >
                <span
                  className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-control ${
                    active ? 'bg-accent/[0.16] text-accent' : 'bg-tint/[0.06] text-text-tertiary'
                  }`}
                >
                  <Icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-[12.5px] font-bold tracking-[-0.015em] ${
                        active ? 'text-text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {tool.name}
                    </span>
                    {reason ? (
                      <span className="whitespace-nowrap rounded bg-warn/[0.16] px-1.5 py-px text-[9.5px] font-bold text-warn">
                        {reason}
                      </span>
                    ) : null}
                  </span>
                  {/* What it READS. Stated for every tool, not just the
                      selected one — "what will this look at" is the question
                      you have before you pick, not after. */}
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-text-tertiary">
                    {tool.uses}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Tool-specific inputs (tickers to compare, screener style). */}
        {children}
      </div>
    </Surface>
  )
}

function providerTip(provider) {
  if (!provider) return 'Everest AI writes the analysis from the measured figures listed under Grounded in.'
  if (!provider.configured) {
    return `Everest AI is not configured. Written analysis needs a ${provider.provider} API key; every measurement on this page works without one.`
  }
  return `Everest AI writes the analysis from the measured figures listed under Grounded in. Provider: ${provider.provider}, model ${provider.model}. The measurements themselves are calculated directly from your Everest data and do not use the AI.`
}

function lowerFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text
}
