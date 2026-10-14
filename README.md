# 🛡️ Multi-Purpose Tourist Safety Monitoring and Incident Response System

> **Using AI · GRU Autoencoder · Geo-Fencing · Blockchain Technology**

An end-to-end, real-time tourist safety platform that continuously profiles GPS trajectories, detects movement anomalies with a deep learning GRU Autoencoder, enforces dynamic geo-fenced perimeters, evaluates incidents with multi-model LLM reasoning, and immutably records all breach events on the Ethereum blockchain.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Monorepo Structure](#-monorepo-structure)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Environment Configuration](#-environment-configuration)
  - [Backend `.env`](#backend-env)
  - [Frontend `.env`](#frontend-env)
- [Database Setup](#-database-setup)
- [Installation & Setup](#-installation--setup)
  - [Backend](#backend-setup)
  - [Frontend](#frontend-setup)
- [Running the Application](#-running-the-application)
- [API Reference](#-api-reference)
  - [Authentication & Account Management](#1-authentication--account-management)
  - [Monitoring & Anomaly Detection](#2-monitoring--anomaly-detection)
  - [Health & Diagnostics](#3-health--diagnostics)
- [Machine Learning & Detection Logic](#-machine-learning--detection-logic)
- [Frontend Intelligence](#-frontend-intelligence)
- [Blockchain Audit Logging](#-blockchain-audit-logging)
- [LLM Risk Reasoning Pipeline](#-llm-risk-reasoning-pipeline)
- [Authors](#-authors)

---

## 🔭 Overview

The **Tourist Safety Monitoring System** is designed to protect tourists navigating unfamiliar or hazardous territories through a tightly integrated full-stack pipeline:

1. **Continuous Trajectory Profiling** — The React frontend captures live GPS coordinates via the Web Geolocation API, smoothed through a **2D Geodetic Kalman Filter**, and streams them to the backend as 31-sample sliding windows.
2. **Deep Anomaly Reconstruction** — A **PyTorch GRU Autoencoder** reconstructs kinematic feature sequences (speed, acceleration, heading, stationary duration). High reconstruction error signals erratic or distress movement.
3. **Dynamic Geofence Incident Triage** — Users draw custom polygon or circular danger zones directly on the Mapbox vector map. The frontend auto-generates a +50 m caution buffer and employs a state-machine (`SAFE → CAUTION → DANGER`) to detect perimeter breaches without redundant server calls.
4. **LLM Decision Support** — On breach, a **LangChain + Groq multi-model fallback chain** generates a structured risk report (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) with recommended safety interventions.
5. **Decentralized Forensic Ledger** — Every breach event is SHA-256 hashed and broadcast as an Ethereum transaction via Alchemy RPC, creating a tamper-proof audit trail.

---

## ✨ Key Features

### Backend
- **Robust Authentication**: Argon2 password hashing, SMTP OTP email delivery, stateless JWT Bearer tokens, and ephemeral registration tables with auto-cleanup.
- **Spatial-Temporal Feature Engineering**: Vectorized Haversine distance, dynamic speed/acceleration/bearing calculations, and stationary state detection.
- **GRU Autoencoder Anomaly Detection**: Custom PyTorch neural network evaluating reconstruction MSE against a calibrated threshold (≈ 0.326157).
- **Multi-Zone Geofencing & Incident Auditing**: Real-time breach logging with coordinate capture.
- **Multi-Model LLM Fallback Pipeline**: Cascading failover across four Groq-hosted LLMs with strict JSON schema output.
- **Tamper-Proof Blockchain Logging**: SHA-256 digest broadcast to EVM chain via Alchemy RPC.
- **Automatic Storage Optimization**: SQL sliding-window retention capping location pings at 100 entries and anomaly reports at 20 entries per user.

### Frontend
- **2D Geodetic Kalman Filtering**: Accuracy-aware GPS smoothing using pedestrian kinematic process noise; strict 5-second sampling interval.
- **User-Drawn Geofences**: Polygon vertex placement or click-to-place circular danger zones with automated +50 m caution buffer generation.
- **Transition-Triggered Breach Detection**: State-machine suppresses duplicate pings; fires only on zone-boundary entry transitions.
- **Structured AI Incident Cards**: Color-coded risk badges, threat-level progress bar, natural language condition assessment, and actionable emergency protocols.
- **31-Sample Trajectory Memory Buffer**: Sliding window of Kalman-smoothed points streamed chronologically to the GRU model.
- **Interactive Vector Map**: Mapbox GL dark theme, trajectory polylines, perimeter legend, and a Google Maps-style recenter button.

---

## 🏗️ System Architecture

```text
       ┌─────────────────────────────────────────────────────────────┐
       │              React Frontend (TanStack Start)                │
       │   Kalman Filter · Geofence Drawing · State Machine UI       │
       └──────────────────────────┬──────────────────────────────────┘
                                  │ HTTPS / REST (JWT Bearer)
                                  ▼
       ┌─────────────────────────────────────────────────────────────┐
       │                    FastAPI Backend                          │
       │           (CORS Middleware, OAuth2 Bearer JWT)              │
       └──────┬──────────────────────┬───────────────────────┬───────┘
              │                      │                       │
              ▼                      ▼                       ▼
    ┌──────────────────┐  ┌─────────────────────┐  ┌──────────────────┐
    │  Auth & Session  │  │  Trajectory Stream  │  │ Geofence Breach  │
    │    Subsystem     │  │  (/location_data)   │  │ (/geofence_ping) │
    └────────┬─────────┘  └──────────┬──────────┘  └────────┬─────────┘
             │                       │                      │
             │ SMTP OTP              │ 31 GPS Samples       │ Lat/Long + Zones
             ▼                       ▼                      ▼
     ┌──────────────┐     ┌─────────────────────┐  ┌──────────────────┐
     │  Email Node  │     │ Kinematic Feature   │  │ Web3 / Alchemy   │
     │  (TLS/SMTP)  │     │    Extraction       │  │ Blockchain Log   │
     └──────────────┘     │ (Haversine / Speed) │  └────────┬─────────┘
                          └──────────┬──────────┘           │ Tx Hash
                                     │                      ▼
                                     ▼           ┌──────────────────────┐
                           ┌─────────────────┐   │ LangChain Multi-     │
                           │  PyTorch GRU    │   │ Model Fallback LLM   │
                           │  Autoencoder    │   │ Evaluation (Groq)    │
                           │ (MSE Threshold) │   └────────┬─────────────┘
                           └──────────┬──────┘            │
                                      │                   │
                                      ▼                   ▼
       ┌─────────────────────────────────────────────────────────────┐
       │                    PostgreSQL Database                      │
       │        (users, temp_user, location_data, geofence_anomalies)│
       └─────────────────────────────────────────────────────────────┘
```

---

## 📁 Monorepo Structure

```text
Multi-Purpose-Tourist-Safety-Monitoring/
├── backend/                            # FastAPI Python backend
│   ├── Operations/
│   │   ├── calc.py                     # Kinematic feature extraction
│   │   ├── clear_entries.py            # SQL sliding-window retention cleanup
│   │   ├── geofence_logging.py         # Geofence breach persistence
│   │   ├── get_loc_data.py             # Trajectory fetch for inference
│   │   ├── inference.py                # PyTorch forward pass & MSE
│   │   ├── load_model.py               # GRU Autoencoder weight loader
│   │   ├── load_scaler.py              # Scikit-learn scaler loader
│   │   ├── location_entry.py           # Batch GPS insertion
│   │   └── model_structure.py          # GRU_AutoEncoder architecture
│   ├── Schema/
│   │   ├── location_data.py            # Pydantic GPS & geofence models
│   │   └── session_validation.py       # Pydantic auth & session models
│   ├── auth/
│   │   ├── email_message.py            # SMTP OTP dispatcher
│   │   ├── forgot_pass.py              # Password recovery workflows
│   │   ├── generate_token.py           # JWT creation
│   │   ├── login.py                    # Credential verification
│   │   ├── registration.py             # User onboarding & OTP staging
│   │   └── security.py                 # Argon2 & SHA-256 helpers
│   ├── bc_module/
│   │   └── blockchain.py               # Web3 tx signing & audit hashing
│   ├── db/
│   │   └── connection.py               # Psycopg connection pool
│   ├── gruautoencoder/
│   │   ├── gru_autoencoder_model.pth   # Pre-trained model weights
│   │   ├── scaler.pkl                  # Pre-fitted StandardScaler
│   │   └── TrajectoryAnomaly.ipynb     # Training notebook
│   ├── llm/
│   │   ├── initialization.py           # Groq LLM setup & fallback chain
│   │   └── llm_inference.py            # Incident evaluation invoker
│   ├── app.py                          # Main FastAPI app & routes
│   ├── config.py                       # Environment variable loader
│   ├── pyproject.toml                  # Project metadata & dependencies
│   └── requirements.txt                # Pip-compatible requirements
│
└── frontend/                           # React / TanStack Start frontend
    ├── src/
    │   ├── components/
    │   │   ├── Dashboard.tsx           # Main safety console & tracking loop
    │   │   ├── TrajectoryMap.tsx       # Mapbox vector map with drawing
    │   │   ├── LlmEvaluationCard.tsx   # AI breach evaluation card
    │   │   ├── AuthView.tsx            # Login, registration & OTP
    │   │   ├── ForgotPasswordView.tsx  # Password reset workflow
    │   │   └── ui/                     # Radix UI & Tailwind primitives
    │   ├── lib/
    │   │   ├── kalman-filter.ts        # 2D Geodetic Kalman Filter
    │   │   ├── geofence-utils.ts       # Geodesic buffering & raycasting
    │   │   ├── api.ts                  # Backend API client (JWT)
    │   │   └── trajectory-types.ts     # TypeScript schemas & contracts
    │   ├── routes/
    │   │   ├── index.tsx               # Main application route
    │   │   └── __root.tsx              # Root layout & theme provider
    │   └── styles.css                  # Tailwind CSS v4 & animations
    ├── package.json
    └── vite.config.ts
```

---

## 🛠️ Tech Stack

### Backend

| Category | Technologies / Libraries |
| :--- | :--- |
| **API Framework** | FastAPI, Uvicorn, Pydantic v2 |
| **Machine Learning & Math** | PyTorch, Scikit-Learn, NumPy, Pandas, Joblib |
| **Generative AI & LLM** | LangChain, LangChain-Core, LangChain-Groq |
| **Blockchain / Web3** | Web3.py, Alchemy RPC (Ethereum / EVM) |
| **Authentication & Security** | Argon2 (`pwdlib`), PyJWT, Python `secrets`, SHA-256 |
| **Database & Drivers** | PostgreSQL, Psycopg 3 (`psycopg[binary]`) |
| **Email Services** | Python `smtplib`, `email.message` (TLS) |
| **Packaging & Environment** | `uv` / `pip`, `python-dotenv` |

### Frontend

| Category | Technologies / Libraries |
| :--- | :--- |
| **UI Framework** | React 19, TypeScript |
| **Routing / SSR** | TanStack Start, React Router |
| **Map Rendering** | Mapbox GL JS |
| **Styling** | Tailwind CSS v4, Radix UI |
| **Build Tool** | Vite, Bun |
| **Linting / Formatting** | ESLint, Prettier |

---

## ⚙️ Prerequisites

| Requirement | Version |
| :--- | :--- |
| **Python** | `>= 3.12` |
| **Node.js** | `>= 18.0.0` (Node 20+ recommended) |
| **PostgreSQL** | `>= 14` |
| **Groq API Key** | For LLM incident analysis |
| **SMTP Account** | For OTP email delivery (e.g., Gmail App Password) |
| **Mapbox Token** | Public access token for vector map rendering |
| **Web3 Wallet & Alchemy** | EVM wallet private key + Alchemy RPC endpoint |

---

## 🔐 Environment Configuration

### Backend `.env`

Create a `.env` file inside the `backend/` directory:

```ini
# ==============================================================================
# DATABASE CONFIGURATION (PostgreSQL)
# ==============================================================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tourist_safety_db
DB_USER=postgres
DB_PASS=your_db_password

# ==============================================================================
# SMTP / EMAIL CONFIGURATION (For OTP Delivery)
# ==============================================================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_app_specific_password

# ==============================================================================
# JWT AUTHENTICATION CONFIGURATION
# ==============================================================================
JWT_SECRET_KEY=your_super_secret_jwt_key_here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

# ==============================================================================
# GROQ LLM CONFIGURATION
# ==============================================================================
GROQ_API_KEY=gsk_your_groq_api_key_here

# ==============================================================================
# BLOCKCHAIN AUDIT CONFIGURATION (Web3 / Alchemy)
# ==============================================================================
ALCHEMY_URL=https://eth-sepolia.g.alchemy.com/v2/your_alchemy_api_key
WALLET_ADDRESS=0xYourWalletPublicAddress
PRIVATE_KEY=your_wallet_private_key_without_0x_prefix
```

### Frontend `.env`

Create a `.env` file inside the `frontend/` directory:

```env
# Backend API Base URL
VITE_API_BASE_URL=http://localhost:8000

# Mapbox GL Public Access Token
VITE_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_access_token_here
```

---

## 🗄️ Database Setup

Ensure PostgreSQL is running, then create the required schema:

```sql
-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Temporary Registrations / OTP Table
CREATE TABLE IF NOT EXISTS temp_user (
    id SERIAL PRIMARY KEY,
    temp_email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(64) NOT NULL,
    valid_upto TIMESTAMPTZ NOT NULL,
    password_hash TEXT,
    role VARCHAR(50)
);

-- 3. Historical GPS Location Sequences
CREATE TABLE IF NOT EXISTS location_data (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_user_timestamp UNIQUE (email, timestamp)
);

-- 4. Geofence Anomaly & Incident Reports
CREATE TABLE IF NOT EXISTS geofence_anomalies (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    user_lat DOUBLE PRECISION NOT NULL,
    user_long DOUBLE PRECISION NOT NULL,
    caution_zone_coords JSONB,
    danger_zone_coords JSONB,
    timestampz TIMESTAMPTZ NOT NULL,
    llm_evaluation TEXT,
    blockchain_tx_hash VARCHAR(66),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📦 Installation & Setup

### Backend Setup

**Option 1 — `uv` (Recommended):**
```bash
cd backend
uv venv
uv sync
```

**Option 2 — Standard `pip`:**
```bash
cd backend

# Create & activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

# Install dependencies
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd frontend
npm install
# or: bun install
```

---

## 🚀 Running the Application

### Start the Backend

```bash
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

API documentation available at:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Start the Frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Other Frontend Commands

```bash
npm run lint       # ESLint code linting
npm run format     # Prettier auto-formatting
npm run build      # Production build
```

---

## 📡 API Reference

### 1. Authentication & Account Management

#### `POST /registration`
Registers a new user candidate and emails a 6-digit verification OTP (valid 5 minutes).

**Request Body:**
```json
{
  "email": "tourist@example.com",
  "password": "SecurePassword123!",
  "role": "tourist"
}
```
**Response `200 OK`:**
```json
{ "message": "Recieved, please verify email with an otp", "status": true }
```

---

#### `POST /registration/enter_otp`
Verifies the OTP. If successful, activates the account in the `users` table.

**Request Body:**
```json
{ "email": "tourist@example.com", "otp": "481920" }
```
**Response `200 OK`:** `{ "status": true }`

---

#### `POST /login`
Authenticates credentials and returns a Bearer JWT.

**Request Body:**
```json
{ "email": "tourist@example.com", "password": "SecurePassword123!" }
```
**Response `200 OK`:**
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "verified": true }
```

---

#### `POST /forgot_password`
Initiates password recovery by dispatching an OTP.

#### `POST /forgot_password/enter_otp`
Validates the reset OTP.

#### `POST /forgot_password/enter_new_password`
Updates the user's password with a new Argon2-hashed value.

#### `POST /remove-account`
Permanently deletes an account after credential verification.

#### `GET /profile`
Returns the authenticated user's identity and role.
- **Header**: `Authorization: Bearer <token>`
- **Response:** `{ "current_user": { "email": "...", "role": "tourist" } }`

---

### 2. Monitoring & Anomaly Detection

#### `POST /location_data`
Accepts exactly **31 consecutive GPS points**, extracts kinematic features, stores them, and runs GRU Autoencoder inference.

- **Header**: `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "samples": [
    { "latitude": 19.09480, "longitude": 74.74800, "timestamp": "2026-10-13T10:00:00Z" },
    "... (31 samples total)"
  ]
}
```
**Response `200 OK`:**
```json
{ "status": "Normal", "mse": 0.124581 }
```
> If MSE ≥ 0.326157, `"status"` will be `"Anomaly"`.

---

#### `POST /geofence_ping`
Transmits user coordinates + zone polygons. Automatically logs a blockchain transaction, runs GRU inference, and performs LLM risk assessment.

- **Header**: `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "lat": 19.0834,
  "long": 74.7456,
  "timestamp": "2026-10-13T10:05:00Z",
  "caution_zone_coords": [
    { "lat": 19.0820, "long": 74.7440 },
    { "lat": 19.0850, "long": 74.7440 },
    { "lat": 19.0850, "long": 74.7470 },
    { "lat": 19.0820, "long": 74.7470 }
  ],
  "danger_zone_coords": [
    { "lat": 19.0830, "long": 74.7450 },
    { "lat": 19.0840, "long": 74.7450 },
    { "lat": 19.0840, "long": 74.7460 },
    { "lat": 19.0830, "long": 74.7460 }
  ]
}
```
**Response `200 OK`:**
```json
{
  "llm_eval": "{ \"risk_category\": \"HIGH\", \"message\": \"...\", \"risk_score\": \"0.85\", \"recommended_actions\": \"...\" }",
  "GRU_Autoencoder output": 0.481203
}
```

---

### 3. Health & Diagnostics

#### `GET /`
Service welcome banner.

#### `GET /health`
```json
{ "server": "Running", "version": "0.1.0", "Verified": true }
```

---

## 🧠 Machine Learning & Detection Logic

### Feature Engineering

Given N = 31 consecutive GPS points (lat_i, lon_i, t_i):

1. **Haversine Distance**:

$$a = \sin^2\!\left(\frac{\Delta\text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\!\left(\frac{\Delta\text{lon}}{2}\right), \quad d = 2R\cdot\arctan2\!\left(\sqrt{a},\sqrt{1-a}\right)$$

2. **Speed**: $v_i = d_i / \Delta t_i$
3. **Acceleration**: $a_i = \Delta v_i / \Delta t_i$
4. **Bearing & Direction Change**: Compass heading θ and angular delta min(|Δθ|, 360° − |Δθ|).
5. **Stationary State**: Flagged as 1 if speed ≤ 0.3 m/s for cumulative duration ≥ 60 s.
6. **Feature Matrix**: Scaled via `StandardScaler` → tensor shape `(1, 30, 4)`.

### GRU Autoencoder Architecture

```text
Input  (1, 30, 4)
  │
  ▼
GRU Encoder     (Input: 4  → Hidden: 64,  BatchFirst)
  │
  ▼
Linear Compress (64 → 32  Latent Dimension)
  │
  ▼
Linear Expand   (32 → 64)
  │
  ▼
GRU Decoder     (Input: 64 → Hidden: 64,  BatchFirst)
  │
  ▼
Linear Project  (64 → 4)
  │
  ▼
Output Reconstruction (1, 30, 4)
```

**Objective**: MSELoss(X, X̂). Normal patterns → low error; erratic trajectories → MSE ≥ 0.326157 → **Anomaly**.

---

## 🗺️ Frontend Intelligence

### 2D Geodetic Kalman Filter
- **Measurement Noise (R)**: Device GPS accuracy (`position.coords.accuracy`) converted to lat/lon covariance.
- **Process Noise (Q)**: Pedestrian velocity model (~3.0 m/s) over elapsed Δt.
- Strict **5-second sampling interval** for all buffer entries, map plots, and geofence evaluations.

### Geofence State Machine

```text
         enters caution buffer
SAFE ──────────────────────────► CAUTION  ──► /geofence_ping fired
  ▲                                  │
  │       retreats to safe           │ enters danger zone
  └──────────────────────────────────►  DANGER  ──► /geofence_ping fired
                                      │
                                      └── stays in zone: no duplicate ping
```

### AI Incident Evaluation Card
- Color-coded risk badge (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`)
- Threat-level visual progress bar (risk score 0.0–1.0)
- Natural language condition & perimeter assessment
- Highlighted emergency protocol recommendations
- Incident telemetry: coordinates, timestamp, GRU Autoencoder MSE output

---

## ⛓️ Blockchain Audit Logging

For non-repudiation during safety incidents:

1. Synthesize an immutable audit string:
   ```
   <email>|<latitude>|<longitude>|<ISO-8601 Timestamp>
   ```
2. Hash using **SHA-256**.
3. Construct a raw Ethereum transaction with the hex digest in the `data` field:
   ```python
   tx = {
       'nonce': w3.eth.get_transaction_count(checksum_address),
       'to': checksum_address,
       'value': 0,
       'gas': 200000,
       'gasPrice': w3.eth.gas_price,
       'data': w3.to_hex(text=data_hash),
       'chainId': w3.eth.chain_id
   }
   ```
4. Sign with `eth_account` and broadcast via Alchemy RPC.
5. Persist the transaction hash (`0x...`) alongside the anomaly record in PostgreSQL.

---

## 🤖 LLM Risk Reasoning Pipeline

On every geofence breach, the backend sends spatial context, historical trajectory, and GRU MSE to a **Groq LLM cascade**:

**Automatic Fallback Hierarchy:**
1. `openai/gpt-oss-120b` (Primary)
2. `qwen/qwen3.8-27b` (Secondary)
3. `openai/gpt-oss-20b` (Tertiary)
4. `openai/gpt-oss-safeguard-20b` (Final Safeguard)

**JSON Schema Output:**
```json
{
  "risk_category": "LOW | MEDIUM | HIGH | CRITICAL",
  "message": "Detailed situation assessment",
  "risk_score": "0.0 to 1.0",
  "recommended_actions": "Contextual safety instructions"
}
```

---

## 👥 Authors

- **Jivan Divate** — [divatejivan2005@gmail.com](mailto:divatejivan2005@gmail.com)
- **Yashashree Chakane** — [yashic4390@gmail.com](mailto:yashic4390@gmail.com)
- **Jayshree Gaikwad** — [jayshreeg432@gmail.com](mailto:jayshreeg432@gmail.com)

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="center">
  <sub>Built with ❤️ for Tourist Safety & Emergency Monitoring</sub>
</p>
