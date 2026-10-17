"""Outbound-only Windows conversion worker. Credentials stay in a local config."""
import argparse
import ctypes
from ctypes import wintypes
import http.client
import json
import logging
from logging.handlers import RotatingFileHandler
import msvcrt
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
import zipfile
from kn5_job import inspect_kn5, InvalidKn5


class ApiError(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__(f'API HTTP {status}')


class Cancelled(Exception):
    pass


class ProcessJob:
    """Windows job limits memory and kills descendants when the job handle closes."""
    def __init__(self, process):
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in ('ReadOperationCount', 'WriteOperationCount', 'OtherOperationCount', 'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount')]
        class BASIC(ctypes.Structure):
            _fields_ = [('PerProcessUserTimeLimit', ctypes.c_longlong), ('PerJobUserTimeLimit', ctypes.c_longlong), ('LimitFlags', wintypes.DWORD), ('MinimumWorkingSetSize', ctypes.c_size_t), ('MaximumWorkingSetSize', ctypes.c_size_t), ('ActiveProcessLimit', wintypes.DWORD), ('Affinity', ctypes.c_size_t), ('PriorityClass', wintypes.DWORD), ('SchedulingClass', wintypes.DWORD)]
        class EXTENDED(ctypes.Structure):
            _fields_ = [('BasicLimitInformation', BASIC), ('IoInfo', IO), ('ProcessMemoryLimit', ctypes.c_size_t), ('JobMemoryLimit', ctypes.c_size_t), ('PeakProcessMemoryUsed', ctypes.c_size_t), ('PeakJobMemoryUsed', ctypes.c_size_t)]
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]; self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]; self.kernel.SetInformationJobObject.restype = wintypes.BOOL
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]; self.kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise OSError('Cannot create process job')
        limits = EXTENDED()
        limits.BasicLimitInformation.LimitFlags = 0x2000 | 0x100 | 0x200 | 0x8  # kill-on-close, memory, active processes
        limits.BasicLimitInformation.ActiveProcessLimit = 4
        limits.ProcessMemoryLimit = 1536 * 1024 * 1024
        limits.JobMemoryLimit = 2 * 1024 * 1024 * 1024
        if not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not self.kernel.AssignProcessToJobObject(self.handle, wintypes.HANDLE(int(process._handle))):
            self.close(); process.kill(); raise OSError('Cannot apply process limits')

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle); self.handle = None


class Agent:
    def __init__(self, config):
        self.config = config
        self.root = Path(config['workRoot']).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.base = urlsplit(config['apiUrl'].rstrip('/'))
        if self.base.scheme != 'https' and not (self.base.scheme == 'http' and self.base.hostname in ('127.0.0.1', 'localhost')):
            raise ValueError('API must use HTTPS or local loopback HTTP')
        self.worker_id = config['workerId']
        self.active = None
        self.cancelled = threading.Event()
        self.stop = threading.Event()
        self.last_heartbeat = 0

    def request(self, method, route, payload=None, upload=None, download=None, lease=None):
        connection = (http.client.HTTPSConnection if self.base.scheme == 'https' else http.client.HTTPConnection)(self.base.hostname, self.base.port, timeout=60)
        headers = {'Authorization': 'Bearer ' + self.config['token'], 'User-Agent': 'VJ3D-Converter/1'}
        if lease:
            headers['X-Lease-Token'] = lease
        body = None
        if payload is not None:
            body = json.dumps(payload).encode(); headers['Content-Type'] = 'application/json'
        if upload:
            headers.update({'Content-Type': 'application/zip', 'Content-Length': str(upload.stat().st_size)})
            body = upload.open('rb')
        try:
            connection.request(method, self.base.path.rstrip('/') + route, body=body, headers=headers)
            response = connection.getresponse()
            if response.status == 204:
                return None
            if response.status >= 400:
                response.read(8192); raise ApiError(response.status)
            if download:
                total = 0
                with download.open('xb') as stream:
                    while chunk := response.read(1024 * 1024):
                        total += len(chunk)
                        if total > 128 * 1024 * 1024 or self.cancelled.is_set():
                            raise Cancelled()
                        stream.write(chunk)
                return total
            return json.loads(response.read(32768))
        finally:
            if upload and body:
                body.close()
            connection.close()

    def heartbeat(self):
        payload = {'workerId': self.worker_id}
        if self.active:
            payload.update(jobId=self.active['id'], leaseToken=self.active['leaseToken'])
        self.request('POST', '/api/converter-worker/heartbeat', payload)
        self.last_heartbeat = time.monotonic()

    def maintain_heartbeat(self):
        while not self.stop.wait(10):
            try:
                self.heartbeat()
            except ApiError as error:
                if error.status == 409 and self.active:
                    self.cancelled.set()
                logging.warning('Heartbeat: HTTP %s', error.status)
            except Exception:
                logging.warning('Heartbeat unavailable')
            if self.active and time.monotonic() - self.last_heartbeat > 90:
                self.cancelled.set()

    def progress(self, stage):
        self.request('POST', f"/api/converter-worker/jobs/{self.active['id']}/progress", {'stage': stage}, lease=self.active['leaseToken'])

    def run_process(self, arguments, cwd, log_file, timeout=180):
        if self.cancelled.is_set():
            raise Cancelled()
        # No shell, inherited stdin, or worker credentials are passed to a converter.
        environment = {k: v for k, v in os.environ.items() if not re.search(r'TOKEN|SECRET|PASSWORD|API_KEY', k, re.I)}
        flags = subprocess.CREATE_NO_WINDOW
        startup = subprocess.STARTUPINFO(); startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW; startup.wShowWindow = 0
        with log_file.open('wb') as log:
            process = subprocess.Popen(arguments, cwd=str(cwd), env=environment, stdin=subprocess.DEVNULL, stdout=log, stderr=log, creationflags=flags, startupinfo=startup)
            job = ProcessJob(process)
            deadline = time.monotonic() + timeout
            try:
                while process.poll() is None:
                    if self.cancelled.wait(.25):
                        raise Cancelled()
                    if time.monotonic() >= deadline:
                        raise InvalidKn5('timed_out')
                    # Expanded models and exported text must remain bounded on disk.
                    if sum(p.stat().st_size for p in self.root.rglob('*') if p.is_file()) > 1024 * 1024 * 1024:
                        raise InvalidKn5('limit_exceeded')
                return process.returncode
            finally:
                job.close()
                process.wait(timeout=10)

    def remove_workspace(self, workspace):
        workspace = workspace.resolve()
        jobs = (self.root / 'jobs').resolve()
        if workspace.parent != jobs or not re.fullmatch(r'job_[a-f0-9]{32}', workspace.name):
            raise ValueError('Unexpected workspace')
        shutil.rmtree(workspace, ignore_errors=True)

    def process(self, task):
        if not re.fullmatch(r'[a-f0-9-]{36}', task['id']) or not re.fullmatch(r'[a-f0-9]{48}', task['leaseToken']):
            raise ValueError('Invalid task')
        filename = task['filename']
        if len(filename) > 180 or not filename.lower().endswith('.kn5') or re.search(r'[<>:"\\/|?*\x00-\x1f]', filename) or re.match(r'(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.', filename):
            raise ValueError('Invalid source filename')
        explicit_folder = task.get('carFolder') or self.config.get('knownCarFolders', {}).get(filename.casefold())
        car_id = explicit_folder or re.sub(r'[^a-zA-Z0-9_.-]', '_', Path(filename).stem)[:96].strip('.')
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}', car_id) or car_id.endswith('.') or re.match(r'(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', car_id):
            raise ValueError('Invalid original car folder')
        car = self.root / 'DummyAC/content/cars' / car_id
        if car.exists():
            raise ValueError('A car with this identity already exists in the dedicated workspace')
        workspace = self.root / 'jobs' / ('job_' + task['id'].replace('-', ''))
        workspace.mkdir(parents=True, exist_ok=False)
        car.mkdir()
        (car / '.vj-conversion').write_text(task['id'])
        source = car / filename
        target = car / (Path(filename).stem + '_decrypted.kn5')
        output = workspace / 'converted'
        self.cancelled.clear(); self.active = task
        try:
            self.request('GET', f"/api/converter-worker/jobs/{task['id']}/input", download=source, lease=task['leaseToken'])
            inspect_kn5(source)
            ui = car / 'ui'; ui.mkdir()
            (ui / 'ui_car.json').write_text(json.dumps({'name': 'VJ 3D upload', 'brand': 'VJ', 'description': '', 'tags': [], 'class': 'street'}), encoding='utf-8')
            cm = Path(self.config['contentManager'])
            code = self.run_process([str(cm), '--storage-location=' + self.config['profile'], '--offline-mode', '--forcefully-focus-first-window=no', '--auto-decrypt', str(source)], workspace, workspace / 'decrypt.log', timeout=120)
            logging.info('Native converter finished: code=%s output=%s', code, target.is_file())
            if code != 0 or not target.is_file():
                raise InvalidKn5('protected_file' if explicit_folder else 'folder_required')
            inspect_kn5(target)
            self.progress('converting')
            helper = Path(__file__).with_name('kn5_job.py')
            code = self.run_process([self.config['python'], '-I', '-B', str(helper), str(target), str(output), self.config['converter']], workspace, workspace / 'convert.log')
            if code:
                error = (workspace / 'convert.log').read_text(errors='replace')[-2000:]
                kind = next((value for value in ('missing_textures', 'protected_file', 'invalid_file', 'limit_exceeded') if value in error), 'conversion_failed')
                if kind == 'protected_file' and not explicit_folder:
                    kind = 'folder_required'
                raise InvalidKn5(kind)
            self.progress('packaging')
            report = json.loads((output / 'conversao.json').read_text())
            self.request('POST', f"/api/converter-worker/jobs/{task['id']}/report", report, lease=task['leaseToken'])
            archive = workspace / 'resultado.zip'
            with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=4) as zip_file:
                for file in output.rglob('*'):
                    if self.cancelled.is_set():
                        raise Cancelled()
                    if file.is_file():
                        zip_file.write(file, str(file.relative_to(output)).replace('\\', '/'))
                    if archive.stat().st_size > task['maxOutputBytes']:
                        raise InvalidKn5('limit_exceeded')
            if archive.stat().st_size > task['maxOutputBytes']:
                raise InvalidKn5('limit_exceeded')
            self.progress('uploading')
            self.request('POST', f"/api/converter-worker/jobs/{task['id']}/result", upload=archive, lease=task['leaseToken'])
            logging.info('Conversion completed: %s', task['id'])
        except Cancelled:
            logging.info('Conversion cancelled: %s', task['id'])
        except Exception as error:
            kind = str(error) if isinstance(error, InvalidKn5) else 'conversion_failed'
            logging.warning('Conversion failed: %s (%s)', task['id'], kind)
            try:
                self.request('POST', f"/api/converter-worker/jobs/{task['id']}/fail", {'code': kind}, lease=task['leaseToken'])
            except Exception:
                pass
        finally:
            self.active = None
            if car.resolve().parent == (self.root / 'DummyAC/content/cars').resolve() and (car / '.vj-conversion').read_text() == task['id']:
                shutil.rmtree(car, ignore_errors=True)
            self.remove_workspace(workspace)

    def run(self, once=False):
        lock_path = self.root / 'agent.lock'
        with lock_path.open('a+b') as lock:
            lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
            try:
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise SystemExit('Another converter agent is already running')
            jobs = self.root / 'jobs'
            if jobs.is_dir():
                for old in jobs.iterdir():
                    if old.is_dir() and re.fullmatch(r'job_[a-f0-9]{32}', old.name):
                        self.remove_workspace(old)
            cars = self.root / 'DummyAC/content/cars'
            if cars.is_dir():
                for old in cars.iterdir():
                    marker = old / '.vj-conversion'
                    if old.is_dir() and marker.is_file() and re.fullmatch(r'[a-f0-9-]{36}', marker.read_text()) and old.resolve().parent == cars.resolve():
                        shutil.rmtree(old, ignore_errors=True)
            self.heartbeat()
            thread = threading.Thread(target=self.maintain_heartbeat, daemon=True); thread.start()
            logging.info('Agent connected')
            try:
                while True:
                    try:
                        task = self.request('POST', '/api/converter-worker/claim', {'workerId': self.worker_id})
                        if task:
                            self.process(task)
                            if once:
                                return
                        if once:
                            return
                        self.stop.wait(3)
                    except Exception:
                        logging.warning('Queue unavailable; reconnecting')
                        if once:
                            raise
                        self.stop.wait(15)
                        try:
                            self.heartbeat()
                        except Exception:
                            pass
            finally:
                self.stop.set(); thread.join(timeout=3)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding='utf-8-sig'))
    root = Path(config['workRoot']); root.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(root / 'agent.log', maxBytes=1024 * 1024, backupCount=2, encoding='utf-8')
    logging.basicConfig(handlers=[handler], level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    # Startup can precede network access or a Render cold start.
    while True:
        try:
            Agent(config).run(args.once)
            return
        except Exception:
            logging.warning('Connection unavailable; retrying')
            if args.once:
                raise
            time.sleep(15)


if __name__ == '__main__':
    main()
