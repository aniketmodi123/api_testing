import { useState, useEffect } from 'react';
import { api as backendApi } from '../../api';
import { VariableInput } from '../common';
import styles from './RequestPanel.module.css';

const AUTH_TYPES = [
  { value: 'none',       label: 'No Auth' },
  { value: 'bearer',     label: 'Bearer Token' },
  { value: 'basic',      label: 'Basic Auth' },
  { value: 'apikey',     label: 'API Key' },
  { value: 'jwt',        label: 'JWT' },
  { value: 'aws_sigv4',  label: 'AWS Signature v4' },
  { value: 'oauth2',     label: 'OAuth2' },
];

// Fields that hold secrets — display as password inputs and never echo stored value.
const SECRET_FIELDS = new Set(['token', 'password', 'secret', 'client_secret', 'access_key', 'secret_key', 'value']);

function MaskedInput({ name, value, onChange, placeholder }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={styles.authMaskedWrap}>
      <input
        type={revealed ? 'text' : 'password'}
        className={styles.authFieldInput}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder || '••••••••'}
        autoComplete="new-password"
      />
      <button
        type="button"
        className={styles.authRevealBtn}
        onClick={() => setRevealed(r => !r)}
        tabIndex={-1}
      >
        {revealed ? '🙈' : '👁'}
      </button>
    </div>
  );
}

function Field({ label, name, value, onChange, secret, placeholder, type = 'text' }) {
  return (
    <div className={styles.authFieldRow}>
      <label className={styles.authFieldLabel}>{label}</label>
      {secret
        ? <MaskedInput name={name} value={value} onChange={onChange} placeholder={placeholder} />
        : <VariableInput
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
          />
      }
    </div>
  );
}

// Default empty config per type
const EMPTY_CONFIG = {
  none:      {},
  bearer:    { token: '' },
  basic:     { username: '', password: '' },
  apikey:    { key: '', value: '', in: 'header' },
  jwt:       { secret: '', algorithm: 'HS256', payload: '{}', header_name: 'Authorization', header_prefix: 'Bearer' },
  aws_sigv4: { access_key: '', secret_key: '', region: '', service: '' },
  oauth2:    { grant: 'client_credentials', token_url: '', client_id: '', client_secret: '', scope: '' },
};

export default function AuthBuilder({ apiId, initialType = 'none', initialConfig = {} }) {
  const [authType, setAuthType] = useState(initialType);
  const [config, setConfig] = useState({ ...EMPTY_CONFIG[initialType], ...initialConfig });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // When the parent switches to a different API, reset to the loaded auth.
  useEffect(() => {
    setAuthType(initialType);
    setConfig({ ...EMPTY_CONFIG[initialType], ...initialConfig });
    setSaved(false);
    setError(null);
  }, [apiId, initialType]);

  function handleTypeChange(e) {
    const t = e.target.value;
    setAuthType(t);
    // Start fresh config for the new type; keep no cross-type bleed.
    setConfig(EMPTY_CONFIG[t] || {});
    setSaved(false);
    setError(null);
  }

  function handleField(e) {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    setSaved(false);
  }

  async function handleSave() {
    if (!apiId) return;
    setSaving(true);
    setError(null);
    try {
      // jwt payload is edited as JSON string in the textarea — parse before send.
      let sendConfig = { ...config };
      if (authType === 'jwt' && typeof sendConfig.payload === 'string') {
        try {
          sendConfig.payload = JSON.parse(sendConfig.payload || '{}');
        } catch {
          setError('JWT Payload must be valid JSON');
          setSaving(false);
          return;
        }
      }
      await backendApi.put(`/api/${apiId}/auth`, { type: authType, config: sendConfig });
      setSaved(true);
    } catch (err) {
      setError(err?.response?.data?.error_message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.authContent}>
      <div className={styles.authTypeRow}>
        <label className={styles.authLabel}>Auth Type</label>
        <select className={styles.authTypeSelect} value={authType} onChange={handleTypeChange}>
          {AUTH_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {authType === 'none' && (
        <p className={styles.authHint}>No authentication will be sent with this request.</p>
      )}

      {authType === 'bearer' && (
        <div className={styles.authFields}>
          <Field label="Token" name="token" value={config.token || ''} onChange={handleField} secret placeholder="Paste bearer token" />
          <p className={styles.authHint}>Sends: Authorization: Bearer &lt;token&gt;</p>
        </div>
      )}

      {authType === 'basic' && (
        <div className={styles.authFields}>
          <Field label="Username" name="username" value={config.username || ''} onChange={handleField} placeholder="Username" />
          <Field label="Password" name="password" value={config.password || ''} onChange={handleField} secret placeholder="Password" />
          <p className={styles.authHint}>Encoded as Base64(username:password)</p>
        </div>
      )}

      {authType === 'apikey' && (
        <div className={styles.authFields}>
          <Field label="Key name" name="key" value={config.key || ''} onChange={handleField} placeholder="X-API-Key" />
          <Field label="Value" name="value" value={config.value || ''} onChange={handleField} secret placeholder="API key value" />
          <div className={styles.authFieldRow}>
            <label className={styles.authFieldLabel}>Add to</label>
            <select className={styles.authTypeSelect} name="in" value={config.in || 'header'} onChange={handleField}>
              <option value="header">Header</option>
              <option value="query">Query param</option>
            </select>
          </div>
        </div>
      )}

      {authType === 'jwt' && (
        <div className={styles.authFields}>
          <Field label="Secret" name="secret" value={config.secret || ''} onChange={handleField} secret placeholder="Signing secret" />
          <div className={styles.authFieldRow}>
            <label className={styles.authFieldLabel}>Algorithm</label>
            <select className={styles.authTypeSelect} name="algorithm" value={config.algorithm || 'HS256'} onChange={handleField}>
              <option value="HS256">HS256</option>
              <option value="HS384">HS384</option>
              <option value="HS512">HS512</option>
              <option value="RS256">RS256</option>
            </select>
          </div>
          <Field label="Header name" name="header_name" value={config.header_name || 'Authorization'} onChange={handleField} placeholder="Authorization" />
          <Field label="Prefix" name="header_prefix" value={config.header_prefix || 'Bearer'} onChange={handleField} placeholder="Bearer" />
          <div className={styles.authFieldRow}>
            <label className={styles.authFieldLabel}>Payload (JSON)</label>
            <textarea
              className={styles.authTextarea}
              name="payload"
              value={typeof config.payload === 'string' ? config.payload : JSON.stringify(config.payload || {}, null, 2)}
              onChange={handleField}
              rows={4}
              placeholder={'{\n  "sub": "user",\n  "exp": 9999999999\n}'}
            />
          </div>
        </div>
      )}

      {authType === 'aws_sigv4' && (
        <div className={styles.authFields}>
          <Field label="Access Key ID" name="access_key" value={config.access_key || ''} onChange={handleField} secret placeholder="AKIAIOSFODNN7EXAMPLE" />
          <Field label="Secret Access Key" name="secret_key" value={config.secret_key || ''} onChange={handleField} secret placeholder="wJalrXUtnFEMI/K7MDENG/..." />
          <Field label="Region" name="region" value={config.region || ''} onChange={handleField} placeholder="us-east-1" />
          <Field label="Service" name="service" value={config.service || ''} onChange={handleField} placeholder="execute-api" />
          <p className={styles.authHint}>Signs request with server UTC timestamp to avoid clock skew.</p>
        </div>
      )}

      {authType === 'oauth2' && (
        <div className={styles.authFields}>
          <div className={styles.authFieldRow}>
            <label className={styles.authFieldLabel}>Grant type</label>
            <select className={styles.authTypeSelect} name="grant" value={config.grant || 'client_credentials'} onChange={handleField}>
              <option value="client_credentials">Client Credentials</option>
              <option value="authorization_code">Authorization Code</option>
            </select>
          </div>
          <Field label="Token URL" name="token_url" value={config.token_url || ''} onChange={handleField} placeholder="https://auth.example.com/token" />
          <Field label="Client ID" name="client_id" value={config.client_id || ''} onChange={handleField} placeholder="client_id" />
          <Field label="Client Secret" name="client_secret" value={config.client_secret || ''} onChange={handleField} secret placeholder="client_secret" />
          <Field label="Scope" name="scope" value={config.scope || ''} onChange={handleField} placeholder="read write" />
          <p className={styles.authHint}>Token is fetched and cached server-side. Save config first, then use "Get Token" in the runner.</p>
        </div>
      )}

      {authType !== 'none' && (
        <div className={styles.authSaveRow}>
          <button
            className={styles.authSaveBtn}
            onClick={handleSave}
            disabled={saving || !apiId}
          >
            {saving ? 'Saving…' : 'Save Auth'}
          </button>
          {saved && <span className={styles.authSavedMsg}>Saved ✓</span>}
          {error && <span className={styles.authErrorMsg}>{error}</span>}
          {!apiId && <span className={styles.authHint}>Save the API first to persist auth.</span>}
        </div>
      )}
    </div>
  );
}
