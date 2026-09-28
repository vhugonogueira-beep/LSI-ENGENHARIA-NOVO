/**
 * Gera o HTML real de um e-mail financeiro e grava num arquivo, para conferir
 * o template renderizado sem precisar passar pela interface.
 *
 *   npx tsx src/backend/scripts/gerar-previa-email.ts <saida.html> [TIPO]
 *
 * TIPO aceita qualquer valor de TipoSolicitacao; o padrão é REEMBOLSO.
 * A logo sai do cadastro da empresa, como no e-mail de verdade.
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { gerarEmailCorporativo, type DadosEmail, type TipoSolicitacao } from '../services/email-corporativo.service';

const prisma = new PrismaClient();
const saida = process.argv[2] || 'previa-email.html';
const tipo = (process.argv[3] || 'REEMBOLSO') as TipoSolicitacao;

async function main() {
    const empresa = await prisma.empresaConfig.findFirst({ select: { logo_url: true } });

    const dados: DadosEmail = {
        tipo,
        logo_url: empresa?.logo_url ?? null,
        tipo_demanda: 'IMPLANTACAO',
        site: 'PAMRB008',
        nome_site: 'PAMBA48',
        cliente: 'CLARO',
        sharing: 'Highline do Brasil',
        centro_custo: 'ATV-2026-003 · Implantação Collo',
        nome_colaborador: 'VICTOR HUGO NOGUEIRA DA SILVA',
        favorecido: 'VICTOR HUGO NOGUEIRA DA SILVA',
        cpf_colaborador: '80460020200',
        cpf_cnpj_pagamento: '80460020200',
        descricao: 'Serviço de serralheria em Marabá, prestado por Valdir Pereira da Silva. Parcela de 50% sobre o valor total de R$ 650,00.',
        motivo_reembolso: 'Serviço de serralheria em Marabá, prestado por Valdir Pereira da Silva. Parcela de 50% sobre o valor total de R$ 650,00.',
        data_despesa: '2026-09-14',
        forma_pagamento: 'PIX',
        pix: '91981047902',
        tipo_pix: 'TELEFONE',
        banco: 'Banco Inter',
        agencia: 'N/A',
        conta: 'N/A',
        tipo_conta: 'CORRENTE',
        valor_total: 650,
        valor_pago: 0,
        valor_pagamento: 325,
        data_pagamento: '2026-09-16',
        link_diretorio: '\\\\servidor\\ENGENHARIA\\OBRAS\\IMPLANTACAO\\PAMRB008',
        itens_reembolso: [{
            data: '2026-09-14',
            descricao: 'Serralheiro — Valdir Pereira da Silva (50% de R$ 650,00)',
            categoria: 'SERVICO',
            valor: 325,
        }],
        anexos: ['COMPROVANTE_PAMRB008_VICTOR_HUGO_NOGUEIRA.jpeg'],
        nome_solicitante: 'Victor Hugo Nogueira da Silva',
        cargo_solicitante: 'Engenharia · LS Office',
        referencia: 'REE-2026-0041 · Depósito 1 de 2 · ATV-2026-003',
    };

    const { assunto, html } = gerarEmailCorporativo(dados);
    fs.writeFileSync(saida, html, 'utf8');
    console.log(`Assunto: ${assunto}`);
    console.log(`HTML gravado em ${saida} (${Math.round(html.length / 1024)} KB)`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
