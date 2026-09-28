/**
 * O e-mail sempre diz o que está sendo pago.
 *
 * Defeito que originou este teste: a linha "Descrição" era suprimida quando
 * igual ao motivo, e a linha "Motivo" era suprimida quando igual à descrição.
 * As duas se apagavam uma à outra. No reembolso isso era garantido — o
 * controller manda o mesmo `r.motivo` nos dois campos — e o e-mail chegava ao
 * financeiro sem dizer o que estava sendo pago.
 *
 * A regra agora: a descrição sai sempre; o motivo só quando acrescenta.
 *
 *   npx tsx src/backend/scripts/validar-motivo-no-email.ts
 */
import { gerarEmailCorporativo, type DadosEmail, type TipoSolicitacao } from '../services/email-corporativo.service';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}

/** Texto visível do corpo: sem comentários, sem <style>, sem a prévia oculta. */
function visivel(html: string): string {
    return html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<div style="display:none[\s\S]*?<\/div>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ');
}

const vezes = (texto: string, alvo: string) => texto.split(alvo).length - 1;

// O caso real: reembolso do Victor Hugo, MGBLH118.
const MOTIVO = 'Pagamento para o Técnico Paulo Martins referente a contratação de um serralheiro para abrir as soldas de caixa de passagem e QTMs';

const base: DadosEmail = {
    tipo: 'REEMBOLSO',
    tipo_demanda: 'OPERACAO',
    site: 'MGBLH118',
    nome_site: 'MGBLH118',
    cliente: 'OI',
    sharing: 'HIGHLINE',
    favorecido: 'VICTOR HUGO NOGUEIRA DA SILVA',
    nome_colaborador: 'VICTOR HUGO NOGUEIRA DA SILVA',
    cpf_cnpj_pagamento: '80460020200',
    forma_pagamento: 'PIX',
    pix: '91981047902',
    tipo_pix: 'TELEFONE',
    banco: 'Banco Inter',
    valor_pagamento: 150,
    valor_total: 150,
    data_despesa: '2026-09-24',
    nome_solicitante: 'Victor Hugo Nogueira da Silva',
    cargo_solicitante: 'Engenharia · LS Office',
};

console.log('\n── Reembolso: descrição e motivo com o MESMO texto');
console.log('   (é o que reembolso.controller.ts sempre manda)');
{
    const { html } = gerarEmailCorporativo({ ...base, descricao: MOTIVO, motivo_reembolso: MOTIVO });
    const texto = visivel(html);
    conferir('o motivo do pagamento aparece no e-mail', texto.includes(MOTIVO));
    conferir('aparece uma vez só, não duas', vezes(texto, MOTIVO) === 1, `${vezes(texto, MOTIVO)}x`);
    conferir('sob o rótulo Descrição', /Descrição\s+Pagamento para o Técnico/.test(texto));
}

console.log('\n── Descrição e motivo DIFERENTES: os dois saem');
{
    const outro = 'Reembolso de despesa adiantada pelo colaborador';
    const { html } = gerarEmailCorporativo({ ...base, descricao: MOTIVO, motivo_reembolso: outro });
    const texto = visivel(html);
    conferir('a descrição aparece', texto.includes(MOTIVO));
    conferir('o motivo distinto também aparece', texto.includes(outro));
}

console.log('\n── Só o motivo preenchido');
{
    const { html } = gerarEmailCorporativo({ ...base, descricao: undefined, motivo_reembolso: MOTIVO });
    conferir('o motivo aparece mesmo sem descrição', visivel(html).includes(MOTIVO));
}

console.log('\n── Nenhum dos dois: não inventa linha vazia');
{
    const { html } = gerarEmailCorporativo({ ...base, descricao: undefined, motivo_reembolso: undefined });
    const texto = visivel(html);
    conferir('sem rótulo Descrição solto', !/Descrição\s+(Data da despesa|Centro de custo)/.test(texto));
}

console.log('\n── Vale para todas as modalidades, não só reembolso');
{
    const tipos: TipoSolicitacao[] = [
        'PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_PAGAMENTO', 'FORMALIZACAO_CARTAO',
        'COMPRA_MATERIAL', 'REEMBOLSO', 'ADIANTAMENTO',
    ];
    const semDescricao = tipos.filter(tipo => {
        const { html } = gerarEmailCorporativo({ ...base, tipo, descricao: MOTIVO, motivo_reembolso: MOTIVO });
        return !visivel(html).includes(MOTIVO);
    });
    conferir('os 6 tipos dizem o que está sendo pago', semDescricao.length === 0, semDescricao.join(', '));
}

console.log(falhas === 0 ? '\nTudo certo.\n' : `\n${falhas} falha(s).\n`);
process.exitCode = falhas === 0 ? 0 : 1;
