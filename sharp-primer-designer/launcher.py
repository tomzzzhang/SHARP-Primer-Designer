#!/usr/bin/env python3
"""
SHARP Primer Designer — Launcher

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
BACKEND_URL    = "http://127.0.0.1:8000/health"

def _read_version() -> str:
    try:
        return (ROOT / "version.txt").read_text().strip()
    except Exception:
        return "???"

BUILD_VERSION = _read_version()

# ── Platform helpers ──────────────────────────────────────────────────────────

def _python_subdir():
    return "Scripts" if IS_WINDOWS else "bin"

def _python_exe():
    return "python.exe" if IS_WINDOWS else "python"

def _mono_font():
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
        self._log_visible = False

        self.root = tk.Tk()
        self.root.title("SHARP Primer Designer")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        self._build_ui()

        # Auto-start after UI renders
        self.root.after(300, self._auto_start)

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
        ).pack(pady=(0, 4))
        # Version key
        tk.Label(
            root, text=f"Version  {BUILD_VERSION}",
            font=(_mono_font(), 20, "bold"), bg="#f9fafb", fg="#2563eb"
        ).pack(pady=(0, 14))

        # Status indicator — single line
        status_frame = tk.Frame(root, bg="#f9fafb")
        status_frame.pack(pady=(0, 12))

        self.status_dot = tk.Label(
            status_frame, text="●", font=("Helvetica", 16), bg="#f9fafb", fg="#d1d5db"
        )
        self.status_dot.pack(side="left")

        self.status_var = tk.StringVar(value="Starting...")
        tk.Label(
            status_frame, textvariable=self.status_var,
            font=("Helvetica", 12), bg="#f9fafb", fg="#374151"
        ).pack(side="left", padx=(6, 0))

        # Open in Browser button — prominent
        self.open_btn = tk.Button(
            root, text="Open in Browser", font=("Helvetica", 13, "bold"),
            bg="#2563eb", fg="white", activebackground="#1d4ed8", activeforeground="white",
            relief="flat", padx=20, pady=10, cursor="hand2",
            state="disabled",
            command=lambda: webbrowser.open(APP_URL)
        )
        self.open_btn.pack(padx=24, pady=(0, 10), fill="x")

        # Restart / Quit buttons
        btn_frame = tk.Frame(root, bg="#f9fafb")
        btn_frame.pack(padx=24, pady=(0, 8), fill="x")

        self.restart_btn = tk.Button(
            btn_frame, text="Restart", font=("Helvetica", 10),
            bg="#f3f4f6", fg="#374151", activebackground="#e5e7eb",
            relief="flat", padx=16, pady=4, cursor="hand2",
            command=self._restart
        )
        self.restart_btn.pack(side="left", expand=True, fill="x", padx=(0, 4))

        tk.Button(
            btn_frame, text="Quit", font=("Helvetica", 10),
            bg="#f3f4f6", fg="#374151", activebackground="#e5e7eb",
            relief="flat", padx=16, pady=4, cursor="hand2",
            command=self._on_close
        ).pack(side="left", expand=True, fill="x", padx=(4, 0))

        # Show/Hide Log toggle
        self.log_toggle_var = tk.StringVar(value="▸ Show Log")
        self.log_toggle = tk.Label(
            root, textvariable=self.log_toggle_var,
            font=("Helvetica", 10), bg="#f9fafb", fg="#6b7280",
            cursor="hand2"
        )
        self.log_toggle.pack(pady=(4, 2), anchor="w", padx=24)
        self.log_toggle.bind("<Button-1>", lambda e: self._toggle_log())

        # Log box (hidden by default)
        self.log_frame = tk.Frame(root, bg="#f9fafb")

        scrollbar = tk.Scrollbar(self.log_frame)
        scrollbar.pack(side="right", fill="y")

        self.log = tk.Text(
            self.log_frame, height=8, width=52,
            font=(_mono_font(), 9), bg="#111827", fg="#d1fae5",
            relief="flat", state="disabled",
            yscrollcommand=scrollbar.set
        )
        self.log.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.log.yview)

        # Start compact (no log)
        root.geometry("400x280")

    def _toggle_log(self):
        if self._log_visible:
            self.log_frame.pack_forget()
            self.log_toggle_var.set("▸ Show Log")
            self.root.geometry("400x280")
        else:
            self.log_frame.pack(padx=24, pady=(0, 16), fill="both", expand=True)
            self.log_toggle_var.set("▾ Hide Log")
            self.root.geometry("400x480")
        self._log_visible = not self._log_visible

    def _auto_start(self):
        python, env = _get_python_cmd()
        if not python or not Path(python).exists():
            setup_hint = "scripts\\setup.bat" if IS_WINDOWS else "./scripts/setup.sh"
            self._set_status("Not set up", "#ef4444")
            self._log(f"Run {setup_hint} before launching")
            return
        self._log(f"Python: {python}")
        if env:
            self._log(f"Environment: {env}")
        self._start()

    # ── Server control ─────────────────────────────────────────────────────────

    def _set_status(self, text, color="#374151"):
        self.status_var.set(text)
        dot_colors = {
            "Starting...": "#f59e0b",   # amber
            "Running": "#16a34a",        # green
            "Stopped": "#d1d5db",        # gray
            "Not set up": "#ef4444",     # red
            "Restarting...": "#f59e0b",  # amber
        }
        self.status_dot.config(fg=dot_colors.get(text, "#6b7280"))

    def _start(self):
        python, _ = _get_python_cmd()
        if not python:
            return

        self._set_status("Starting...")
        self.running = True
        self.open_btn.config(state="disabled")

        popen_kwargs = {}
        if IS_WINDOWS:
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        # Backend
        self._log("Starting services...")
        self.backend_proc = subprocess.Popen(
            [python, "-m", "uvicorn", "main:app", "--reload", "--port", "8000"],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            **popen_kwargs,
        )
        threading.Thread(target=self._tail, args=(self.backend_proc, "srv"), daemon=True).start()

        # Frontend
        npm_cmd = ["npm", "run", "dev"]
        self.frontend_proc = subprocess.Popen(
            npm_cmd,
            cwd=str(FRONTEND_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            shell=IS_WINDOWS,
            **popen_kwargs,
        )
        threading.Thread(target=self._tail, args=(self.frontend_proc, "app"), daemon=True).start()

        self._monitor_thread = threading.Thread(target=self._monitor, daemon=True)
        self._monitor_thread.start()

    def _stop(self):
        self.running = False
        self._log("Stopping...")
        for proc in (self.backend_proc, self.frontend_proc):
            if proc and proc.poll() is None:
                try:
                    if IS_WINDOWS:
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
        self.open_btn.config(state="disabled")
        self._set_status("Stopped")
        self._log("Stopped.")

    def _restart(self):
        self._set_status("Restarting...")
        threading.Thread(target=self._do_restart, daemon=True).start()

    def _do_restart(self):
        self._stop()
        time.sleep(1)
        self.root.after(0, self._start)

    def _monitor(self):
        """Poll until both servers are ready, then open browser."""
        import urllib.request
        backend_ok  = False
        frontend_ok = False

        for _ in range(60):  # up to 30s
            if not self.running:
                return
            time.sleep(0.5)

            if not backend_ok:
                try:
                    resp = urllib.request.urlopen(BACKEND_URL, timeout=2)
                    resp.read()
                    backend_ok = True
                    self._log("API ready")
                except Exception:
                    pass

            if not frontend_ok:
                try:
                    urllib.request.urlopen(APP_URL, timeout=1)
                    frontend_ok = True
                    self._log("App ready")
                except Exception:
                    pass

            if backend_ok and frontend_ok:
                self.root.after(0, lambda: [
                    self.open_btn.config(state="normal"),
                    self._set_status("Running"),
                    webbrowser.open(APP_URL),
                ])
                return

        self._log("Timeout waiting for app to start")
        self.root.after(0, lambda: self._set_status("Stopped"))

    def _tail(self, proc, label):
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
