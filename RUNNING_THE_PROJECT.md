# Running the Project: Local & Cloud Environment Guide

This guide provides beginner-friendly instructions to run and test both the FastAPI backend and React frontend on Windows, macOS, or Linux.

---

## 1. Quick Start in Google AI Studio Cloud Container

In this hosted environment, the dev server is pre-configured:
1. The **FastAPI backend** runs on `http://127.0.0.1:8001` (managed daemon).
2. The **Vite dev server** runs on `http://0.0.0.0:3000` and automatically proxies `/api/*` to the FastAPI backend.
3. In the web interface, open **Settings**, ensure the **Backend Base URL** is empty (uses the Same-Origin Proxy), and click **Test Connection**.

---

## 2. Running Locally on Windows (PowerShell or Command Prompt)

### Prerequisites
- Node.js 18+ (LTS)
- Python 3.10+
- Git

### Step A: Clone and Install Dependencies

```powershell
# 1. Clone repository
git clone <YOUR_REPO_URL>
cd digital-twin-shoulder

# 2. Install Node.js frontend dependencies
npm install

# 3. Create Python virtual environment for backend
python -m venv venv

# 4. Activate virtual environment on Windows
.\venv\Scripts\Activate.ps1
# (If using CMD: .\venv\Scripts\activate.bat)

# 5. Install Python backend dependencies
pip install -r backend/requirements.txt
```

### Step B: Launch Backend Server (Terminal 1)

```powershell
# Make sure virtual environment is active (shows (venv) in prompt)
uvicorn backend.app.main:app --host 127.0.0.1 --port 8001 --reload
```
*Expected output:*
```
INFO:     Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)
INFO:     Application startup complete.
```
*Verification*: Open `http://localhost:8001/docs` in your browser to view the interactive Swagger API documentation.

### Step C: Launch Frontend Server (Terminal 2)

```powershell
# Open a second terminal in the project root
npm run dev
```
*Expected output:*
```
  VITE v8.x  ready in ... ms
  ➜  Local:   http://localhost:3000/
```
*Verification*: Open `http://localhost:3000/` in your browser. The status badge in the top right will show **FastAPI Online**.

---

## 3. Running Backend Automated Tests

To run the complete automated test suite on Windows:

```powershell
# Set PYTHONPATH to current directory and run pytest
$env:PYTHONPATH="."
pytest -v backend/tests
```

*Expected result:*
```
backend/tests/test_api.py::test_root PASSED
backend/tests/test_api.py::test_health_endpoint PASSED
backend/tests/test_api.py::test_list_cases_empty PASSED
backend/tests/test_api.py::test_create_and_get_case PASSED
backend/tests/test_api.py::test_get_case_not_found PASSED
backend/tests/test_api.py::test_delete_case PASSED
backend/tests/test_api.py::test_persistence_across_reinitialization PASSED
backend/tests/test_api.py::test_nested_field_serialization_and_updates PASSED
backend/tests/test_api.py::test_invalid_input_handling PASSED
========================= 9 passed in 0.88s =========================
```

---

## 4. Running Frontend Quality Checks

```powershell
# Run TypeScript compilation check
npm run lint

# Run production build check
npm run build
```
Both checks must exit with `0 errors`.
