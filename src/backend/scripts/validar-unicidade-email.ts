/**
 * Cada dado aparece uma vez só.
 *
 * A especificação do design é explícita: o valor, o nome do favorecido e a
 * descrição não podem se repetir no corpo. Repetição alonga o e-mail e tira a
 * atenção do que é único — e foi o que acontecia: o favorecido saía na faixa de
 * resumo e de novo na identificação; o valor saía no resumo, no cartão de
 * valores e duas vezes no aviso de pagamento parcial.
 *
 * Os valores abaixo são propositalmente distintos entre si (total 1000,
 * pagamento 325, saldo 675). Com 650/325/325, como no caso real, saldo e
 * pagamento coincidem e uma repetição de verdade passaria despercebida.
 *
 *   npx tsx src/backend/scripts/validar-unicidade-email.ts
 */
import { gerarEmailCorporativo, type DadosEmail, type TipoSolicitacao } from '../services/email-corporativo.service';

function montar(tipo: TipoSolicitacao): DadosEmail {
    return {
        tipo,
        tipo_demanda: 'IMPLANTACAO',
        site: 'PAMRB008',
        nome_site: 'PAMBA48',
        cliente: 'CLARO',
        sharing: 'Highline do Brasil',
        nome_colaborador: 'VICTOR HUGO NOGUEIRA DA SILVA',
        favorecido: 'VICTOR HUGO NOGUEIRA DA SILVA',
        fornecedor: 'VICTOR HUGO NOGUEIRA DA SILVA',
        cpf_colaborador: '80460020200',
        cpf_cnpj_pagamento: '80460020200',
        descricao: 'Servico de serralheria em Maraba',
        motivo_reembolso: 'Servico de serralheria em Maraba',
        forma_pagamento: 'PIX',
        pix: '91981047902',
        tipo_pix: 'TELEFONE',
        banco: 'Banco Inter',
        agencia: 'N/A',
        conta: 'N/A',
        tipo_conta: 'CORRENTE',
        valor_total: 1000,
        valor_pago: 0,
        valor_pagamento: 325,
        data_pagamento: '2026-09-16',
    };
}

/** Conta ocorrências sem regex — o texto tem parênteses e pontos. */
function vezes(texto: string, alvo: string): number {
    return texto.split(alvo).length - 1;
}

const tipos: TipoSolicitacao[] = ['REEMBOLSO', 'ADIANTAMENTO', 'PROGRAMACAO_PAGAMENTO', 'FORMALIZACAO_PAGAMENTO'];
let falhas = 0;

for (const tipo of tipos) {
    const { html } = gerarEmailCorporativo(montar(tipo));
    const texto = html
        // A prévia da caixa de entrada é texto oculto: o cliente a mostra na
        // LISTA de mensagens, ao lado do assunto, e não no corpo. Repetir o
        // valor ali não é repetição para quem lê o e-mail aberto.
        .replace(/<div style="display:none[\s\S]*?<\/div>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .split(' ').join(' ')
        .split('&nbsp;').join(' ')
        .replace(/\s+/g, ' ');

    const regras: [string, string][] = [
        ['valor deste pagamento', '325,00'],
        ['nome do favorecido', 'VICTOR HUGO NOGUEIRA DA SILVA'],
        ['CPF', '804.600.202-00'],
        ['chave PIX', '(91) 98104-7902'],
        ['descrição', 'Servico de serralheria em Maraba'],
    ];

    const ruins = regras.filter(([, alvo]) => vezes(texto, alvo) > 1);
    falhas += ruins.length;
    console.log(`\n── ${tipo}`);
    if (ruins.length === 0) {
        console.log(`   ${regras.length}/${regras.length} OK — cada dado uma vez só`);
    } else {
        for (const [rotulo, alvo] of ruins) console.log(`   FALHA ${rotulo}: ${vezes(texto, alvo)}x`);
    }
}

console.log(falhas === 0 ? '\nNenhuma repetição.\n' : `\n${falhas} repetição(ões).\n`);
process.exitCode = falhas === 0 ? 0 : 1;
