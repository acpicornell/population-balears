#!/usr/bin/env python3
"""Local dev server: serves web/ with the same no-cache behaviour as prod.

    python web/dev_server.py        # -> http://localhost:8175/

Static-only; no build step. Edit files and reload.
"""
import functools
import http.server
import pathlib

PORT = 8175
ROOT = pathlib.Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"poblacio dev server → http://localhost:{PORT}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
