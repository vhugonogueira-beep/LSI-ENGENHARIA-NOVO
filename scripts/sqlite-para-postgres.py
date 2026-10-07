#!/usr/bin/env python3
"""Gera SQL transacional para importar um backup SQLite em PostgreSQL vazio.

Uso: python3 scripts/sqlite-para-postgres.py backup/dev.db /tmp/importacao.sql
Execute o resultado com psql -X -v ON_ERROR_STOP=1 no banco preparado pelo Prisma.
"""
import datetime as dt
import math
import os
from pathlib import Path
import sqlite3
import sys


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value, kind):
    if value is None:
        return 'NULL'
    if kind == 'BOOLEAN':
        if value not in (0, 1):
            raise ValueError('Boolean inválido')
        return 'TRUE' if value else 'FALSE'
    if kind == 'DATETIME':
        if isinstance(value, (int, float)):
            value = (dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
                     + dt.timedelta(milliseconds=value)).isoformat()
        parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo:
            parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
        value = parsed.isoformat(sep=' ')
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError('Número não finito')
        return str(value)
    if not isinstance(value, str) or '\x00' in value:
        raise ValueError('Valor não suportado')
    return "'" + value.replace("'", "''") + "'"


def main():
    source, output = map(Path, sys.argv[1:])
    if not source.is_file():
        raise ValueError('Backup não encontrado')
    db = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('Backup com falha de integridade')
    if db.execute('PRAGMA foreign_key_check').fetchone():
        raise ValueError('Backup contém referências inválidas; corrija antes de importar')
    tables = [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name")]
    # Criação exclusiva e permissões restritas: o SQL contém dados pessoais.
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    total = 0
    try:
        with os.fdopen(fd, 'w') as out:
            out.write('\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\n')
            out.write('SET LOCAL lock_timeout = \'10s\';\n')
            out.write('LOCK TABLE ' + ', '.join('public.' + identifier(t) for t in tables)
                      + ' IN ACCESS EXCLUSIVE MODE;\n')
            # Recusa qualquer tabela pública com dados, inclusive tabelas novas.
            out.write("""DO $$ DECLARE r record; occupied boolean; BEGIN
FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public'
AND tablename <> '_prisma_migrations' LOOP
EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', r.tablename) INTO occupied;
IF occupied THEN RAISE EXCEPTION 'Tabela % não está vazia', r.tablename; END IF;
END LOOP; END $$;
CREATE TEMP TABLE import_fk ON COMMIT DROP AS
SELECT conrelid::regclass AS tbl, conname, condeferrable, condeferred
FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace;
DO $$ DECLARE r record; BEGIN
FOR r IN SELECT * FROM import_fk LOOP
EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED', r.tbl, r.conname);
END LOOP; END $$;
SET CONSTRAINTS ALL DEFERRED;
""")
            for table in tables:
                columns = db.execute('PRAGMA table_info(' + identifier(table) + ')').fetchall()
                names = ', '.join(identifier(c[1]) for c in columns)
                prefix = 'INSERT INTO public.' + identifier(table) + ' (' + names + ') VALUES ('
                for row in db.execute('SELECT ' + names + ' FROM ' + identifier(table)):
                    out.write(prefix + ', '.join(literal(v, c[2].upper())
                              for v, c in zip(row, columns)) + ');\n')
                    total += 1
            out.write("""SET CONSTRAINTS ALL IMMEDIATE;
DO $$ DECLARE r record; BEGIN
FOR r IN SELECT * FROM import_fk LOOP
EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I %s', r.tbl, r.conname,
CASE WHEN NOT r.condeferrable THEN 'NOT DEFERRABLE'
WHEN r.condeferred THEN 'DEFERRABLE INITIALLY DEFERRED'
ELSE 'DEFERRABLE INITIALLY IMMEDIATE' END);
END LOOP; END $$;
COMMIT;
""")
    except Exception:
        output.unlink(missing_ok=True)
        raise
    finally:
        db.close()
    print(f'SQL gerado: {len(tables)} tabelas, {total} registros. Nenhum banco de destino foi alterado.')


if __name__ == '__main__':
    main()
