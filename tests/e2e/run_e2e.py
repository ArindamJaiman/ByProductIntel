"""
Run the browser journey against a production build in demo mode.

    npm run test:e2e

1. Seeds an isolated demo store (.data/e2e-store.json) so the developer's own
   demo data is untouched.
2. Builds the app from a clean .next directory (set E2E_REBUILD=0 to reuse an existing build).
3. Starts `next start` on port 3100 using the webapp-testing skill's
   with_server.py helper and runs tests/e2e/journey.py.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / ".claude" / "skills" / "webapp-testing" / "scripts" / "with_server.py"
PORT = "3100"


def run(cmd: str):
    print(f"$ {cmd}")
    subprocess.run(cmd, shell=True, cwd=ROOT, check=True)


def free_port(port: str):
    """Stop anything still listening on `port`.

    with_server.py terminates its shell, but on Windows the grandchild `next start`
    process can survive and keep serving an older build on the same port, which
    silently invalidates later runs. Clean up before and after every run.
    """
    if sys.platform == "win32":
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
        pids = {line.split()[-1] for line in out.splitlines() if f":{port} " in line and "LISTENING" in line}
        for pid in pids:
            subprocess.run(["taskkill", "/PID", pid, "/T", "/F"], capture_output=True)
    else:
        subprocess.run(f"lsof -ti tcp:{port} | xargs -r kill -9", shell=True, capture_output=True)


def main():
    env_store = str(ROOT / ".data" / "e2e-store.json")
    os.environ["BPI_DEMO_STORE_PATH"] = env_store
    os.environ["BPI_DATA_MODE"] = "demo"
    os.environ["BASE_URL"] = f"http://localhost:{PORT}"
    run("npm run seed")
    os.environ["PYTHONIOENCODING"] = "utf-8"
    if os.environ.get("E2E_REBUILD", "1") == "1" or not (ROOT / ".next" / "BUILD_ID").exists():
        # Build from a clean output directory so the run never mixes artefacts of two builds.
        free_port(PORT)
        shutil.rmtree(ROOT / ".next", ignore_errors=True)
        run("npm run build")
    if not HELPER.exists():
        sys.exit("webapp-testing skill helper not found; install the skill (see README).")
    cmd = [
        sys.executable,
        str(HELPER),
        "--server",
        f"npx next start -p {PORT}",
        "--port",
        PORT,
        "--timeout",
        "90",
        "--",
        sys.executable,
        str(Path(__file__).parent / "journey.py"),
    ]
    free_port(PORT)
    try:
        code = subprocess.call(cmd, cwd=ROOT)
    finally:
        free_port(PORT)
    sys.exit(code)


if __name__ == "__main__":
    main()
