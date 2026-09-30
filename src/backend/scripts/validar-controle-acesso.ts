/**
 * Controle de acesso de ponta a ponta, contra a API em execução.
 *
 * Caso real: Victor (administrador) convida engenheiros como Iago, Kaique e
 * Rodolfo, escolhe o que cada um pode fazer e até quanto pode pedir de
 * pagamento sem aprovação. Este roteiro confere que isso vale no servidor —
 * esconder botão na tela não protege nada.
 *
 *   1. sem sessão, a API recusa (401); só login, convite, saúde e IBGE são públicos
 *   2. convite → aceite com senha → login; o link morre depois de usado
 *   3. permissão por ação: consulta não cadastra, engenheiro não mexe em
 *      configuração nem em usuários, e excluir é só do administrador (403)
 *   4. pagamento acima do limite vai para aprovação; abaixo, sai direto;
 *      quem pede não aprova o próprio pedido; aprovado, a solicitação passa
 *   5. suspender corta a sessão na hora, sem esperar o token vencer
 *
 * Cria um administrador de teste direto no banco (única coisa que não passa
 * pela API, porque ninguém sabe a senha dos administradores reais) e apaga
 * tudo o que criou no fim — usuários, atividade, adiantamentos e aprovações.
 *
 *   npx tsx src/backend/scripts/validar-controle-acesso.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();

const SUFIXO = Date.now().toString(36);
const email = (quem: string) => `teste-acesso-${quem}-${SUFIXO}@lsoffice.invalid`;
const SENHA = 'TesteAcesso2026';
const TESTE = 'Teste automatizado de controle de acesso — pode apagar';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}

async function api(caminho: string, init: { method?: string; token?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    const r = await fetch(`${API}${caminho}`, {
        method: init.method || 'GET', headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const corpo = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, corpo } as { status: number; ok: boolean; corpo: any };
}
const detalhe = (r: { status: number; corpo: any }) => `HTTP ${r.status} ${r.corpo?.error || ''}`.trim();

async function entrar(emailUsuario: string) {
    const r = await api('/auth/login', { method: 'POST', body: { email: emailUsuario, senha: SENHA } });
    return r.ok ? String(r.corpo.token) : '';
}

/** Convida pela API como o admin, aceita o convite e devolve id + token de sessão. */
async function convidarEAtivar(tokenAdmin: string, quem: string, acesso: Record<string, unknown>) {
    const convite = await api('/usuarios', {
        method: 'POST', token: tokenAdmin,
        body: { nome: `Teste ${quem}`, email: email(quem), cargo: 'Engenheiro (teste)', ...acesso },
    });
    if (!convite.ok) return { id: '', token: '', convite };
    const link = convite.corpo.token_convite as string;
    const aceite = await api(`/auth/convite/${link}`, { method: 'POST', body: { senha: SENHA } });
    return { id: convite.corpo.usuario.id as string, token: aceite.ok ? await entrar(email(quem)) : '', convite, link, aceite };
}

async function main() {
    const saude = await api('/health');
    if (!saude.ok) {
        console.log(`\nBackend fora do ar em ${API} — suba com "npm run dev:backend" e rode de novo.`);
        process.exitCode = 1;
        return;
    }

    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('Nenhum tenant cadastrado');
    const criados = { usuarios: [] as string[], atividade: '', reembolsos: [] as string[] };

    try {
        // ── Administrador de teste ──────────────────────────────────────────
        const admin = await prisma.user.create({
            data: {
                tenant_id: tenant.id, nome: 'Teste Admin Acesso', email: email('admin'),
                senha_hash: await bcrypt.hash(SENHA, 10), role: 'ADMIN', status_acesso: 'ATIVO',
            },
        });
        criados.usuarios.push(admin.id);
        const tokenAdmin = await entrar(admin.email);
        conferir('administrador de teste entra', Boolean(tokenAdmin));
        if (!tokenAdmin) return;

        // ── 1. Sem sessão ───────────────────────────────────────────────────
        console.log('\n── 1. Sem sessão');
        for (const [metodo, caminho] of [
            ['GET', '/atividades/carteira'], ['GET', '/reembolsos'], ['GET', '/suppliers'],
            ['POST', '/suppliers'], ['DELETE', '/atividades/qualquer-id'], ['GET', '/usuarios'],
        ] as const) {
            const r = await api(caminho, { method: metodo, body: metodo === 'GET' ? undefined : {} });
            conferir(`${metodo} ${caminho} recusa sem token`, r.status === 401, detalhe(r));
        }
        const falso = await api('/atividades/carteira', { token: 'token.invalido.qualquer' });
        conferir('token forjado é recusado', falso.status === 401, detalhe(falso));
        conferir('/health continua público', saude.ok);
        const ibge = await api('/localidades/municipios?uf=AM&q=labrea');
        conferir('base IBGE continua pública', ibge.ok && ibge.corpo?.[0]?.nome === 'Lábrea', detalhe(ibge));

        // ── 2. Convite ──────────────────────────────────────────────────────
        console.log('\n── 2. Convite → aceite → login');
        const catalogo = await api('/usuarios/catalogo', { token: tokenAdmin });
        const modelo = (catalogo.corpo?.modelos || []).find((m: any) => m.id === 'ENGENHEIRO');
        conferir('catálogo traz o modelo Engenheiro', Boolean(modelo), detalhe(catalogo));

        const eng = await convidarEAtivar(tokenAdmin, 'engenheiro', {
            permissoes: modelo?.permissoes || ['atividades.gerenciar', 'pagamentos.solicitar'],
            aprovacao_pagamento: 'ACIMA_DO_LIMITE', limite_pagamento: 500,
        });
        if (eng.id) criados.usuarios.push(eng.id);
        conferir('admin convida engenheiro', eng.convite.status === 201, detalhe(eng.convite));
        conferir('convite nasce CONVIDADO', eng.convite.corpo?.usuario?.status_acesso === 'CONVIDADO');
        conferir('aceite com senha ativa o acesso', Boolean(eng.aceite?.ok), eng.aceite ? detalhe(eng.aceite) : '');
        conferir('engenheiro entra com a senha que escolheu', Boolean(eng.token));
        if (eng.link) {
            const reuso = await api(`/auth/convite/${eng.link}`, { method: 'POST', body: { senha: 'OutraSenha123' } });
            conferir('link de convite não serve duas vezes', reuso.status === 404, detalhe(reuso));
        }
        const fraca = await api('/usuarios', { method: 'POST', token: tokenAdmin, body: { nome: 'x', email: 'invalido' } });
        conferir('e-mail inválido é recusado', fraca.status === 400, detalhe(fraca));
        const dup = await api('/usuarios', { method: 'POST', token: tokenAdmin, body: { nome: 'Dup', email: email('engenheiro') } });
        conferir('e-mail repetido é recusado', dup.status === 409, detalhe(dup));
        const semLimite = await api('/usuarios', {
            method: 'POST', token: tokenAdmin,
            body: { nome: 'Sem limite', email: email('semlimite'), aprovacao_pagamento: 'ACIMA_DO_LIMITE' },
        });
        conferir('"acima do limite" exige o valor do limite', semLimite.status === 400, detalhe(semLimite));

        const consulta = await convidarEAtivar(tokenAdmin, 'consulta', { permissoes: [] });
        if (consulta.id) criados.usuarios.push(consulta.id);
        conferir('usuário de consulta ativo', Boolean(consulta.token));

        const me = await api('/auth/me', { token: eng.token });
        conferir('/auth/me devolve as permissões do engenheiro',
            Array.isArray(me.corpo?.permissoes) && me.corpo.permissoes.includes('pagamentos.solicitar'), detalhe(me));

        // ── 3. Permissão por ação ───────────────────────────────────────────
        console.log('\n── 3. Permissão por ação');
        const verCarteira = await api('/atividades/carteira', { token: consulta.token });
        conferir('consulta enxerga a carteira (leitura é livre)', verCarteira.ok, detalhe(verCarteira));
        const cadastrar = await api('/suppliers', { method: 'POST', token: consulta.token, body: { nome: 'Fornecedor de teste' } });
        conferir('consulta não cadastra fornecedor', cadastrar.status === 403, detalhe(cadastrar));
        const pedir = await api('/reembolsos', { method: 'POST', token: consulta.token, body: {} });
        conferir('consulta não solicita pagamento', pedir.status === 403, detalhe(pedir));

        const usuariosEng = await api('/usuarios', { token: eng.token });
        conferir('engenheiro não lista usuários', usuariosEng.status === 403, detalhe(usuariosEng));
        const convidarEng = await api('/usuarios', { method: 'POST', token: eng.token, body: { nome: 'x', email: email('x') } });
        conferir('engenheiro não convida ninguém', convidarEng.status === 403, detalhe(convidarEng));
        const empresa = await api('/empresa', { method: 'PUT', token: eng.token, body: {} });
        conferir('engenheiro não altera configurações da empresa', empresa.status === 403, detalhe(empresa));
        const aprovar = await api('/aprovacoes-pagamento/qualquer-id', { method: 'PUT', token: eng.token, body: { decisao: 'APROVADA' } });
        conferir('engenheiro não aprova pagamentos', aprovar.status === 403, detalhe(aprovar));

        const atividade = await api('/atividades', {
            method: 'POST', token: eng.token,
            body: {
                titulo: 'Vistoria — teste de acesso', tipo_demanda: 'OPERACAO', subtipo_demanda: 'VISTORIA',
                sharing: 'HIGHLINE', id_site_sharing: `TSTAC${SUFIXO.slice(-3)}`, id_site_operadora: `TSTAC${SUFIXO.slice(-3)}`,
                modelo_operacao: 'EXECUCAO_DIRETA', descricao: TESTE,
            },
        });
        conferir('engenheiro cria atividade', atividade.ok, detalhe(atividade));
        if (atividade.ok) criados.atividade = atividade.corpo.id;
        const autorForjado = await api(`/atividades/${criados.atividade || 'x'}`, {
            method: 'DELETE', token: eng.token,
            body: { motivo: 'Tentativa de exclusão pelo engenheiro', autor: { role: 'ADMIN', nome: 'Forjado' } },
        });
        conferir('engenheiro não exclui atividade — nem se declarando ADMIN no corpo', autorForjado.status === 403, detalhe(autorForjado));

        // ── 4. Aprovação de pagamento ───────────────────────────────────────
        console.log('\n── 4. Aprovação acima do limite (R$ 500)');
        if (!criados.atividade) {
            conferir('bloco de aprovação precisa da atividade de teste', false);
        } else {
            const hoje = new Date().toISOString().slice(0, 10);
            const adiantamento = (valor: number) => api('/reembolsos', {
                method: 'POST', token: eng.token,
                body: {
                    atividade_id: criados.atividade, natureza: 'ADIANTAMENTO', favorecido_nome: 'Técnico de teste',
                    forma_pagamento: 'PIX', valor_adiantado: valor, destino: 'Teste', motivo: TESTE, data_solicitacao: hoje,
                },
            });

            const baixo = await adiantamento(300);
            if (baixo.corpo?.id) criados.reembolsos.push(baixo.corpo.id);
            const depBaixo = baixo.corpo?.id
                ? await prisma.reembolsoPagamento.findFirst({ where: { reembolso_id: baixo.corpo.id } }) : null;
            conferir('R$ 300 (abaixo do limite) sai direto como SOLICITADO', depBaixo?.status === 'SOLICITADO',
                depBaixo ? `status ${depBaixo.status}` : detalhe(baixo));

            const alto = await adiantamento(1000);
            if (alto.corpo?.id) criados.reembolsos.push(alto.corpo.id);
            const depAlto = alto.corpo?.id
                ? await prisma.reembolsoPagamento.findFirst({ where: { reembolso_id: alto.corpo.id } }) : null;
            conferir('R$ 1.000 (acima do limite) fica PENDENTE', depAlto?.status === 'PENDENTE',
                depAlto ? `status ${depAlto.status}` : detalhe(alto));

            const pedido = depAlto
                ? await prisma.aprovacaoPagamento.findFirst({ where: { registro_id: { in: [depAlto.id, alto.corpo.id] }, status: 'PENDENTE' } })
                : null;
            conferir('pedido entra na fila de aprovação com o valor certo', pedido?.valor === 1000, pedido ? `valor ${pedido.valor}` : 'sem pedido');
            conferir('pedido registra quem solicitou', pedido?.solicitante_id === eng.id);

            const filaEng = await api('/aprovacoes-pagamento', { token: eng.token });
            conferir('engenheiro vê o próprio pedido na fila',
                filaEng.ok && (filaEng.corpo || []).some((l: any) => l.id === pedido?.id), detalhe(filaEng));

            if (pedido && depAlto) {
                const semMotivo = await api(`/aprovacoes-pagamento/${pedido.id}`, { method: 'PUT', token: tokenAdmin, body: { decisao: 'RECUSADA' } });
                conferir('recusar exige motivo', semMotivo.status === 400, detalhe(semMotivo));

                const antes = await api(`/reembolsos/pagamentos/${depAlto.id}/status`, { method: 'PUT', token: eng.token, body: { status: 'SOLICITADO' } });
                conferir('sem aprovação, a solicitação não passa', antes.status === 409 || antes.status === 403, detalhe(antes));

                const decisao = await api(`/aprovacoes-pagamento/${pedido.id}`, { method: 'PUT', token: tokenAdmin, body: { decisao: 'APROVADA' } });
                conferir('administrador aprova', decisao.ok && decisao.corpo?.status === 'APROVADA', detalhe(decisao));
                const denovo = await api(`/aprovacoes-pagamento/${pedido.id}`, { method: 'PUT', token: tokenAdmin, body: { decisao: 'RECUSADA', motivo: 'mudei de ideia' } });
                conferir('pedido decidido não é decidido de novo', denovo.status === 400, detalhe(denovo));

                const depois = await api(`/reembolsos/pagamentos/${depAlto.id}/status`, { method: 'PUT', token: eng.token, body: { status: 'SOLICITADO' } });
                const depFinal = await prisma.reembolsoPagamento.findUnique({ where: { id: depAlto.id } });
                conferir('aprovado, o engenheiro solicita normalmente', depois.ok && depFinal?.status === 'SOLICITADO',
                    `${detalhe(depois)} · status ${depFinal?.status}`);

                const baixa = await api(`/reembolsos/pagamentos/${depAlto.id}/status`, { method: 'PUT', token: eng.token, body: { status: 'PAGO' } });
                conferir('engenheiro sem "registrar pagamentos" não marca como PAGO', baixa.status === 403, detalhe(baixa));
            }

            // Quem aprova não pode aprovar o próprio pedido: um aprovador que
            // também pede, com regra SEMPRE, não é liberado pela própria permissão
            // (precisaAprovacao devolve falso para quem aprova — então conferimos
            // a guarda direta da rota com um pedido de outra pessoa).
            const auto = pedido
                ? await prisma.aprovacaoPagamento.create({
                    data: {
                        tenant_id: tenant.id, origem: 'DEPOSITO', registro_id: `teste-${SUFIXO}`, descricao: TESTE,
                        valor: 10, solicitante_id: admin.id,
                    },
                })
                : null;
            if (auto) {
                const proprio = await api(`/aprovacoes-pagamento/${auto.id}`, { method: 'PUT', token: tokenAdmin, body: { decisao: 'APROVADA' } });
                conferir('ninguém aprova o próprio pedido — nem o administrador', proprio.status === 400, detalhe(proprio));
            }
        }

        // ── 5. Suspensão ────────────────────────────────────────────────────
        console.log('\n── 5. Suspensão');
        const suspender = await api(`/usuarios/${eng.id}/status`, { method: 'PUT', token: tokenAdmin, body: { status: 'SUSPENSO' } });
        conferir('administrador suspende o engenheiro', suspender.ok, detalhe(suspender));
        const aposSuspensao = await api('/atividades/carteira', { token: eng.token });
        conferir('token ainda válido deixa de funcionar na hora', aposSuspensao.status === 401, detalhe(aposSuspensao));
        const loginSuspenso = await api('/auth/login', { method: 'POST', body: { email: email('engenheiro'), senha: SENHA } });
        conferir('suspenso não consegue entrar de novo', !loginSuspenso.ok, detalhe(loginSuspenso));
        const autoSuspender = await api(`/usuarios/${admin.id}/status`, { method: 'PUT', token: tokenAdmin, body: { status: 'SUSPENSO' } });
        conferir('administrador não suspende a si mesmo', autoSuspender.status === 400, detalhe(autoSuspender));

        const trilha = await prisma.auditLog.count({
            where: { entidade: 'User', entidade_id: { in: criados.usuarios }, user_id: admin.id },
        });
        conferir('convites e suspensão ficam na auditoria com o autor do login', trilha >= 3, `${trilha} registro(s)`);
    } finally {
        // ── Limpeza ─────────────────────────────────────────────────────────
        const depositos = criados.reembolsos.length
            ? (await prisma.reembolsoPagamento.findMany({ where: { reembolso_id: { in: criados.reembolsos } }, select: { id: true } })).map(d => d.id)
            : [];
        await prisma.aprovacaoPagamento.deleteMany({
            where: { OR: [{ solicitante_id: { in: criados.usuarios } }, { registro_id: { in: [...depositos, ...criados.reembolsos] } }] },
        });
        if (criados.reembolsos.length) await prisma.reembolso.deleteMany({ where: { id: { in: criados.reembolsos } } });
        if (criados.atividade) {
            // Pelo banco, e não pela API: o objetivo aqui é só não deixar sobra.
            await prisma.atividadeStatusHistorico.deleteMany({ where: { atividade_id: criados.atividade } }).catch(() => undefined);
            await prisma.documentoAtividade.deleteMany({ where: { atividade_id: criados.atividade } }).catch(() => undefined);
            await prisma.atividade.delete({ where: { id: criados.atividade } }).catch(e => console.log(`   (limpeza) atividade de teste ficou: ${e.message}`));
        }
        await prisma.auditLog.deleteMany({ where: { OR: [{ entidade_id: { in: criados.usuarios } }, { user_id: { in: criados.usuarios } }] } });
        await prisma.user.deleteMany({ where: { id: { in: criados.usuarios } } });
        const sobra = await prisma.user.count({ where: { email: { contains: `-${SUFIXO}@lsoffice.invalid` } } });
        conferir('limpeza: nenhum usuário de teste sobrou', sobra === 0, `${sobra} sobrando`);
        await prisma.$disconnect();
    }
}

main()
    .then(() => {
        console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
        if (falhas) process.exitCode = 1;
    })
    .catch(async e => {
        console.error(e);
        await prisma.$disconnect();
        process.exitCode = 1;
    });
