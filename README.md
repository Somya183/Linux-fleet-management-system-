# FleetWatch – Web-Based Linux Fleet Management System

FleetWatch is a web-based Linux fleet management system designed to monitor and manage Linux machines from a centralized dashboard. It collects system resource information, displays node health, and supports controlled remote command execution.

## Key Features

- **Centralized Dashboard:** View Linux node information from a React-based web interface.
- **System Monitoring:** Track CPU, RAM, and disk usage.
- **Node Health Monitoring:** Monitor node availability and identify offline nodes.
- **Remote Command Execution:** Send approved commands to the Linux agent and view their execution results.
- **Monitoring and Visualization:** Use Prometheus and Grafana for system monitoring and visualization.
- **Data Storage:** Store collected metrics and related information using SQLite.
- **Python Agent:** Collect system metrics from the Linux machine and communicate with the backend.

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React 19, Vite |
| Backend | Node.js, Express.js |
| Database | SQLite, better-sqlite3 |
| Linux Agent | Python |
| Monitoring | Prometheus, Grafana |
| Operating System | Ubuntu Linux, Windows host |

## Project Architecture

The system consists of three main components:

1. **Frontend:** Displays system metrics, node status, and command information.
2. **Backend:** Provides APIs, processes incoming metrics, manages commands, and stores data in SQLite.
3. **Linux Agent:** Runs on the monitored Linux machine, collects system information, communicates with the backend, and handles approved commands.

## Project Directory Structure

```text
linux-fleet-management-system/
│
├── docs/
│   ├── architecture.md
│   ├── api-documentation.md
│   ├── testing.md
│   └── screenshots/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── server.js
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
```

The Python agent runs separately on the monitored Ubuntu machine.

## Prerequisites

Install the following before running the project:

- Node.js and npm
- Python 3
- Ubuntu Linux machine or virtual machine
- Prometheus and Grafana (for monitoring visualization)

## Installation and Setup

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd linux-fleet-management-system
```

### 2. Install Backend Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root and configure the required environment variables, including the agent authentication token.

Do not upload your actual `.env` file or authentication token to GitHub.

### 4. Start the Backend

```bash
npm start
```

The backend runs on:

```text
http://localhost:8000
```

### 5. Install Frontend Dependencies

Open another terminal:

```bash
cd frontend
npm install
```

### 6. Start the Frontend

```bash
npm run dev
```

The frontend development server runs at:

```text
http://localhost:5176
```

Use the local URL displayed by Vite if the port changes.

### 7. Configure the Linux Agent

Run the Python agent on the Ubuntu machine. Configure it to communicate with the backend host and use the matching authentication token.

The agent collects system metrics and communicates with the backend for metric reporting and command handling.

## Monitoring

FleetWatch uses Prometheus and Grafana as its monitoring stack.

- **Prometheus:** Collects and stores monitoring metrics from configured targets.
- **Grafana:** Provides dashboards and visual representations of monitoring data.
- **Node Exporter:** Exposes Linux system metrics for Prometheus to collect.

## Security Considerations

- Agent communication uses token-based authentication.
- Only approved commands should be permitted for remote execution.
- Do not expose authentication tokens or `.env` files publicly.
- Avoid committing database files, backups, or generated dependencies to the repository.

## Future Enhancements

- Support for multiple Linux nodes.
- Improved alerting and notification mechanisms.
- Enhanced historical metrics and reporting.
- Role-based access control.
- More detailed monitoring dashboards.

## Author

Somya Dubey

