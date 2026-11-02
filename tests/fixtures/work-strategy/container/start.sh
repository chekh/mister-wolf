#!/bin/sh
# Runtime dispatch is implemented by src/profile_loader.py.
exec python /app/src/profile_loader.py "$@"
