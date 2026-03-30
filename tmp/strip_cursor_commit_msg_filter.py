#!/usr/bin/env python3
"""Leest een commit-bericht op stdin, schrijft het zonder Cursor-footers naar stdout."""
import re
import sys

_LINE_PATTERNS = (
    re.compile(r"Made-with:\s*Cursor\s*", re.I),
    re.compile(r"Made with Cursor\s*", re.I),
)


def strip_cursor_lines(text: str) -> str:
    lines = text.splitlines()
    kept: list[str] = []
    for line in lines:
        if any(p.fullmatch(line) for p in _LINE_PATTERNS):
            continue
        kept.append(line)
    while kept and kept[-1] == "":
        kept.pop()
    out = "\n".join(kept)
    if out:
        out += "\n"
    return out


if __name__ == "__main__":
    sys.stdout.write(strip_cursor_lines(sys.stdin.read()))
