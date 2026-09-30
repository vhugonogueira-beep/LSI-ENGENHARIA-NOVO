// Controle de acesso do LSI — fonte única.
//
// Todo mundo logado VÊ o sistema inteiro (GET é livre para quem tem sessão).
// O que muda de pessoa para pessoa são as AÇÕES, agrupadas nas permissões
// abaixo. ADMIN tem todas, e algumas ações são exclusivas dele (excluir
// registros, gerir usuários). A política por rota fica no fim deste arquivo:
// rota que altera dado e não casa com nenhuma regra é negada (só ADMIN passa),
// para rota nova nunca nascer aberta por esquecimento.

import { prisma } from '../server';

export const PERMISSOES = [
    { chave: 'atividades.gerenciar', rotulo: 'Atividades e projetos', descricao: 'Criar e editar atividades, projetos, cronograma, execução, APC e documentação' },
    { chave: 'orcamentos.gerenciar', rotulo: 'Orçamentos', descricao: 'Orçamentos, custo LS, negociações, LPUs e BDI' },
    { chave: 'pagamentos.solicitar', rotulo: 'Solicitar pagamentos', descricao: 'Contratações, parcelas, reembolsos, adiantamentos, prestação de contas, e-mails de solicitação e anexos (comprovantes e notas)' },
    { chave: 'pagamentos.baixar', rotulo: 'Registrar pagamentos', descricao: 'Marcar como pago, conferir e analisar prestação de contas' },
    { chave: 'pagamentos.aprovar', rotulo: 'Aprovar pagamentos', descricao: 'Aprovar ou recusar solicitações de quem precisa de aprovação' },
    { chave: 'faturamento.gerenciar', rotulo: 'PO e faturamento', descricao: 'POs, linhas de faturamento, lotes e recebimentos' },
    { chave: 'cadastros.gerenciar', rotulo: 'Cadastros', descricao: 'Fornecedores, funcionários, qualificações, clientes e sites' },
    { chave: 'configuracoes.gerenciar', rotulo: 'Configurações', descricao: 'Dados da empresa, contas, cartões, comunicação e modelos de contrato' },
] as const;

export type ChavePermissao = typeof PERMISSOES[number]['chave'];
const CHAVES = new Set<string>(PERMISSOES.map(p => p.chave));

/** Modelos para preencher o cadastro rápido; o admin ajusta depois. */
export const MODELOS_ACESSO: { id: string; rotulo: string; permissoes: ChavePermissao[]; aprovacao_pagamento: string }[] = [
    {
        id: 'ENGENHEIRO', rotulo: 'Engenheiro de projetos',
        permissoes: ['atividades.gerenciar', 'orcamentos.gerenciar', 'pagamentos.solicitar', 'faturamento.gerenciar', 'cadastros.gerenciar'],
        aprovacao_pagamento: 'ACIMA_DO_LIMITE',
    },
    {
        id: 'FINANCEIRO', rotulo: 'Financeiro',
        permissoes: ['pagamentos.solicitar', 'pagamentos.baixar', 'faturamento.gerenciar', 'cadastros.gerenciar'],
        aprovacao_pagamento: 'NUNCA',
    },
    { id: 'CONSULTA', rotulo: 'Somente consulta', permissoes: [], aprovacao_pagamento: 'NUNCA' },
];

export const PAPEIS = ['ADMIN', 'USUARIO'] as const;
export const APROVACOES = ['NUNCA', 'SEMPRE', 'ACIMA_DO_LIMITE'] as const;

export function filtrarPermissoes(valor: unknown): ChavePermissao[] {
    if (!Array.isArray(valor)) return [];
    return [...new Set(valor.filter((v): v is ChavePermissao => typeof v === 'string' && CHAVES.has(v)))];
}

/** Usuário da sessão, sempre relido do banco: suspender vale na hora. */
export interface UsuarioSessao {
    userId: string;
    tenantId: string;
    email: string;
    nome: string;
    role: string;
    permissoes: string[];
    aprovacao_pagamento: string;
    limite_pagamento: number | null;
}

export async function carregarUsuarioSessao(userId: string): Promise<UsuarioSessao | null> {
    const u = await prisma.user.findUnique({ where: { id: userId }, include: { permissoes: true } });
    if (!u || !u.ativo || u.status_acesso !== 'ATIVO') return null;
    return {
        userId: u.id, tenantId: u.tenant_id, email: u.email, nome: u.nome_exibicao || u.nome, role: u.role,
        permissoes: u.role === 'ADMIN' ? PERMISSOES.map(p => p.chave) : u.permissoes.map(p => p.chave),
        aprovacao_pagamento: u.aprovacao_pagamento, limite_pagamento: u.limite_pagamento,
    };
}

export const ehAdmin = (u?: { role?: string } | null) => u?.role === 'ADMIN';
export const temPermissao = (u: UsuarioSessao | null | undefined, chave: string) =>
    Boolean(u) && (ehAdmin(u) || u!.permissoes.includes(chave));

/**
 * Este usuário precisa de aprovação para pedir um pagamento deste valor?
 * ADMIN e quem aprova pagamentos nunca precisam.
 */
export function precisaAprovacao(u: UsuarioSessao | null | undefined, valor: number): boolean {
    if (!u || ehAdmin(u) || u.permissoes.includes('pagamentos.aprovar')) return false;
    if (u.aprovacao_pagamento === 'SEMPRE') return true;
    if (u.aprovacao_pagamento === 'ACIMA_DO_LIMITE') return valor > (u.limite_pagamento ?? 0);
    return false;
}

// ── Política por rota ──────────────────────────────────────────────────────
// Só métodos que alteram dados. `ADMIN` = exclusivo do administrador.
type Regra = [metodo: string, caminho: RegExp, exige: ChavePermissao | 'ADMIN' | 'LOGADO'];

const ID = '[^/]+';
export const POLITICA: Regra[] = [
    // O próprio usuário cuida do próprio perfil, senha e assinatura.
    ['*', /^\/api\/profile(\/|$)/, 'LOGADO'],
    ['*', /^\/api\/usuarios(\/|$)/, 'ADMIN'],
    ['*', /^\/api\/aprovacoes-pagamento(\/|$)/, 'pagamentos.aprovar'],

    // Exclusões de registro: só administrador (decisão de 30/09/2026).
    ['DELETE', new RegExp(`^/api/atividades/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/acionamentos/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/demandas/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/contratacoes/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/contratacoes/parcelas/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/reembolsos/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/reembolsos/pagamentos/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/prestacoes-contas/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/pos/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/pos/faturamento-linhas/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/suppliers/${ID}$`), 'ADMIN'],
    ['DELETE', new RegExp(`^/api/funcionarios/${ID}$`), 'ADMIN'],

    // Pagamentos: baixa (pago/comprovante/análise de prestação) separada da
    // solicitação. Mudar status para PAGO/CONFERIDO é conferido também dentro
    // dos controllers, porque a mesma rota serve para solicitar.
    // Anexar/remover comprovante fica com quem solicita: é o engenheiro que
    // recebe o comprovante e resolve o alerta de "comprovante pendente".
    ['*', /^\/api\/pagamentos\//, 'pagamentos.solicitar'],
    ['POST', new RegExp(`^/api/prestacoes-contas/${ID}/analisar$`), 'pagamentos.baixar'],
    ['POST', new RegExp(`^/api/reembolsos/${ID}/prestacao/analisar$`), 'pagamentos.baixar'],
    ['*', /^\/api\/payment-attachments(\/|$)/, 'pagamentos.solicitar'],
    ['*', /^\/api\/contratacoes(\/|$)/, 'pagamentos.solicitar'],
    ['*', /^\/api\/reembolsos(\/|$)/, 'pagamentos.solicitar'],
    ['*', /^\/api\/prestacoes-contas(\/|$)/, 'pagamentos.solicitar'],
    ['*', /^\/api\/contratos\/templates(\/|$)/, 'configuracoes.gerenciar'],
    ['*', /^\/api\/contratos(\/|$)/, 'pagamentos.solicitar'],

    // Atividades e o que vive dentro delas.
    ['*', /^\/api\/(atividades|acionamentos|demandas|apcs|cronograma|execucao|documentacao)(\/|$)/, 'atividades.gerenciar'],

    // Orçamento.
    ['*', /^\/api\/(budgets|negociacoes|pricebooks|bdi|inflation|import)(\/|$)/, 'orcamentos.gerenciar'],
    ['*', /^\/api\/(templates|catalog-services)(\/|$)/, 'orcamentos.gerenciar'],

    // Faturamento.
    ['*', /^\/api\/(pos|faturamento)(\/|$)/, 'faturamento.gerenciar'],

    // Cadastros.
    ['*', /^\/api\/(suppliers|funcionarios|qualificacoes|clientes|contratantes|contratantes-upsert|sites)(\/|$)/, 'cadastros.gerenciar'],

    // Configurações.
    ['*', /^\/api\/(empresa|email-config)(\/|$)/, 'configuracoes.gerenciar'],
];

export function exigenciaDaRota(metodo: string, caminho: string): ChavePermissao | 'ADMIN' | 'LOGADO' {
    for (const [m, re, exige] of POLITICA) {
        if ((m === '*' || m === metodo) && re.test(caminho)) return exige;
    }
    return 'ADMIN'; // rota que altera dado sem regra: fechada até alguém decidir
}
