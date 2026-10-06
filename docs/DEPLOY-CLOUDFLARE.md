# LSI na internet — Cloudflare Tunnel

Decisão de 01/10/2026: o sistema continua rodando no PC do escritório e a
Cloudflare entrega um endereço público com HTTPS até ele. Banco (`prisma/dev.db`)
e anexos (`storage/`) não saem da máquina.

Por que não a Vercel: ela só publica as telas. O backend Express, o SQLite e os
anexos em disco precisam de um servidor ligado o tempo todo e de disco
permanente — na Vercel o login responde 405 porque não existe API lá.

## Como funciona

```
navegador ──HTTPS──▶ Cloudflare ──túnel──▶ cloudflared (PC) ──▶ localhost:3001
                                                               telas (dist/) + /api
```

- `server.ts` entrega as telas compiladas de `dist/` quando a pasta existe, e
  manda qualquer rota que não é `/api` para o `index.html` (rotas do React).
- CORS aceita a **mesma origem** (a tela servida por este servidor) e os
  endereços em `PUBLIC_ORIGINS` no `.env`, separados por vírgula.
- `trust proxy` ligado: o IP real do visitante vem do túnel.
- Login: no máximo 10 tentativas por IP + e-mail a cada 15 minutos (429).

## Antes de publicar — obrigatório

1. **Trocar as senhas** das 4 contas criadas pelo seed antigo. As senhas
   antigas estão no histórico do GitHub; o `seed.ts` hoje gera senhas
   aleatórias, mas isso não muda o banco atual.
   - a sua: Meu Perfil → Acesso e senha;
   - `admin@`, `comercial@`, `operacoes@`: Configurações → Usuários e acessos →
     gerar link de redefinição, ou suspender.
2. **Trocar o `JWT_SECRET`** no `.env` por um valor novo e longo. Todos
   precisam entrar de novo depois. *Feito em 06/10/2026 (96 caracteres aleatórios).*

Situação em 06/10/2026: as 4 senhas do seed antigo ainda valiam. Decisão do
dono: manter `admin@`, `comercial@` e `operacoes@` como estão por enquanto —
por isso o **Cloudflare Access** (abaixo) deixa de ser opcional: é ele que
impede quem leu o repositório de chegar à tela de login.

## Teste rápido (endereço temporário)

1. `winget install --id Cloudflare.cloudflared`
2. Dar dois cliques em `iniciar-internet.bat`.
3. Copiar o endereço `https://…trycloudflare.com` que aparece na janela.

O endereço muda a cada vez que o túnel reinicia. Não exige conta.

## Endereço fixo (ex.: lsi.lsoffice.com.br)

Exige o DNS de `lsoffice.com.br` na Cloudflare.

```
cloudflared tunnel login
cloudflared tunnel create lsi
cloudflared tunnel route dns lsi lsi.lsoffice.com.br
```

Criar `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: lsi
credentials-file: C:\Users\MAC-LS-VICTOR-HUGO\.cloudflared\<ID-DO-TUNEL>.json
ingress:
  - hostname: lsi.lsoffice.com.br
    service: http://localhost:3001
  - service: http_status:404
```

No `iniciar-internet.bat`, preencher `SET TUNEL=lsi`. No `.env`, acrescentar
`PUBLIC_ORIGINS=https://lsi.lsoffice.com.br`.

## Camada extra recomendada — Cloudflare Access

Zero Trust → Access → Applications → Self-hosted → `lsi.lsoffice.com.br`.
Política: permitir e-mails terminados em `@lsoffice.com.br`. Grátis até 50
usuários. A pessoa confirma um código no e-mail antes de ver a tela de login do
LSI — protege mesmo se uma senha vazar. A página `/convite/:token` também passa
pelo Access; quem é convidado precisa ter e-mail `@lsoffice.com.br`.

## Limites conhecidos

- O sistema só fica no ar com o PC ligado. Para religar sozinho após reinício:
  `cloudflared service install` (túnel fixo) e o servidor como tarefa agendada
  "ao fazer logon" apontando para `iniciar-internet.bat`.
- Backup: `prisma/dev.db` e `storage/` continuam sendo o dado inteiro — copiar os
  dois.
