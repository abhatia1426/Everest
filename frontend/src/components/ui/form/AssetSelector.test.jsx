import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssetSelector } from './AssetSelector'
import { DEBOUNCE_MS, clearAssetSearchCache } from '../../../hooks/useAssetSearch'

/**
 * The selection contract.
 *
 * THE BUG THESE EXIST FOR: `AssetSelector` wrote every keystroke to the
 * committed symbol and rendered the confirmed asset card whenever that symbol
 * was truthy. Typing "A" therefore resolved to Agilent Technologies, fired a
 * quote request, and left nowhere to type the second character. Nothing in
 * lint, the build, or the backend suite could see it — only a test that drives
 * the component the way a person does.
 */

function setup(props = {}) {
  const onChange = vi.fn()
  const utils = render(
    <MemoryRouter>
      <AssetSelector symbol="" onChange={onChange} quote={null} loading={false} {...props} />
    </MemoryRouter>,
  )
  return { onChange, user: userEvent.setup(), ...utils }
}

afterEach(() => {
  clearAssetSearchCache()
  vi.restoreAllMocks()
})

async function typeAndSettle(user, element, text) {
  await user.type(element, text)
  // Past the debounce, so results have actually resolved.
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 200))
}

describe('typing never commits a symbol', () => {
  it('does not call onChange while typing one character', async () => {
    const { onChange, user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'A')

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('does not call onChange while typing a full ticker', async () => {
    const { onChange, user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'AAPL')

    expect(onChange).not.toHaveBeenCalled()
    // The search box must survive — this is what the original bug destroyed.
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows the threshold message below the minimum length', async () => {
    const { user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'A')

    expect(await screen.findByText(/type at least 2 characters/i)).toBeInTheDocument()
  })

  it('shows a no-results message when nothing matches', async () => {
    const { user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'ZZZZZ')

    expect(await screen.findByText(/no companies found/i)).toBeInTheDocument()
  })
})

describe('selection', () => {
  it('commits exactly once when a result is clicked', async () => {
    const { onChange, user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'AAPL')

    const options = await screen.findAllByRole('option')
    await user.click(options[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('AAPL')
  })

  it('closes the dropdown after selecting', async () => {
    const { user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'AAPL')

    await user.click((await screen.findAllByRole('option'))[0])

    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
  })

  it('shows the confirmed asset card once a symbol is committed', async () => {
    const quote = {
      raw: { ticker: 'AAPL', company: 'Apple Inc', sector: 'Technology', exchange: 'NASDAQ' },
      quote: { price: 313.25, state: 'live', unavailable: false, isMarketPrice: true },
    }
    render(
      <MemoryRouter>
        <AssetSelector symbol="AAPL" onChange={vi.fn()} quote={quote} loading={false} />
      </MemoryRouter>,
    )

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('Apple Inc')).toBeInTheDocument()
    // Exchange, sector and industry all present — Part 5's completeness goal.
    expect(screen.getByText(/NASDAQ/)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('returns to search when Change is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AssetSelector
          symbol="AAPL"
          onChange={onChange}
          quote={{ raw: { ticker: 'AAPL', company: 'Apple Inc' }, quote: { price: 1, unavailable: false } }}
          loading={false}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /change/i }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('hides Change when the symbol is locked', () => {
    render(
      <MemoryRouter>
        <AssetSelector
          symbol="AAPL"
          onChange={vi.fn()}
          locked
          quote={{ raw: { ticker: 'AAPL', company: 'Apple Inc' }, quote: { price: 1, unavailable: false } }}
          loading={false}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument()
    expect(screen.getByText(/locked/i)).toBeInTheDocument()
  })
})

describe('keyboard and dismissal', () => {
  it('selects the highlighted result with Enter', async () => {
    const { onChange, user } = setup()
    const input = screen.getByRole('combobox')
    await typeAndSettle(user, input, 'AAPL')
    await screen.findAllByRole('option')

    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('AAPL')
  })

  it('moves the active option with arrow keys', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox')
    await typeAndSettle(user, input, 'MI') // matches several symbols

    const before = input.getAttribute('aria-activedescendant')
    await user.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(input.getAttribute('aria-activedescendant')).not.toBe(before),
    )

    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toBe(before))
  })

  it('closes the dropdown on Escape without committing', async () => {
    const { onChange, user } = setup()
    const input = screen.getByRole('combobox')
    await typeAndSettle(user, input, 'AAPL')
    await screen.findAllByRole('option')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes the dropdown when clicking outside', async () => {
    const { onChange, user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'AAPL')
    await screen.findAllByRole('option')

    await user.click(document.body)

    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('result content', () => {
  it('shows logo, company name, ticker and sector — not just a ticker', async () => {
    const { user } = setup()
    await typeAndSettle(user, screen.getByRole('combobox'), 'AAPL')

    const option = (await screen.findAllByRole('option'))[0]
    expect(within(option).getByText(/Apple Inc/)).toBeInTheDocument()
    expect(within(option).getByText('AAPL')).toBeInTheDocument()
    expect(within(option).getByText(/Technology/)).toBeInTheDocument()
  })

  it('allows typing a full company name', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox')
    await typeAndSettle(user, input, 'Microsoft')

    // maxLength used to be 5, making this literally impossible to type.
    expect(input.value).toBe('Microsoft')
    const option = (await screen.findAllByRole('option'))[0]
    expect(within(option).getByText('MSFT')).toBeInTheDocument()
  })
})
