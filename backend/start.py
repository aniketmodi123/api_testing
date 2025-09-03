#!/usr/bin/env python3
import os
import subprocess

def main():
    """Start the FastAPI application with appropriate settings for the environment."""

    # Check if we're in production (Render sets this)
    is_production = os.environ.get('RENDER')
    port = os.environ.get('PORT', '8000')

    if is_production:
        # Production: Use gunicorn with uvicorn workers
        cmd = [
            'gunicorn',
            'src.main:app',
            '-w', '1',  # Number of workers
            '-k', 'uvicorn.workers.UvicornWorker',
            '--bind', f'0.0.0.0:{port}',
            '--timeout', '120',
            '--access-logfile', '-',
            '--error-logfile', '-'
        ]
    else:
        # Development: Use uvicorn directly
        cmd = [
            'uvicorn',
            'src.main:app',
            '--host', '0.0.0.0',
            '--port', port,
            '--reload'
        ]

    print(f"Starting server with command: {' '.join(cmd)}")
    subprocess.run(cmd)

if __name__ == '__main__':
    main()
