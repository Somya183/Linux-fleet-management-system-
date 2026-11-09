

import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000/metrics'
const HEALTH_URL = 'http://localhost:8000/health'
const COMMANDS_URL = 'http://localhost:8000/commands'
const EVENTS_URL = 'http://localhost:8000/events'
const GRAFANA_URL = 'http://192.168.56.101:3000'

const DEFAULT_NODE = 'linux-node-1'
const REFRESH_INTERVAL = 5000

const APPROVED_COMMANDS = [
  {
    value: 'uptime',
    label: 'uptime',
    description: 'System uptime and load',
  },
  {
    value: 'free -h',
    label: 'free -h',
    description: 'Memory usage',
  },
  {
    value: 'df -h',
    label: 'df -h',
    description: 'Disk space usage',
  },
]

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(1) : '—'
}

function getPercent(used, total) {
  const usedValue = Number(used)
  const totalValue = Number(total)

  if (
    !Number.isFinite(usedValue) ||
    !Number.isFinite(totalValue) ||
    totalValue <= 0
  ) {
    return 0
  }

  return Math.min(100, Math.max(0, (usedValue / totalValue) * 100))
}

function formatTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatEventTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Metric card component
function MetricCard({
  title,
  value,
  unit,
  detail,
  icon,
  tone,
  percent,
}) {
  const safePercent = Math.min(100, Math.max(0, toNumber(percent)))

  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-card-top">
        <div className="metric-icon">{icon}</div>

        <span className="metric-indicator">
          <span />
          LIVE
        </span>
      </div>

      <p className="metric-label">{title}</p>

      <div className="metric-number">
        <strong>{value}</strong>
        {unit && <span>{unit}</span>}
      </div>

      <div
        className="metric-progress"
        role="progressbar"
        aria-label={title}
        aria-valuenow={safePercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${safePercent}%` }} />
      </div>

      <p className="metric-detail">{detail}</p>
    </article>
  )
}

// History chart component
function HistoryChart({
  title,
  subtitle,
  records,
  getValue,
  color,
}) {
  const history = [...records].slice(0, 24).reverse()

  const width = 640
  const height = 210
  const left = 42
  const right = 620
  const top = 18
  const bottom = 166

  const values = history.map((record) => {
    const value = Number(getValue(record))

    return Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : 0
  })

  const pointFor = (value, index) => {
    const x =
      values.length <= 1
        ? (left + right) / 2
        : left + (index * (right - left)) / (values.length - 1)

    const y = bottom - (value / 100) * (bottom - top)

    return { x, y }
  }

  const points = values
    .map((value, index) => {
      const point = pointFor(value, index)
      return `${point.x},${point.y}`
    })
    .join(' ')

  return (
    <article className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>

        <span className="chart-legend">
          <span style={{ background: color }} />
          Usage
        </span>
      </div>

      {history.length === 0 ? (
        <div className="chart-empty">
          <span className="empty-chart-icon">⌁</span>
          <p>Waiting for metric samples…</p>
        </div>
      ) : (
        <div className="chart-scroll">
          <svg
            className="history-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${title} history`}
          >
            {[0, 25, 50, 75, 100].map((tick) => {
              const y = bottom - (tick / 100) * (bottom - top)

              return (
                <g key={tick}>
                  <line
                    x1={left}
                    y1={y}
                    x2={right}
                    y2={y}
                    className="chart-grid-line"
                  />

                  <text
                    x={left - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="chart-axis-label"
                  >
                    {tick}%
                  </text>
                </g>
              )
            })}

            {values.length > 1 && (
              <polygon
                points={`${left},${bottom} ${points} ${right},${bottom}`}
                fill={color}
                opacity="0.09"
              />
            )}

            {values.length > 1 && (
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {values.map((value, index) => {
              const point = pointFor(value, index)

              return (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={index === values.length - 1 ? 4.5 : 2.5}
                  fill={color}
                  stroke="#101827"
                  strokeWidth="2"
                />
              )
            })}

            <text x={left} y="195" className="chart-axis-label">
              Older
            </text>

            <text
              x={right}
              y="195"
              textAnchor="end"
              className="chart-axis-label"
            >
              Latest
            </text>
          </svg>
        </div>
      )}

      <div className="chart-footer">
        <span>
          <span className="status-dot status-dot-blue" />
          {history.length} samples received
        </span>

        <span>Scale: 0–100%</span>
      </div>
    </article>
  )
}

// Status badge component
function StatusBadge({ status }) {
  const normalized = String(status || 'unknown').toLowerCase()

  return (
    <span className={`status-badge status-${normalized}`}>
      <span />
      {normalized}
    </span>
  )
}

function App() {
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  // All registered node health information
  const [healthNodes, setHealthNodes] = useState([])

  // Node failure and recovery events
  const [events, setEvents] = useState([])
  const [eventsError, setEventsError] = useState('')

  // Real-time alert information
  const [liveAlert, setLiveAlert] = useState(null)

  // Remember the last processed event ID
  const lastSeenEventId = useRef(null)

  // Selected node for metrics and commands
  const [selectedNode, setSelectedNode] = useState(DEFAULT_NODE)

  const [selectedCommand, setSelectedCommand] = useState('uptime')
  const [commands, setCommands] = useState([])
  const [commandLoading, setCommandLoading] = useState(false)
  const [commandMessage, setCommandMessage] = useState('')
  const [commandError, setCommandError] = useState('')

  // Load metrics from backend
  const loadMetrics = useCallback(async (isActive = () => true) => {
    try {
      const response = await fetch(API_URL, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Backend returned HTTP ${response.status}`)
      }

      const data = await response.json()

      const records = Array.isArray(data.value)
        ? data.value
        : Array.isArray(data)
          ? data
          : []

      if (isActive()) {
        setMetrics(records)
        setError('')
        setLastUpdated(new Date())
      }
    } catch (err) {
      console.error('Metrics loading error:', err)

      if (isActive()) {
        setError(err.message || 'Unable to connect to the backend')
      }
    } finally {
      if (isActive()) {
        setLoading(false)
      }
    }
  }, [])

  // Load health information for ALL registered nodes
  const loadNodeHealth = useCallback(async (isActive = () => true) => {
    try {
      const response = await fetch(HEALTH_URL, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Health check failed')
      }

      const data = await response.json()

      const nodes = Array.isArray(data.nodes) ? data.nodes : []

      if (isActive()) {
        setHealthNodes(nodes)
      }
    } catch (err) {
      console.error('Node health error:', err)

      if (isActive()) {
        setHealthNodes([])
      }
    }
  }, [])

  // Load failure and recovery history and detect new events
  const loadEvents = useCallback(async (isActive = () => true) => {
    try {
      const response = await fetch(EVENTS_URL, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Events API returned HTTP ${response.status}`)
      }

      const data = await response.json()

      const rows = Array.isArray(data.events) ? data.events : []

      if (isActive()) {
        setEvents(rows)
        setEventsError('')

        // Backend returns newest events first
        const newestEvent = rows[0]

        if (newestEvent) {
          const newestId = Number(newestEvent.id)

          if (Number.isFinite(newestId)) {
            // First load establishes a baseline.
            // Old events will not appear as new alerts.
            if (lastSeenEventId.current === null) {
              lastSeenEventId.current = newestId
            } else if (newestId > lastSeenEventId.current) {
              // Find the newest event that has not been processed.
              const newEvent = rows.find(
                (event) =>
                  Number(event.id) > lastSeenEventId.current
              )

              lastSeenEventId.current = newestId

              if (newEvent) {
                setLiveAlert(newEvent)
              }
            }
          }
        } else if (lastSeenEventId.current === null) {
          lastSeenEventId.current = 0
        }
      }
    } catch (err) {
      console.error('Event history loading error:', err)

      if (isActive()) {
        setEventsError(
          err.message || 'Unable to load node event history'
        )
      }
    }
  }, [])

  // Load command history for the selected node
  const loadCommands = useCallback(async () => {
    try {
      const response = await fetch(
        `${COMMANDS_URL}?node=${encodeURIComponent(selectedNode)}`,
        {
          cache: 'no-store',
        }
      )

      if (!response.ok) {
        throw new Error(`Backend returned HTTP ${response.status}`)
      }

      const data = await response.json()

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data.commands)
          ? data.commands
          : []

      setCommands(rows)
      setCommandError('')
    } catch (err) {
      console.error('Command loading error:', err)

      setCommandError(
        'Command history could not be loaded. Check the backend GET /commands endpoint.'
      )
    }
  }, [selectedNode])

  // Automatic metrics, health and event history refresh
  useEffect(() => {
    let active = true

    const isActive = () => active

    loadMetrics(isActive)
    loadNodeHealth(isActive)
    loadEvents(isActive)

    const metricsInterval = setInterval(() => {
      loadMetrics(isActive)
    }, REFRESH_INTERVAL)

    const healthInterval = setInterval(() => {
      loadNodeHealth(isActive)
    }, REFRESH_INTERVAL)

    const eventsInterval = setInterval(() => {
      loadEvents(isActive)
    }, REFRESH_INTERVAL)

    return () => {
      active = false
      clearInterval(metricsInterval)
      clearInterval(healthInterval)
      clearInterval(eventsInterval)
    }
  }, [loadMetrics, loadNodeHealth, loadEvents])

  // Automatic command history refresh
  useEffect(() => {
    let active = true

    const refreshCommands = async () => {
      if (active) {
        await loadCommands()
      }
    }

    refreshCommands()

    const intervalId = setInterval(refreshCommands, 3000)

    return () => {
      active = false
      clearInterval(intervalId)
    }
  }, [loadCommands])

  // Execute approved remote command on selected node
  async function executeCommand() {
    if (!nodeOnline) {
      setCommandMessage('')
      setCommandError(
        `${selectedNode} is offline. Cannot execute commands.`
      )
      return
    }

    setCommandLoading(true)
    setCommandError('')
    setCommandMessage('')

    try {
      const response = await fetch(COMMANDS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          node: selectedNode,
          command: selectedCommand,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not queue command')
      }

      setCommandMessage(
        `Command #${data.id} queued for ${selectedNode}. Waiting for the Linux agent…`
      )

      await loadCommands()
    } catch (err) {
      setCommandError(err.message || 'Command request failed')
    } finally {
      setCommandLoading(false)
    }
  }

  function openGrafana() {
    window.open(GRAFANA_URL, '_blank', 'noopener,noreferrer')
  }

  // Metrics belonging to the selected node
  const selectedMetrics = metrics.filter(
    (record) => record.node === selectedNode
  )

  // Latest metric record for selected node
  const latest = selectedMetrics[0]

  // Health information for selected node
  const selectedHealth = healthNodes.find(
    (node) => node.node === selectedNode
  )

  const nodeOnline = selectedHealth?.status === 'online'

  // Execute button is enabled only when the selected node is online
  const canExecuteCommand = nodeOnline && !commandLoading

  const cpu = latest ? Number(latest.cpu) : NaN

  const ramPercent = latest
    ? getPercent(latest.ram_used, latest.ram_total)
    : 0

  const diskPercent = latest
    ? getPercent(latest.disk_used, latest.disk_total)
    : 0

  const completedCount = commands.filter(
    (item) =>
      String(item.status).toLowerCase() === 'completed'
  ).length

  const pendingCount = commands.filter((item) =>
    ['pending', 'running'].includes(
      String(item.status).toLowerCase()
    )
  ).length

  const memoryValue = latest
    ? formatValue(ramPercent)
    : '—'

  const diskValue = latest
    ? formatValue(diskPercent)
    : '—'

  const cpuValue = Number.isFinite(cpu)
    ? formatValue(cpu)
    : '—'

  return (
    <main className="app-shell">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          aria-label="System overview"
        >
          <div className="brand-logo">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <path d="M8 28V12h7l5 8 5-8h7v16h-6V20l-6 9-6-9v8z" />
            </svg>
          </div>

          <div className="brand-copy">
            <strong>Naitra</strong>
            <small>LINUX OPERATIONS</small>
          </div>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#overview">
            <span className="nav-icon">◫</span>
            Overview
            <span className="nav-active-mark" />
          </a>

          <a className="nav-link" href="#node-health">
            <span className="nav-icon">◎</span>
            Nodes
          </a>

          <a className="nav-link" href="#resource-history">
            <span className="nav-icon">⌁</span>
            Metrics
          </a>

          <a className="nav-link" href="#failure-history">
            <span className="nav-icon">↻</span>
            Failure History
          </a>

          <a className="nav-link" href="#remote-commands">
            <span className="nav-icon">›_</span>
            Commands
          </a>
        </nav>

        <div className="sidebar-node">
          <div className="sidebar-label">MONITORED NODE</div>

          <div className="sidebar-node-card">
            <div className="node-mini-icon">⌘</div>

            <div className="sidebar-node-copy">
              <strong>{selectedNode}</strong>

              <span>
                <i className={nodeOnline ? 'online-dot' : 'offline-dot'} />
                {nodeOnline ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="backend-status">
            <span className={error ? 'offline-dot' : 'online-dot'} />

            <div>
              <strong>
                {error ? 'Backend unavailable' : 'Backend monitor'}
              </strong>
              <small>localhost:8000</small>
            </div>
          </div>

          <div className="sidebar-version">
            <span className="version-indicator" />
            NAITRA <span>·</span> DEV BUILD
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <section className="main-area" id="overview">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            
            
            <strong>Overview</strong>
          </div>

          <div className="topbar-actions">
            <div className="connection-pill">
              <span className={nodeOnline ? 'online-dot' : 'offline-dot'} />
              {nodeOnline ? 'System operational' : 'Awaiting telemetry'}
            </div>

            <div className="topbar-divider" />
            <div className="user-avatar">SD</div>
          </div>
        </header>

        <div className="page-content">

          {/* PAGE HEADING */}
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                
                INFRASTRUCTURE MONITORING
              </div>

              <h1>
                System overview<span className="heading-period">.</span>
              </h1>

              <p>
                Real-time visibility into your Linux infrastructure.
              </p>
            </div>

            <div className="page-heading-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={openGrafana}
              >
                <span aria-hidden="true">↗</span>
                Open Grafana Monitoring
              </button>

              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  loadMetrics()
                  loadNodeHealth()
                  loadEvents()
                  loadCommands()
                }}
              >
                <span className="button-refresh-icon">↻</span>
                Refresh data
              </button>
            </div>
          </section>

          {/* METRICS ERROR ALERT */}
          {error && (
            <div className="alert alert-error" role="alert">
              <span className="alert-icon">!</span>

              <div>
                <strong>Metrics connection issue</strong>
                <p>
                  {error}. Make sure the backend is running on port 8000.
                </p>
              </div>
            </div>
          )}

          {/* REAL-TIME NODE ALERTS */}
          {liveAlert && (
            <div
              className={`alert ${
                String(liveAlert.event_type).toUpperCase() === 'OFFLINE'
                  ? 'alert-error'
                  : 'alert-success'
              }`}
              role="alert"
            >
              <span className="alert-icon">
                {String(liveAlert.event_type).toUpperCase() === 'OFFLINE'
                  ? '!'
                  : '✓'}
              </span>

              <div style={{ flex: 1 }}>
                <strong>
                  {String(liveAlert.event_type).toUpperCase() === 'OFFLINE'
                    ? 'Node Offline Alert'
                    : 'Node Recovery Alert'}
                </strong>

                <p>
                  {liveAlert.node}{' '}
                  {String(liveAlert.event_type).toUpperCase() === 'OFFLINE'
                    ? 'has stopped responding.'
                    : 'is back online and communicating.'}
                </p>

                <small>
                  Event time: {formatEventTime(liveAlert.event_time)}
                </small>
              </div>

              <button
                type="button"
                onClick={() => setLiveAlert(null)}
                aria-label="Dismiss alert"
              >
                ×
              </button>
            </div>
          )}

          {/* SYSTEM SNAPSHOT */}
          <section className="section-block" id="node-health">
            <div className="section-heading">
              <div>
                <h2>System Report</h2>
                
                  
              </div>

              <div className="live-label">
                <span className="pulse-dot" />
                LIVE TELEMETRY
              </div>
            </div>

            <div className="metrics-grid">
              <MetricCard
                title="CPU UTILIZATION"
                value={cpuValue}
                unit="%"
                icon="⌁"
                tone="blue"
                percent={Number.isFinite(cpu) ? cpu : 0}
                detail="Processor usage"
              />

              <MetricCard
                title="MEMORY USAGE"
                value={memoryValue}
                unit="%"
                icon="▤"
                tone="violet"
                percent={ramPercent}
                detail={
                  latest
                    ? `${formatValue(latest.ram_used)} used · ${formatValue(latest.ram_total)} total`
                    : 'Waiting for memory data'
                }
              />

              <MetricCard
                title="DISK UTILIZATION"
                value={diskValue}
                unit="%"
                icon="▣"
                tone="cyan"
                percent={diskPercent}
                detail={
                  latest
                    ? `${formatValue(latest.disk_used)} used · ${formatValue(latest.disk_total)} total`
                    : 'Waiting for disk data'
                }
              />

              <MetricCard
                title="COMMANDS COMPLETED"
                value={String(completedCount)}
                unit=""
                icon="⌘"
                tone="green"
                percent={
                  commands.length
                    ? (completedCount / commands.length) * 100
                    : 0
                }
                detail={`${pendingCount} pending or running`}
              />
            </div>
          </section>

          {/* MULTI-NODE HEALTH */}
          <section className="section-block">
            <div className="section-heading">
              <div>
                <h2>Node health</h2>
                <p>
                  Connection state and latest telemetry received.
                </p>
              </div>

              <span className="subtle-label">
                {healthNodes.length} REGISTERED NODES
              </span>
            </div>

            <div className="node-list">
              {healthNodes.map((node) => {
                const nodeMetric = metrics.find(
                  (record) => record.node === node.node
                )

                const isSelected = selectedNode === node.node

                return (
                  <article
                    className="panel node-panel"
                    key={node.node}
                  >
                    <div className="node-panel-main">
                      <div className="node-large-icon">⌘</div>

                      <div className="node-panel-name">
                        <strong>{node.node}</strong>
                        <span>Linux · Metrics agent</span>
                      </div>
                    </div>

                    <div className="node-panel-stat">
                      <span>STATUS</span>
                      <StatusBadge status={node.status} />
                    </div>

                    <div className="node-panel-stat">
                      <span>CPU</span>
                      <strong>
                        {nodeMetric
                          ? `${formatValue(nodeMetric.cpu)}%`
                          : '—'}
                      </strong>
                    </div>

                    <div className="node-panel-stat">
                      <span>MEMORY</span>
                      <strong>
                        {nodeMetric
                          ? `${formatValue(
                              getPercent(
                                nodeMetric.ram_used,
                                nodeMetric.ram_total
                              )
                            )}%`
                          : '—'}
                      </strong>
                    </div>

                    <div className="node-panel-stat">
                      <span>LAST SEEN</span>
                      <strong className="node-time">
                        {formatTime(node.last_seen)}
                      </strong>
                    </div>

                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setSelectedNode(node.node)}
                    >
                      {isSelected ? 'Selected' : 'Monitor node'}
                    </button>
                  </article>
                )
              })}

              {healthNodes.length === 0 && (
                <p>
                  {loading
                    ? 'Loading registered nodes…'
                    : 'No node health information available.'}
                </p>
              )}
            </div>
          </section>

          {/* NODE FAILURE AND RECOVERY HISTORY */}
          <section className="section-block" id="failure-history">
            <div className="section-heading">
              <div>
                <h2>Node failure & recovery history</h2>
                <p>
                  Recorded node disconnections and successful recoveries.
                </p>
              </div>

              <span className="subtle-label">
                {events.length} RECORDED EVENTS
              </span>
            </div>

            {eventsError && (
              <div className="alert alert-error" role="alert">
                <span className="alert-icon">!</span>
                <p>{eventsError}</p>
              </div>
            )}

            <article className="panel table-panel">
              <div className="table-scroll">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>NODE</th>
                      <th>EVENT</th>
                      <th>DATE & TIME</th>
                    </tr>
                  </thead>

                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <div className="table-node-name">
                            <span className="table-node-icon">⌘</span>
                            <strong>{event.node}</strong>
                          </div>
                        </td>

                        <td>
                          <StatusBadge
                            status={
                              String(event.event_type || 'unknown').toLowerCase()
                            }
                          />
                        </td>

                        <td>
                          {formatEventTime(event.event_time)}
                        </td>
                      </tr>
                    ))}

                    {events.length === 0 && (
                      <tr>
                        <td colSpan="3" className="table-empty">
                          {eventsError
                            ? 'Event history is currently unavailable.'
                            : 'No failure or recovery events recorded yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>
                  <span className="status-dot status-dot-blue" />
                  Data from backend /events API
                </span>

                <span>Auto-refresh · 5 sec</span>
              </div>
            </article>
          </section>

          {/* RESOURCE HISTORY */}
          <section className="section-block" id="resource-history">
            <div className="section-heading">
              <div>
                <h2>Resource performance</h2>
                <p>
                  Recent CPU and RAM utilization samples for {selectedNode}.
                </p>
              </div>

              <span className="subtle-label">
                AUTO-REFRESH · 5 SEC
              </span>
            </div>

            <div className="history-grid">
              <HistoryChart
                title="CPU utilization"
                subtitle="Processor load over time"
                records={selectedMetrics}
                getValue={(record) => record.cpu}
                color="#5798ff"
              />

              <HistoryChart
                title="Memory utilization"
                subtitle="RAM usage over time"
                records={selectedMetrics}
                getValue={(record) =>
                  getPercent(record.ram_used, record.ram_total)
                }
                color="#a18bff"
              />
            </div>
          </section>

          {/* REMOTE COMMANDS */}
          <section className="section-block" id="remote-commands">
            <div className="section-heading">
              <div>
                <h2>Remote command execution</h2>
                <p>
                  Queue an approved diagnostic command on {selectedNode}.
                </p>
              </div>

              <span className="subtle-label">
                CONTROLLED EXECUTION
              </span>
            </div>

            <article className="panel terminal-panel">
              <div className="terminal-topbar">
                <div className="terminal-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>

                <span className="terminal-title">
                  root@{selectedNode}: ~
                </span>

                <span className="terminal-tag">
                  COMMAND CONSOLE
                </span>
              </div>

              <div className="terminal-body">
                <div className="terminal-prompt">
                  <span>somya@Naitra</span>
                  <span className="terminal-path">:~$</span>
                  <span className="terminal-hint">
                    Select a diagnostic command
                  </span>
                </div>

                <div className="command-controls">
                  <div className="command-select-wrap">
                    <label htmlFor="command-select">
                      APPROVED COMMAND
                    </label>

                    <select
                      id="command-select"
                      value={selectedCommand}
                      onChange={(event) =>
                        setSelectedCommand(event.target.value)
                      }
                      disabled={commandLoading}
                    >
                      {APPROVED_COMMANDS.map((command) => (
                        <option
                          key={command.value}
                          value={command.value}
                        >
                          {command.value} — {command.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="button button-primary execute-button"
                    onClick={executeCommand}
                    disabled={!canExecuteCommand}
                    title={
                      !nodeOnline
                        ? 'Selected node is offline'
                        : 'Execute approved command'
                    }
                  >
                    {commandLoading
                      ? 'Queuing…'
                      : !nodeOnline
                        ? 'Node Offline'
                        : '▶  Execute command'}
                  </button>
                </div>

                {!nodeOnline && (
                  <p className="metric-detail">
                    Commands are disabled because {selectedNode} is offline
                    or its health status is not yet available.
                  </p>
                )}

                {commandMessage && (
                  <div className="alert alert-success" role="status">
                    <span className="alert-icon">✓</span>
                    <p>{commandMessage}</p>
                  </div>
                )}

                {commandError && (
                  <div className="alert alert-error" role="alert">
                    <span className="alert-icon">!</span>
                    <p>{commandError}</p>
                  </div>
                )}

                <div className="command-history-heading">
                  <h3>Execution history</h3>
                  <span>{commands.length} recent commands</span>
                </div>

                {commands.length === 0 ? (
                  <div className="command-empty">
                    <span>$_</span>
                    <p>No commands found.</p>
                    <small>
                      Execute a diagnostic command to see its status and output
                      here.
                    </small>
                  </div>
                ) : (
                  <div className="command-list">
                    {commands.map((item) => (
                      <article
                        className="command-item"
                        key={item.id}
                      >
                        <div className="command-item-top">
                          <div className="command-item-name">
                            <span className="command-symbol">›_</span>

                            <div>
                              <strong>{item.command}</strong>

                              <small>
                                #{item.id} · {item.node || selectedNode}
                                {item.created_at
                                  ? ` · ${item.created_at}`
                                  : ''}
                              </small>
                            </div>
                          </div>

                          <StatusBadge status={item.status} />
                        </div>

                        {item.output && (
                          <pre className="command-output">
                            <span className="output-prefix">$ </span>
                            {item.output}
                          </pre>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </article>
          </section>

          {/* RECENT TELEMETRY */}
          <section className="section-block records-section">
            <div className="section-heading">
              <div>
                <h2>Recent telemetry</h2>
                <p>
                  Latest metrics received from all Linux agents.
                </p>
              </div>

              <span className="subtle-label">
                {metrics.length} RECORDS
              </span>
            </div>

            <article className="panel table-panel">
              <div className="table-scroll">
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>NODE</th>
                      <th>CPU</th>
                      <th>RAM USED</th>
                      <th>RAM TOTAL</th>
                      <th>DISK USED</th>
                      <th>DISK TOTAL</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {metrics.slice(0, 10).map((record, index) => {
                      const recordHealth = healthNodes.find(
                        (node) => node.node === record.node
                      )

                      return (
                        <tr
                          key={
                            record.id ??
                            `${record.timestamp || 'metric'}-${index}`
                          }
                        >
                          <td>
                            <div className="table-node-name">
                              <span className="table-node-icon">⌘</span>
                              <strong>{record.node}</strong>
                            </div>
                          </td>

                          <td>
                            <span className="table-number">
                              {formatValue(record.cpu)}%
                            </span>
                          </td>

                          <td>{formatValue(record.ram_used)}</td>
                          <td>{formatValue(record.ram_total)}</td>
                          <td>{formatValue(record.disk_used)}</td>
                          <td>{formatValue(record.disk_total)}</td>

                          <td>
                            <StatusBadge
                              status={recordHealth?.status || 'unknown'}
                            />
                          </td>
                        </tr>
                      )
                    })}

                    {metrics.length === 0 && (
                      <tr>
                        <td colSpan="7" className="table-empty">
                          {loading
                            ? 'Loading telemetry…'
                            : 'No metrics available. Check the Linux agent and backend.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                
                  <span className="status-dot status-dot-blue" />
                
                

                <span>Showing latest 10 records</span>
              </div>
            </article>
          </section>

          {/* FOOTER */}
          <footer className="page-footer">
            <span>
              Naitra <span>/</span> LINUX FLEET MANAGEMENT
            </span>

            <span>
              Last refreshed:{' '}
              {lastUpdated ? formatTime(lastUpdated) : '—'}
            </span>
          </footer>

        </div>
      </section>
    </main>
  )
}

export default App
