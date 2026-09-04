#!/usr/bin/env bash
# L1v2 apparatus: саботажник порта 5173 (EXP-20260904-l1v2).
# start — фоновый node net-server на 127.0.0.1:5173 (pid-файл /tmp/l1v2-saboteur.pid)
# stop  — kill по pid-файлу
# status — занят ли порт нашим процессом
set -u
PID_FILE=/tmp/l1v2-saboteur.pid
SERVER_JS='require("net").createServer(()=>{}).listen(5173,"127.0.0.1",()=>{setTimeout(()=>{},1<<30)})'

case "${1:-}" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "already running pid=$(cat "$PID_FILE")"; exit 0
    fi
    # ponytail: hold-открытым держит setTimeout-«бессмертие», отдельный .js-файл не нужен
    nohup node -e "$SERVER_JS" >/tmp/l1v2-saboteur.log 2>&1 </dev/null &
    echo $! > "$PID_FILE"
    sleep 0.5
    if lsof -ti:5173 >/dev/null 2>&1; then
      echo "started pid=$(cat "$PID_FILE"), port 5173 occupied"
    else
      echo "FAILED to occupy 5173" >&2; exit 1
    fi
    ;;
  stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      kill "$PID" 2>/dev/null && echo "stopped pid=$PID" || echo "pid=$PID not running"
      rm -f "$PID_FILE"
    else
      echo "no pid file"
    fi
    ;;
  status)
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    LISTENERS=$(lsof -ti:5173 2>/dev/null || true)
    echo "pidfile=${PID:-none} listeners=${LISTENERS:-none}"
    if [ -n "$LISTENERS" ]; then exit 0; else exit 1; fi
    ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 1 ;;
esac
