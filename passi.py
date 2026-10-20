"""Mostra nel terminale i passi della M1 (da docs/PROMPT-M1.md).

    python passi.py       elenco dei passi
    python passi.py 3     il prompt del passo 3, pronto da copiare in Claude Code
"""
import re
import sys
from pathlib import Path

testo = (Path(__file__).parent / "docs" / "PROMPT-M1.md").read_text(encoding="utf-8")
passi = re.findall(r"^## (Passo (\d+) · .+?)\n(.*?)(?=^## |\Z)", testo, re.S | re.M)

if len(sys.argv) < 2:
    for titolo, _, _ in passi:
        print(titolo)
    print("\nUsa: python passi.py <numero>")
    sys.exit(0)

for titolo, n, corpo in passi:
    if n == sys.argv[1]:
        prompt = re.search(r"```\n(.*?)\n```", corpo, re.S)
        resto = re.sub(r"```\n.*?\n```", "", corpo, flags=re.S).strip()
        print(f"\n=== {titolo} ===\n")
        print(prompt.group(1) if prompt else "")
        if resto:
            print(f"\n{resto}")
        print()
        break
else:
    sys.exit(f"Passo {sys.argv[1]} non trovato: usa un numero da 0 a {len(passi) - 1}.")
