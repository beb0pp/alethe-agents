import { Check, CircleAlert, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { type MessageKey, useT } from '../../lib/i18n'
import { normalizeRemoteUrl, router9RemoteChecks } from '../../lib/router9'
import { readProtectedKey } from '../../lib/tauri'
import type { Router9Models, Router9Preferences } from '../../lib/types'
import controls from '../modals/controls.module.css'
import styles from './Router9Settings.module.css'

type Props = {
  config: Router9Preferences
  patch: (next: Partial<Router9Preferences>) => void
}

type KeyState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'ok'; length: number }
  | { status: 'error'; message: string }

type CheckState = 'ok' | 'bad' | 'pending' | 'info'

const KEY_READ_DELAY_MS = 400
const IDLE: KeyState = { status: 'idle' }

const MODEL_FIELDS: { key: keyof Router9Models; label: MessageKey; placeholder: string }[] = [
  { key: 'opus', label: 'router9.modelOpus', placeholder: 'cc/claude-opus-5-5' },
  { key: 'sonnet', label: 'router9.modelSonnet', placeholder: 'cc/claude-sonnet-5-5' },
  { key: 'haiku', label: 'router9.modelHaiku', placeholder: 'cc/claude-haiku-5-5' },
  { key: 'codex', label: 'router9.modelCodex', placeholder: 'cx/gpt-6.1-sol' },
]

/** Reads the key file shortly after its path stops changing; only the latest read reports. */
function useKeyFileCheck(keyFile: string) {
  const path = keyFile.trim()
  const [state, setState] = useState<KeyState>(IDLE)
  const latest = useRef(0)

  const read = useCallback(async (target: string): Promise<boolean> => {
    const id = ++latest.current
    setState({ status: 'reading' })
    try {
      const key = await readProtectedKey(target)
      if (id === latest.current) setState({ status: 'ok', length: key.length })
      return true
    } catch (error) {
      if (id === latest.current) setState({ status: 'error', message: String(error) })
      return false
    }
  }, [])

  useEffect(() => {
    if (!path) return
    const timer = window.setTimeout(() => void read(path), KEY_READ_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [path, read])

  return { state: path ? state : IDLE, read: () => read(path) }
}

function CheckItem({ state, text }: { state: CheckState; text: string }) {
  const Icon =
    state === 'ok' ? Check : state === 'bad' ? X : state === 'pending' ? LoaderCircle : CircleAlert
  return (
    <li className={styles.checkItem} data-state={state}>
      <Icon size={13} className={styles.checkIcon} aria-hidden />
      <span>{text}</span>
    </li>
  )
}

/** Connection fields for a hosted 9router-compatible gateway, with live readiness and a Done check. */
export function Router9RemoteFields({ config, patch }: Props) {
  const t = useT()
  const keyCheck = useKeyFileCheck(config.keyFile)
  const [outcome, setOutcome] = useState<'saved' | 'blocked' | null>(null)
  const checks = router9RemoteChecks(config)
  const url = normalizeRemoteUrl(config.remoteUrl)

  const update = (next: Partial<Router9Preferences>) => {
    setOutcome(null)
    patch(next)
  }

  const handleDone = async () => {
    if (url !== config.remoteUrl) patch({ remoteUrl: url })
    const keyReady = checks.key === 'file' ? await keyCheck.read() : checks.key === 'inline'
    setOutcome(checks.url === 'ok' && keyReady ? 'saved' : 'blocked')
  }

  const urlItem: [CheckState, string] =
    checks.url === 'ok'
      ? ['ok', t('router9.checkUrlOk', { url })]
      : checks.url === 'invalid'
        ? ['bad', t('router9.checkUrlInvalid')]
        : ['bad', t('router9.checkUrlMissing')]

  const key = keyCheck.state
  const keyItem: [CheckState, string] =
    checks.key === 'inline'
      ? ['ok', t('router9.checkKeyInline')]
      : checks.key === 'missing'
        ? ['bad', t('router9.checkKeyMissing')]
        : key.status === 'ok'
          ? ['ok', t('router9.keyFileOk', { count: String(key.length) })]
          : key.status === 'error'
            ? ['bad', t('router9.keyReadFailed', { error: key.message })]
            : ['pending', t('router9.checkKeyReading')]

  const modelsItem: [CheckState, string] = [
    checks.models === MODEL_FIELDS.length ? 'ok' : 'info',
    t('router9.checkModels', { count: String(checks.models) }),
  ]

  return (
    <div className={styles.connection}>
      <label className={styles.field}>
        <span>{t('router9.remoteUrl')}</span>
        <input
          className={controls.input}
          type="url"
          value={config.remoteUrl}
          placeholder="https://gateway.example.com"
          spellCheck={false}
          onChange={(event) => update({ remoteUrl: event.target.value })}
          onBlur={() => {
            if (url !== config.remoteUrl) patch({ remoteUrl: url })
          }}
        />
      </label>

      <div className={styles.connectionGrid}>
        <label className={styles.field}>
          <span>{t('router9.keyFile')}</span>
          <input
            className={controls.input}
            value={config.keyFile}
            placeholder="C:\Users\you\.config\omniroute\key.dpapi"
            spellCheck={false}
            onChange={(event) => update({ keyFile: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>{t('router9.apiKey')}</span>
          <input
            className={controls.input}
            type="password"
            value={config.apiKey}
            spellCheck={false}
            disabled={Boolean(config.keyFile.trim())}
            onChange={(event) => update({ apiKey: event.target.value })}
          />
        </label>
      </div>
      <p className={styles.hint}>{t('router9.keyFileHint')}</p>

      <div className={styles.connectionGrid}>
        {MODEL_FIELDS.map((field) => (
          <label key={field.key} className={styles.field}>
            <span>{t(field.label)}</span>
            <input
              className={controls.input}
              value={config.models[field.key]}
              placeholder={field.placeholder}
              spellCheck={false}
              onChange={(event) =>
                update({ models: { ...config.models, [field.key]: event.target.value.trim() } })
              }
            />
          </label>
        ))}
      </div>
      <p className={styles.hint}>
        {t('router9.models')} · {t('router9.modelsHint')}
      </p>

      <ul className={styles.checklist}>
        <CheckItem state={urlItem[0]} text={urlItem[1]} />
        <CheckItem state={keyItem[0]} text={keyItem[1]} />
        <CheckItem state={modelsItem[0]} text={modelsItem[1]} />
      </ul>

      <div className={styles.doneRow}>
        <button
          type="button"
          className={`${controls.btn} ${controls.btnPrimary}`}
          disabled={key.status === 'reading'}
          onClick={() => void handleDone()}
        >
          <Check size={13} aria-hidden />
          {t('router9.done')}
        </button>
        {outcome ? (
          <p
            role="status"
            className={styles.doneStatus}
            data-tone={outcome === 'saved' ? 'ok' : 'warn'}
          >
            {outcome === 'saved' ? t('router9.doneConfirmed', { url }) : t('router9.doneBlocked')}
          </p>
        ) : null}
      </div>
    </div>
  )
}
