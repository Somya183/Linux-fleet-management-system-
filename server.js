
require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const PORT = 8000;
const OFFLINE_THRESHOLD_SECONDS = 15;
const STATUS_CHECK_INTERVAL_MS = 5000;

const AGENT_TOKEN = process.env.AGENT_TOKEN;

if (!AGENT_TOKEN) {
    throw new Error("AGENT_TOKEN environment variable is required");
}

// Authentication
function requireAgentToken(req, res, next) {
    const receivedToken = req.get("authorization") || "";
    const expectedToken = `Bearer ${AGENT_TOKEN}`;

    const received = Buffer.from(receivedToken);
    const expected = Buffer.from(expectedToken);

    if (
        received.length !== expected.length ||
        !crypto.timingSafeEqual(received, expected)
    ) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
}

const app = express();

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5176");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

app.use(express.json());

const db = new Database("fleet.db");

// --------------------------------------------------
// DATABASE TABLES
// --------------------------------------------------

db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
        name TEXT PRIMARY KEY,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node TEXT NOT NULL,
        cpu REAL,
        ram_used REAL,
        ram_total REAL,
        disk_used REAL,
        disk_total REAL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS remote_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node TEXT NOT NULL,
        command TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        output TEXT,
        created_at TEXT DEFAULT (
            datetime('now', '+5 hours', '+30 minutes')
        ),
        completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS node_status (
        node TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'unknown',
        updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS node_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node TEXT NOT NULL,
        event_type TEXT NOT NULL
            CHECK (event_type IN ('OFFLINE', 'ONLINE')),
        event_time TEXT NOT NULL DEFAULT (
            datetime('now', '+5 hours', '+30 minutes')
        )
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_node_id
    ON metrics(node, id);

    CREATE INDEX IF NOT EXISTS idx_node_events_node_id
    ON node_events(node, id);
`);

// Register default node
db.prepare(`
    INSERT OR IGNORE INTO nodes (name)
    VALUES (?)
`).run("linux-node-1");

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function isRegisteredNode(node) {
    if (typeof node !== "string" || !node.trim()) {
        return false;
    }

    return Boolean(
        db.prepare(
            "SELECT name FROM nodes WHERE name = ?"
        ).get(node)
    );
}

function isNodeOnline(node) {
    const result = db.prepare(`
        SELECT EXISTS (
            SELECT 1
            FROM metrics
            WHERE node = ?
            AND id = (
                SELECT MAX(id)
                FROM metrics
                WHERE node = ?
            )
            AND timestamp >= datetime(
                'now',
                '+5 hours',
                '+30 minutes',
                '-15 seconds'
            )
        ) AS online
    `).get(node, node);

    return result.online === 1;
}

function failPendingCommands(node) {
    db.prepare(`
        UPDATE remote_commands
        SET
            status = 'failed',
            output = 'Command not executed: node is offline.',
            completed_at = datetime(
                'now', '+5 hours', '+30 minutes'
            )
        WHERE node = ?
        AND status = 'pending'
    `).run(node);
}

// --------------------------------------------------
// NODE FAILURE AND RECOVERY HISTORY
// --------------------------------------------------

// Update status and record only actual status changes
const updateNodeStatusTransaction = db.transaction(
    (node, newStatus) => {
        const previous = db.prepare(`
            SELECT status
            FROM node_status
            WHERE node = ?
        `).get(node);

        const previousStatus = previous
            ? previous.status
            : "unknown";

        db.prepare(`
            INSERT INTO node_status (node, status, updated_at)
            VALUES (
                ?,
                ?,
                datetime('now', '+5 hours', '+30 minutes')
            )
            ON CONFLICT(node)
            DO UPDATE SET
                status = excluded.status,
                updated_at = excluded.updated_at
        `).run(node, newStatus);

        // Record only transitions to ONLINE or OFFLINE.
        // Do not create events for UNKNOWN.
        if (
            previousStatus !== newStatus &&
            ["ONLINE", "OFFLINE"].includes(newStatus.toUpperCase())
        ) {
            db.prepare(`
                INSERT INTO node_events (node, event_type)
                VALUES (?, ?)
            `).run(node, newStatus.toUpperCase());

            console.log(
                `Node event recorded: ${node} -> ${newStatus.toUpperCase()}`
            );
        }
    }
);

// Check one node's latest heartbeat
function checkNodeStatus(node) {
    const latestMetric = db.prepare(`
        SELECT timestamp
        FROM metrics
        WHERE node = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(node);

    if (!latestMetric) {
        updateNodeStatusTransaction(node, "unknown");
        return;
    }

    const online = isNodeOnline(node);
    const newStatus = online ? "online" : "offline";

    updateNodeStatusTransaction(node, newStatus);

    if (!online) {
        failPendingCommands(node);
    }
}

// Check every registered node
function checkAllNodes() {
    try {
        const nodes = db.prepare(`
            SELECT name
            FROM nodes
            ORDER BY name
        `).all();

        for (const node of nodes) {
            checkNodeStatus(node.name);
        }
    } catch (error) {
        console.error("Node monitoring error:", error);
    }
}

// Initialize existing node states on backend startup.
// This avoids creating false events just because the backend restarted.
function initializeNodeStatuses() {
    const nodes = db.prepare(`
        SELECT name
        FROM nodes
    `).all();

    for (const node of nodes) {
        const latestMetric = db.prepare(`
            SELECT timestamp
            FROM metrics
            WHERE node = ?
            ORDER BY id DESC
            LIMIT 1
        `).get(node.name);

        let status = "unknown";

        if (latestMetric) {
            status = isNodeOnline(node.name)
                ? "online"
                : "offline";
        }

        db.prepare(`
            INSERT INTO node_status (node, status, updated_at)
            VALUES (
                ?,
                ?,
                datetime('now', '+5 hours', '+30 minutes')
            )
            ON CONFLICT(node)
            DO UPDATE SET
                status = excluded.status,
                updated_at = excluded.updated_at
        `).run(node.name, status);
    }
}

initializeNodeStatuses();

// --------------------------------------------------
// HOME
// --------------------------------------------------

app.get("/", (req, res) => {
    res.send("Linux Fleet Manager Backend is running");
});

// --------------------------------------------------
// NODE REGISTRATION
// --------------------------------------------------

app.get("/nodes", (req, res) => {
    try {
        const nodes = db.prepare(`
            SELECT name, created_at
            FROM nodes
            ORDER BY name
        `).all();

        res.json(nodes);
    } catch (error) {
        console.error("Node list error:", error);

        res.status(500).json({
            error: "Failed to retrieve nodes"
        });
    }
});

app.post("/nodes", (req, res) => {
    try {
        const { name } = req.body;

        if (
            typeof name !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)
        ) {
            return res.status(400).json({
                error: "Invalid node name"
            });
        }

        const result = db.prepare(`
            INSERT OR IGNORE INTO nodes (name)
            VALUES (?)
        `).run(name);

        res.status(result.changes ? 201 : 200).json({
            message: result.changes
                ? "Node registered successfully"
                : "Node already registered",
            name
        });
    } catch (error) {
        console.error("Node registration error:", error);

        res.status(500).json({
            error: "Failed to register node"
        });
    }
});

// --------------------------------------------------
// RECEIVE METRICS
// --------------------------------------------------

app.post("/metrics", requireAgentToken, (req, res) => {
    try {
        const {
            node,
            cpu,
            ram_used,
            ram_total,
            disk_used,
            disk_total
        } = req.body;

        if (!isRegisteredNode(node)) {
            return res.status(400).json({
                error: "Unknown node. Register it first."
            });
        }

        const values = [
            cpu,
            ram_used,
            ram_total,
            disk_used,
            disk_total
        ];

        if (
            !values.every(value =>
                typeof value === "number" &&
                Number.isFinite(value)
            )
        ) {
            return res.status(400).json({
                error: "Metric values must be valid numbers"
            });
        }

        const result = db.prepare(`
            INSERT INTO metrics (
                node,
                cpu,
                ram_used,
                ram_total,
                disk_used,
                disk_total,
                timestamp
            )
            VALUES (
                ?, ?, ?, ?, ?, ?,
                datetime('now', '+5 hours', '+30 minutes')
            )
        `).run(
            node,
            cpu,
            ram_used,
            ram_total,
            disk_used,
            disk_total
        );

        console.log("Metrics saved for:", node);

        res.status(201).json({
            message: "Metrics received and saved successfully",
            id: result.lastInsertRowid
        });
    } catch (error) {
        console.error("Metrics database error:", error);

        res.status(500).json({
            error: "Failed to save metrics"
        });
    }
});

// --------------------------------------------------
// RETRIEVE METRICS
// --------------------------------------------------

app.get("/metrics", (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT *
            FROM metrics
            ORDER BY id DESC
            LIMIT 50
        `).all();

        res.json(rows);
    } catch (error) {
        console.error("Metrics retrieval error:", error);

        res.status(500).json({
            error: "Failed to retrieve metrics"
        });
    }
});

// --------------------------------------------------
// NODE HEALTH
// --------------------------------------------------

app.get("/health", (req, res) => {
    try {
        checkAllNodes();

        const rows = db.prepare(`
            SELECT
                n.name AS node,
                m.timestamp AS last_seen,
                COALESCE(s.status, 'unknown') AS status
            FROM nodes n

            LEFT JOIN (
                SELECT node, MAX(id) AS latest_id
                FROM metrics
                GROUP BY node
            ) latest
            ON n.name = latest.node

            LEFT JOIN metrics m
            ON m.id = latest.latest_id

            LEFT JOIN node_status s
            ON n.name = s.node

            ORDER BY n.name
        `).all();

        res.json({
            threshold_seconds: OFFLINE_THRESHOLD_SECONDS,
            nodes: rows
        });
    } catch (error) {
        console.error("Health check error:", error);

        res.status(500).json({
            error: "Failed to check node health"
        });
    }
});

// --------------------------------------------------
// NODE EVENT HISTORY
// --------------------------------------------------

app.get("/events", (req, res) => {
    try {
        const node = req.query.node;

        if (node !== undefined && !isRegisteredNode(node)) {
            return res.status(400).json({
                error: "Unknown node"
            });
        }

        let events;

        if (node) {
            events = db.prepare(`
                SELECT id, node, event_type, event_time
                FROM node_events
                WHERE node = ?
                ORDER BY id DESC
                LIMIT 100
            `).all(node);
        } else {
            events = db.prepare(`
                SELECT id, node, event_type, event_time
                FROM node_events
                ORDER BY id DESC
                LIMIT 100
            `).all();
        }

        res.json({
            count: events.length,
            events
        });
    } catch (error) {
        console.error("Event history error:", error);

        res.status(500).json({
            error: "Failed to retrieve node events"
        });
    }
});

// --------------------------------------------------
// QUEUE REMOTE COMMAND
// --------------------------------------------------

app.post("/commands", (req, res) => {
    try {
        const { node, command } = req.body;

        const allowedCommands = [
            "uptime",
            "free -h",
            "df -h"
        ];

        if (
            typeof node !== "string" ||
            typeof command !== "string"
        ) {
            return res.status(400).json({
                error: "Node and command are required"
            });
        }

        if (!isRegisteredNode(node)) {
            return res.status(400).json({
                error: "Unknown node"
            });
        }

        if (!allowedCommands.includes(command)) {
            return res.status(400).json({
                error: "Command is not allowed"
            });
        }

        if (!isNodeOnline(node)) {
            failPendingCommands(node);

            return res.status(409).json({
                error: `${node} is offline. Command was not queued.`
            });
        }

        const result = db.prepare(`
            INSERT INTO remote_commands (node, command)
            VALUES (?, ?)
        `).run(node, command);

        res.status(201).json({
            message: "Command queued successfully",
            id: result.lastInsertRowid,
            node,
            command,
            status: "pending"
        });
    } catch (error) {
        console.error("Command creation error:", error);

        res.status(500).json({
            error: "Failed to queue command"
        });
    }
});

// --------------------------------------------------
// AGENT POLLS PENDING COMMANDS
// --------------------------------------------------

app.get("/commands/pending", requireAgentToken, (req, res) => {
    try {
        const node = req.query.node;

        if (!isRegisteredNode(node)) {
            return res.status(400).json({
                error: "Unknown node"
            });
        }

        if (!isNodeOnline(node)) {
            failPendingCommands(node);

            return res.json({
                command: null
            });
        }

        const command = db.prepare(`
            SELECT id, node, command
            FROM remote_commands
            WHERE node = ?
            AND status = 'pending'
            ORDER BY id ASC
            LIMIT 1
        `).get(node);

        if (!command) {
            return res.json({
                command: null
            });
        }

        const result = db.prepare(`
            UPDATE remote_commands
            SET status = 'running'
            WHERE id = ?
            AND status = 'pending'
        `).run(command.id);

        if (result.changes === 0) {
            return res.json({
                command: null
            });
        }

        res.json({ command });
    } catch (error) {
        console.error("Pending command error:", error);

        res.status(500).json({
            error: "Failed to fetch pending command"
        });
    }
});

// --------------------------------------------------
// AGENT SUBMITS COMMAND RESULT
// --------------------------------------------------

app.post("/commands/:id/result", requireAgentToken, (req, res) => {
    try {
        const id = Number(req.params.id);
        const { status, output } = req.body;

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Invalid command ID"
            });
        }

        if (!["completed", "failed"].includes(status)) {
            return res.status(400).json({
                error: "Invalid command status"
            });
        }

        if (typeof output !== "string") {
            return res.status(400).json({
                error: "Output must be a string"
            });
        }

        const result = db.prepare(`
            UPDATE remote_commands
            SET
                status = ?,
                output = ?,
                completed_at = datetime(
                    'now', '+5 hours', '+30 minutes'
                )
            WHERE id = ?
            AND status = 'running'
        `).run(
            status,
            output.slice(0, 10000),
            id
        );

        if (result.changes === 0) {
            return res.status(404).json({
                error: "Running command not found"
            });
        }

        res.json({
            message: "Command result saved",
            id,
            status
        });
    } catch (error) {
        console.error("Command result error:", error);

        res.status(500).json({
            error: "Failed to save command result"
        });
    }
});

// --------------------------------------------------
// COMMAND HISTORY
// --------------------------------------------------

app.get("/commands", (req, res) => {
    try {
        const node = req.query.node;

        if (!isRegisteredNode(node)) {
            return res.status(400).json({
                error: "Unknown node"
            });
        }

        const commands = db.prepare(`
            SELECT
                id,
                node,
                command,
                status,
                output,
                created_at,
                completed_at
            FROM remote_commands
            WHERE node = ?
            ORDER BY id DESC
            LIMIT 10
        `).all(node);

        res.json(commands);
    } catch (error) {
        console.error("Command history error:", error);

        res.status(500).json({
            error: "Failed to retrieve commands"
        });
    }
});

// --------------------------------------------------
// START SERVER AND AUTOMATIC MONITORING
// --------------------------------------------------

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fleet Manager Backend running on port ${PORT}`);
    console.log(
        `Node monitoring active: every ${STATUS_CHECK_INTERVAL_MS / 1000} seconds`
    );
    console.log(
        `Offline threshold: ${OFFLINE_THRESHOLD_SECONDS} seconds`
    );
});

// Check node status every five seconds
const monitoringInterval = setInterval(
    checkAllNodes,
    STATUS_CHECK_INTERVAL_MS
);

// Graceful shutdown
function shutdown() {
    console.log("Shutting down Fleet Manager Backend...");

    clearInterval(monitoringInterval);

    server.close(() => {
        db.close();
        console.log("Backend stopped and database closed.");
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
