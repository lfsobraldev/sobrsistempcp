#!/usr/bin/env bash
set -euo pipefail
ZIP="${1:-sobral-pcp-atualizacao.zip}"
if [[ ! -f "$ZIP" ]]; then echo "ZIP não encontrado: $ZIP"; exit 1; fi
if [[ ! -d .git ]]; then echo "Execute na raiz do repositório sobrsistempcp"; exit 1; fi
if [[ -n "$(git status --porcelain)" ]]; then echo 'Existem alterações locais. Faça commit ou stash antes de continuar.'; exit 1; fi
python3 - "$ZIP" <<'PY'
import zipfile, sys, pathlib
path=sys.argv[1]
with zipfile.ZipFile(path) as z:
  files=[e for e in z.infolist() if not e.is_dir()]
  for e in files:
    p=pathlib.PurePosixPath(e.filename)
    if p.is_absolute() or '..' in p.parts or not e.filename.endswith(('.ts','.tsx','.css','.sql')):
      raise ValueError('Entrada ZIP insegura ou inesperada: '+e.filename)
  for e in files:
    p=pathlib.Path(e.filename)
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_bytes(z.read(e))
print(f'{len(files)} arquivos aplicados.')
PY
if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
npm run build
# Nunca confirma deploy sem validar build.
git add -- app lib tests types database
if git diff --cached --quiet; then echo 'Sem mudanças para publicar.'; exit 0; fi
git commit -m "Aplicar atualização Claude: OF, montagem, gerente e IA"
git push origin HEAD:main
echo 'Commit enviado. Verifique o deploy na Vercel (Ready) e execute a migração SQL se necessária.'
