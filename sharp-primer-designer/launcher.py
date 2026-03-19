#!/usr/bin/env python3
"""
SHARP Primer Designer — GUI Launcher

Double-click this file (or run `python launcher.py`) to start the app.
Uses only stdlib (tkinter + subprocess) — no conda env needed for the launcher itself.
"""

import os
import subprocess
import sys
import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path

IS_WINDOWS = sys.platform == "win32"

ROOT = Path(__file__).parent
ENV_TYPE_FILE = ROOT / ".python_env_type"
BACKEND_DIR   = ROOT / "backend"
FRONTEND_DIR  = ROOT / "frontend"
APP_URL        = "http://localhost:5173"
BACKEND_URL    = "http://localhost:8000/health"

# ── Platform helpers ──────────────────────────────────────────────────────────

def _python_subdir():
    """Return the platform-specific subdirectory for Python in a venv/conda env."""
    return "Scripts" if IS_WINDOWS else "bin"

def _python_exe():
    """Return the platform-specific Python executable name."""
    return "python.exe" if IS_WINDOWS else "python"

def _mono_font():
    """Return a platform-appropriate monospace font."""
    if IS_WINDOWS:
        return "Consolas"
    elif sys.platform == "darwin":
        return "Menlo"
    return "monospace"

# ── Resolve Python / activation command ───────────────────────────────────────

def _get_python_cmd():
    if not ENV_TYPE_FILE.exists():
        return None, None
    lines = ENV_TYPE_FILE.read_text().splitlines()
    env_type = lines[0].strip() if lines else ""
    if env_type == "conda":
        env_name = lines[1].strip() if len(lines) > 1 else "sharp"
        # Find conda base — try the command first, then check common locations
        conda_base = None
        try:
            result = subprocess.run(
                ["conda", "info", "--base"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                conda_base = result.stdout.strip()
        except FileNotFoundError:
            pass
        if not conda_base:
            # Check common install locations
            candidates = [
                Path.home() / "anaconda3",
                Path.home() / "miniconda3",
                Path("C:/ProgramData/anaconda3"),
            ] if IS_WINDOWS else [
                Path.home() / "opt" / "anaconda3",
                Path.home() / "anaconda3",
                Path.home() / "miniconda3",
            ]
            for c in candidates:
                if (c / "envs").is_dir():
                    conda_base = str(c)
                    break
            if not conda_base:
                conda_base = str(Path.home() / ("anaconda3" if IS_WINDOWS else "opt/anaconda3"))
        env_dir = Path(conda_base) / "envs" / env_name
        # Conda on Windows puts python.exe in the env root, not Scripts/
        python = env_dir / _python_exe()
        if not python.exists():
            python = env_dir / _python_subdir() / _python_exe()
        return str(python), env_name
    else:
        python = str(ROOT / "backend" / "venv" / _python_subdir() / _python_exe())
        return python, None


# ── Launcher App ──────────────────────────────────────────────────────────────

class LauncherApp:
    def __init__(self):
        self.backend_proc  = None
        self.frontend_proc = None
        self.running = False
        self._monitor_thread = None

        self.root = tk.Tk()
        self.root.title("SHARP Primer Designer")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        self._build_ui()
        self._check_setup()

    # ── UI ─────────────────────────────────────────────────────────────────────

    def _build_ui(self):
        root = self.root
        root.configure(bg="#f9fafb")

        # Title
        tk.Label(
            root, text="SHARP Primer Designer",
            font=("Helvetica", 16, "bold"), bg="#f9fafb", fg="#111827"
        ).pack(pady=(18, 2))
        tk.Label(
            root, text="Primer design for SHARP isothermal amplification",
            font=("Helvetica", 10), bg="#f9fafb", fg="#6b7280"
        ).pack(pady=(0, 16))

        # Status indicators
        frame = tk.Frame(root, bg="#f9fafb")
        frame.pack(padx=24, pady=4, fill="x")

        self.backend_dot  = tk.Label(frame, text="●", font=("Helvetica", 14), bg="#f9fafb", fg="#d1d5db")
        self.backend_dot.grid(row=0, column=0, sticky="w")
        tk.Label(frame, text="Backend  (localhost:8000)", font=("Helvetica", 10),
                 bg="#f9fafb", fg="#374151").grid(row=0, column=1, sticky="w", padx=6)

        self.frontend_dot = tk.Label(frame, text="●", font=("Helvetica", 14), bg="#f9fafb", fg="#d1d5db")
        self.frontend_dot.grid(row=1, column=0, sticky="w")
        tk.Label(frame, text="Frontend (localhost:5173)", font=("Helvetica", 10),
                 bg="#f9fafb", fg="#374151").grid(row=1, column=1, sticky="w", padx=6)

        # Status message
        self.status_var = tk.StringVar(value="Ready")
        tk.Label(
            root, textvariable=self.status_var,
            font=("Helvetica", 10), bg="#f9fafb", fg="#6b7280"
        ).pack(pady=(12, 4))

        # Buttons
        btn_frame = tk.Frame(root, bg="#f9fafb")
        btn_frame.pack(padx=24, pady=(4, 8), fill="x")

        self.start_btn = tk.Button(
            btn_frame, text="▶  Start", font=("Helvetica", 12, "bold"),
            bg="#2563eb", fg="white", activebackground="#1d4ed8", activeforeground="white",
            relief="flat", padx=20, pady=8, cursor="hand2",
            command=self._start
        )
        self.start_btn.pack(side="left", expand=True, fill="x", padx=(0, 4))

        self.stop_btn = tk.Button(
            btn_frame, text="■  Stop", font=("Helvetica", 12),
            bg="#ef4444", fg="white", activebackground="#dc2626", activeforeground="white",
            relief="flat", padx=20, pady=8, cursor="hand2",
            state="disabled",
            command=self._stop
        )
        self.stop_btn.pack(side="left", expand=True, fill="x", padx=(4, 0))

        self.open_btn = tk.Button(
            root, text="🌐  Open in Browser", font=("Helvetica", 11),
            bg="#f3f4f6", fg="#374151", activebackground="#e5e7eb",
            relief="flat", padx=16, pady=6, cursor="hand2",
            state="disabled",
            command=lambda: webbrowser.open(APP_URL)
        )
        self.open_btn.pack(padx=24, pady=(0, 8), fill="x")

        # Log box
        log_frame = tk.Frame(root, bg="#f9fafb")
        log_frame.pack(padx=24, pady=(4, 16), fill="both", expand=True)

        scrollbar = tk.Scrollbar(log_frame)
        scrollbar.pack(side="right", fill="y")

        self.log = tk.Text(
            log_frame, height=8, width=52,
            font=(_mono_font(), 9), bg="#111827", fg="#d1fae5",
            relief="flat", state="disabled",
            yscrollcommand=scrollbar.set
        )
        self.log.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.log.yview)

        root.geometry("440x420")

    def _check_setup(self):
        python, env = _get_python_cmd()
        if not python or not Path(python).exists():
            setup_hint = "scripts\\setup.bat" if IS_WINDOWS else "./scripts/setup.sh"
            self._log(f"⚠  Run {setup_hint} before launching")
            self.start_btn.config(state="disabled")
            self.status_var.set(f"Not set up — run {setup_hint} first")
        else:
            env_label = f"conda env: {env}" if env else "venv"
            self._log(f"Python: {python}")
            self._log(f"Environment: {env_label}")

    # ── Server control ─────────────────────────────────────────────────────────

    def _start(self):
        python, _ = _get_python_cmd()
        if not python:
            return

        self._log("Starting backend…")
        self.start_btn.config(state="disabled")
        self.status_var.set("Starting…")
        self.running = True

        # Platform-specific Popen kwargs for clean process tree termination
        popen_kwargs = {}
        if IS_WINDOWS:
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        # Backend
        self.backend_proc = subprocess.Popen(
            [python, "-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            **popen_kwargs,
        )
        threading.Thread(target=self._tail, args=(self.backend_proc, "backend"), daemon=True).start()

        # Frontend — npm is a .cmd script on Windows, so use shell=True there
        npm_cmd = ["npm", "run", "dev"]
        self.frontend_proc = subprocess.Popen(
            npm_cmd,
            cwd=str(FRONTEND_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            shell=IS_WINDOWS,
            **popen_kwargs,
        )
        threading.Thread(target=self._tail, args=(self.frontend_proc, "frontend"), daemon=True).start()

        self.stop_btn.config(state="normal")
        self._monitor_thread = threading.Thread(target=self._monitor, daemon=True)
        self._monitor_thread.start()

    def _stop(self):
        self.running = False
        self._log("Stopping servers…")
        for proc in (self.backend_proc, self.frontend_proc):
            if proc and proc.poll() is None:
                try:
                    if IS_WINDOWS:
                        # taskkill /T kills the entire process tree
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                            capture_output=True,
                        )
                    else:
                        import signal
                        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except Exception:
                    proc.terminate()
        self.backend_proc = self.frontend_proc = None
        self.backend_dot.config(fg="#d1d5db")
        self.frontend_dot.config(fg="#d1d5db")
        self.start_btn.config(state="normal")
        self.stop_btn.config(state="disabled")
        self.open_btn.config(state="disabled")
        self.status_var.set("Stopped")
        self._log("Servers stopped.")

    def _monitor(self):
        """Poll until both servers are ready, then enable the Open button."""
        import urllib.request
        backend_ok  = False
        frontend_ok = False

        for _ in range(60):  # up to 30s
            if not self.running:
                return
            time.sleep(0.5)

            if not backend_ok:
                try:
                    urllib.request.urlopen(BACKEND_URL, timeout=1)
                    backend_ok = True
                    self.root.after(0, lambda: self.backend_dot.config(fg="#16a34a"))
                    self._log("Backend ready ✓")
                except Exception:
                    pass

            if not frontend_ok:
                try:
                    urllib.request.urlopen(APP_URL, timeout=1)
                    frontend_ok = True
                    self.root.after(0, lambda: self.frontend_dot.config(fg="#16a34a"))
                    self._log("Frontend ready ✓")
                except Exception:
                    pass

            if backend_ok and frontend_ok:
                self.root.after(0, lambda: [
                    self.open_btn.config(state="normal"),
                    self.status_var.set("Running — click Open to launch"),
                    webbrowser.open(APP_URL),
                ])
                return

        self._log("⚠  Timeout waiting for servers")

    def _tail(self, proc, label):
        """Stream process output to the log box."""
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                self._log(f"[{label}] {line}")

    def _log(self, msg):
        def _append():
            self.log.config(state="normal")
            self.log.insert("end", msg + "\n")
            self.log.see("end")
            self.log.config(state="disabled")
        self.root.after(0, _append)

    def _on_close(self):
        if self.running:
            self._stop()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    LauncherApp().run()
