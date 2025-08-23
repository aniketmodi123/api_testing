import { useState } from 'react';
import styles from './RequestPanel.module.css';

export default function RequestPanel({ activeRequest }) {
  const [method, setMethod] = useState(activeRequest?.method || 'GET');
  const [url, setUrl] = useState(
    activeRequest?.url || 'https://api.example.com'
  );
  const [activeTab, setActiveTab] = useState('params');
  const [responseTab, setResponseTab] = useState('body');
  const [isSending, setIsSending] = useState(false);
  const [response, setResponse] = useState(null);

  const handleSend = async () => {
    setIsSending(true);

    // Simulate API call
    setTimeout(() => {
      setResponse({
        status: 200,
        statusText: 'OK',
        time: '123 ms',
        size: '532 B',
        body: {
          status: 'success',
          data: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
          ],
        },
        headers: {
          'content-type': 'application/json',
          'x-powered-by': 'Example Server',
          date: new Date().toUTCString(),
        },
      });
      setIsSending(false);
    }, 800);
  };

  return (
    <div className={styles.requestPanel}>
      {/* Request URL Bar */}
      <div className={styles.urlBar}>
        <select
          className={styles.methodSelector}
          value={method}
          onChange={e => setMethod(e.target.value)}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
          <option value="HEAD">HEAD</option>
          <option value="OPTIONS">OPTIONS</option>
        </select>

        <input
          type="text"
          className={styles.urlInput}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Enter request URL"
        />

        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={isSending}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Request Configuration Tabs */}
      <div className={styles.tabs}>
        <div
          className={`${styles.tab} ${activeTab === 'params' ? styles.active : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Params
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'authorization' ? styles.active : ''}`}
          onClick={() => setActiveTab('authorization')}
        >
          Authorization
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'headers' ? styles.active : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'body' ? styles.active : ''}`}
          onClick={() => setActiveTab('body')}
        >
          Body
        </div>
        <div
          className={`${styles.tab} ${activeTab === 'tests' ? styles.active : ''}`}
          onClick={() => setActiveTab('tests')}
        >
          Tests
        </div>
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {activeTab === 'params' && (
          <div className={styles.paramsContent}>
            <div className={styles.paramTable}>
              <div className={styles.paramHeader}>
                <div className={styles.paramCheckbox}></div>
                <div className={styles.paramKey}>KEY</div>
                <div className={styles.paramValue}>VALUE</div>
                <div className={styles.paramDescription}>DESCRIPTION</div>
              </div>

              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" />
                </div>
                <div className={styles.paramKey}>
                  <input type="text" placeholder="Key" />
                </div>
                <div className={styles.paramValue}>
                  <input type="text" placeholder="Value" />
                </div>
                <div className={styles.paramDescription}>
                  <input type="text" placeholder="Description" />
                </div>
              </div>

              {/* Empty row for new param */}
              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" disabled />
                </div>
                <div className={styles.paramKey}>
                  <input type="text" placeholder="Key" />
                </div>
                <div className={styles.paramValue}>
                  <input type="text" placeholder="Value" />
                </div>
                <div className={styles.paramDescription}>
                  <input type="text" placeholder="Description" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'headers' && (
          <div className={styles.headersContent}>
            <div className={styles.paramTable}>
              <div className={styles.paramHeader}>
                <div className={styles.paramCheckbox}></div>
                <div className={styles.paramKey}>KEY</div>
                <div className={styles.paramValue}>VALUE</div>
                <div className={styles.paramDescription}>DESCRIPTION</div>
              </div>

              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" defaultChecked />
                </div>
                <div className={styles.paramKey}>
                  <input type="text" defaultValue="Content-Type" />
                </div>
                <div className={styles.paramValue}>
                  <input type="text" defaultValue="application/json" />
                </div>
                <div className={styles.paramDescription}>
                  <input type="text" defaultValue="Content type header" />
                </div>
              </div>

              {/* Empty row for new header */}
              <div className={styles.paramRow}>
                <div className={styles.paramCheckbox}>
                  <input type="checkbox" disabled />
                </div>
                <div className={styles.paramKey}>
                  <input type="text" placeholder="Key" />
                </div>
                <div className={styles.paramValue}>
                  <input type="text" placeholder="Value" />
                </div>
                <div className={styles.paramDescription}>
                  <input type="text" placeholder="Description" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'body' && (
          <div className={styles.bodyContent}>
            <div className={styles.bodyTypeSelector}>
              <div className={styles.bodyTypeBadge}>none</div>
              <div className={styles.bodyTypeBadge}>raw</div>
              <div className={`${styles.bodyTypeBadge} ${styles.active}`}>
                JSON
              </div>
              <div className={styles.bodyTypeBadge}>XML</div>
              <div className={styles.bodyTypeBadge}>form-data</div>
            </div>

            <div className={styles.jsonEditor}>
              <pre>{`{
  "name": "Example",
  "data": {
    "id": 1,
    "description": "Sample request body"
  }
}`}</pre>
            </div>
          </div>
        )}

        {activeTab === 'authorization' && (
          <div className={styles.authContent}>
            <div className={styles.authType}>
              <label>Type</label>
              <select>
                <option>No Auth</option>
                <option>Bearer Token</option>
                <option>Basic Auth</option>
                <option>OAuth 2.0</option>
                <option>API Key</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Response Section */}
      <div className={styles.responseSection}>
        <div className={styles.responseMeta}>
          {response && (
            <>
              <div
                className={`${styles.statusBadge} ${response.status < 300 ? styles.success : styles.error}`}
              >
                Status: {response.status} {response.statusText}
              </div>
              <div className={styles.responseInfo}>
                <span>Time: {response.time}</span>
                <span>Size: {response.size}</span>
              </div>
            </>
          )}
        </div>

        {response && (
          <>
            <div className={styles.responseTabs}>
              <div
                className={`${styles.responseTab} ${responseTab === 'body' ? styles.active : ''}`}
                onClick={() => setResponseTab('body')}
              >
                Body
              </div>
              <div
                className={`${styles.responseTab} ${responseTab === 'headers' ? styles.active : ''}`}
                onClick={() => setResponseTab('headers')}
              >
                Headers
              </div>
            </div>

            <div className={styles.responseContent}>
              {responseTab === 'body' && (
                <div className={styles.responseBody}>
                  <pre>{JSON.stringify(response.body, null, 2)}</pre>
                </div>
              )}

              {responseTab === 'headers' && (
                <div className={styles.responseHeaders}>
                  {Object.entries(response.headers).map(([key, value]) => (
                    <div key={key} className={styles.headerRow}>
                      <span className={styles.headerKey}>{key}:</span>
                      <span className={styles.headerValue}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
