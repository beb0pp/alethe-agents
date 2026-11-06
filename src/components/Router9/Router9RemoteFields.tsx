import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { type MessageKey, useT } from '../../lib/i18n'
import { normalizeRemoteUrl } from '../../lib/router9'
import { readProtectedKey } from '../../lib/tauri'
import type { Router9Models, Router9Preferences } from '../../lib/types'
import controls from '../modals/controls.module.css'
import styles from './Router9Settings.module.css'

type Props = {
  config: Router9Preferences
  patch: (next: Partial<Router9Preferences>) => void
}

const MODEL_FIELDS: { key: keyof Router9Models; label: MessageKey; placeholder: string }[] = [
  { key: 'opus', label: 'router9.modelOpus', placeholder: 'cc/claude-opus-5-5' },
  { key: 'sonnet', label: 'router9.modelSonnet', placeholder: 'cc/claude-sonnet-5-5' },
  { key: 'haiku', label: 'router9.modelHaiku', placeholder: 'cc/claude-haiku-5-5' },
  { key: 'codex', label: 'router9.modelCodex', placeholder: 'cx/gpt-6.1-sol' },
]

/** Connection fields for a hosted 9router-compatible gateway. */
export function Router9RemoteFields({ config, patch }: Props) {
  const t = useT()
  const [keyCheck, setKeyCheck] = useState<{ ok: boolean; text: string } | null>(null)

  const checkKeyFile = async () => {
    setKeyCheck(null)
    try {
      const key = await readProtectedKey(config.keyFile)
      setKeyCheck({ ok: true, text: t('router9.keyFileOk', { count: String(key.length) }) })
    } catch (error) {
      setKeyCheck({ ok: false, text: t('router9.keyReadFailed', { error: String(error) }) })
    }
  }

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
          onChange={(event) => patch({ remoteUrl: event.target.value })}
          onBlur={() => patch({ remoteUrl: normalizeRemoteUrl(config.remoteUrl) })}
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
            onChange={(event) => {
              setKeyCheck(null)
              patch({ keyFile: event.target.value })
            }}
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
            onChange={(event) => patch({ apiKey: event.target.value })}
          />
        </label>
      </div>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.quietBtn}
          disabled={!config.keyFile.trim()}
          onClick={() => void checkKeyFile()}
        >
          <KeyRound size={12} />
          {t('router9.keyFileCheck')}
        </button>
      </div>
      {keyCheck ? (
        <p className={styles.notice} data-tone={keyCheck.ok ? 'info' : 'warn'}>
          {keyCheck.text}
        </p>
      ) : null}
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
                patch({ models: { ...config.models, [field.key]: event.target.value.trim() } })
              }
            />
          </label>
        ))}
      </div>
      <p className={styles.hint}>
        {t('router9.models')} · {t('router9.modelsHint')}
      </p>
    </div>
  )
}
