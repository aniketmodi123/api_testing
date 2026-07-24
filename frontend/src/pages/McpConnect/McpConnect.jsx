import { useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';
import styles from './McpConnect.module.css';

const MCP_CONFIG = `{
  "mcpServers": {
    "apipilot": {
      "type": "stdio",
      "command": "/Users/aniketmodi/Desktop/venv/bin/python3",
      "args": ["/Users/aniketmodi/Desktop/api_testing/backend/mcp_server/server.py"],
      "env": {
        "PLATFORM_BASE_URL": "https://api-testing-2vjt.onrender.com",
        "PLATFORM_EMAIL": "",
        "PLATFORM_PASSWORD": ""
      }
    }
  }
}`;

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button className={styles.copyButton} onClick={handleCopy} title="Copy to clipboard">
      {copied ? <FiCheck /> : <FiCopy />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function McpConnect() {
  return (
    <div className={styles.container}>
      <h1>Connect MCP Server</h1>
      <p className={styles.subtitle}>
        Connect this platform to Claude (or any MCP-compatible client) as a tool server so it can
        create workspaces, generate test cases, and run tests directly from your AI client.
      </p>

      <div className={styles.section}>
        <h2>1. Locate your MCP client config</h2>
        <p>
          For Claude Desktop, open <code>Settings → Developer → Edit Config</code>, which opens
          <code> claude_desktop_config.json</code>. For Claude Code, add the server to your
          project or user <code>.mcp.json</code>.
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>2. Add this server entry</h2>
          <CopyButton text={MCP_CONFIG} />
        </div>
        <pre className={styles.codeBlock}>
          <code>{MCP_CONFIG}</code>
        </pre>
      </div>

      <div className={styles.section}>
        <h2>3. Fill in the required values</h2>
        <ul className={styles.list}>
          <li>
            <code>command</code> — full path to a Python 3 interpreter that has the server's
            dependencies installed (a venv python works well).
          </li>
          <li>
            <code>args</code> — full path to <code>backend/mcp_server/server.py</code> on your
            machine.
          </li>
          <li>
            <code>PLATFORM_BASE_URL</code> — defaults to the hosted backend (
            <code>https://api-testing-2vjt.onrender.com</code>). Swap it for{' '}
            <code>http://localhost:8000</code> (or your port) if you're running the backend
            locally instead.
          </li>
          <li>
            <code>PLATFORM_EMAIL</code> / <code>PLATFORM_PASSWORD</code> — credentials for the
            account the MCP server should sign in as.
          </li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2>4. Restart your MCP client</h2>
        <p>
          Restart Claude Desktop / Claude Code so it picks up the new server. Once connected, the
          <code> apipilot</code> tools (workspaces, cases, runs, environments) become available to
          the model.
        </p>
      </div>
    </div>
  );
}
