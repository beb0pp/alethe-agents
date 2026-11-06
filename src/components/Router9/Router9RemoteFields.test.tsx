import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(() => ({ readProtectedKey: vi.fn() }))
vi.mock('../../lib/tauri', () => tauri)

vi.mock('../../stores/projectsStore', () => ({
  useProjectsStore: (selector: (state: unknown) => unknown) =>
    selector({ preferences: { language: 'en' } }),
}))

import { DEFAULT_ROUTER9_PREFERENCES, type Router9Preferences } from '../../lib/types'
import { Router9RemoteFields } from './Router9RemoteFields'

const ready: Router9Preferences = {
  ...DEFAULT_ROUTER9_PREFERENCES,
  enabled: true,
  mode: 'remote',
  remoteUrl: 'https://gw.example.com',
  keyFile: 'C:/k.dpapi',
  models: { opus: 'cc/o', sonnet: 'cc/s', haiku: 'cc/h', codex: 'cx/c' },
}

describe('Router9RemoteFields', () => {
  beforeEach(() => {
    tauri.readProtectedKey.mockReset()
  })
  afterEach(cleanup)

  it('reads the key file on its own and says it was read', async () => {
    tauri.readProtectedKey.mockResolvedValue('k'.repeat(35))
    render(<Router9RemoteFields config={ready} patch={vi.fn()} />)

    expect(await screen.findByText('Key read (35 characters).')).toBeTruthy()
    expect(tauri.readProtectedKey).toHaveBeenCalledWith('C:/k.dpapi')
    expect(screen.getByText('Gateway https://gw.example.com')).toBeTruthy()
    expect(screen.getByText('4 of 4 model ids set')).toBeTruthy()
  })

  it('shows why the key file could not be read', async () => {
    tauri.readProtectedKey.mockRejectedValue('Key file not readable: missing')
    render(<Router9RemoteFields config={ready} patch={vi.fn()} />)

    expect(
      await screen.findByText(
        'Could not read the 9router key file: Key file not readable: missing',
      ),
    ).toBeTruthy()
  })

  it('confirms with Done that routing is saved and live', async () => {
    tauri.readProtectedKey.mockResolvedValue('k'.repeat(35))
    render(<Router9RemoteFields config={ready} patch={vi.fn()} />)
    await screen.findByText('Key read (35 characters).')

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain(
      'Saved. New terminals with Route through 9router go through https://gw.example.com.',
    )
  })

  it('refuses to confirm while a part is not ready', async () => {
    tauri.readProtectedKey.mockResolvedValue('k'.repeat(35))
    const cleartext = { ...ready, remoteUrl: 'http://gw.example.com' }
    render(<Router9RemoteFields config={cleartext} patch={vi.fn()} />)
    await screen.findByText('Key read (35 characters).')

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByText('Not ready yet: fix the items marked above.')).toBeTruthy()
    expect(screen.queryByText(/^Saved\./)).toBeNull()
  })
})
