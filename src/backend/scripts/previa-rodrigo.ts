/**
 * Prévias do e-mail financeiro no caso Rodrigo Auto Center.
 *
 * Gera os cenários que a revisão visual precisa comparar lado a lado, sempre
 * pelo gerador de verdade — nunca por HTML escrito à mão:
 *
 *   1. completo    — pagamento parcial, PIX por telefone, anexos, observações
 *   2. minimo      — só o essencial: campos opcionais ausentes
 *   3. chave-longa — chave aleatória de 36 caracteres e nome muito longo
 *   4. email-pix   — chave do tipo e-mail, sem banco cadastrado
 *   5. cartao      — formalização no cartão: não tem chave PIX nenhuma
 *
 *   npx tsx src/backend/scripts/previa-rodrigo.ts <pasta-de-saida>
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { gerarEmailCorporativo, type DadosEmail } from '../services/email-corporativo.service';

const prisma = new PrismaClient();
const pasta = process.argv[2] || 'previas';

// Os três valores do caso, com papéis diferentes: 1.000 é o que se paga agora,
// 1.600 é o contrato inteiro e 600 é saldo retido — nunca três coisas a pagar.
const SOLICITADO_AGORA = 1000;
const TOTAL_CONTRATADO = 1600;

const base: DadosEmail = {
    tipo: 'PROGRAMACAO_PAGAMENTO',
    tipo_demanda: 'IMPLANTACAO',
    site: 'PAMRB008',
    nome_site: 'PAMBA48',
    cliente: 'CLARO',
    sharing: 'Highline do Brasil',
    centro_custo: 'ATV-2026-003 · Implantação Collo',
    favorecido: 'Rodrigo Auto Center',
    fornecedor: 'Rodrigo Auto Center',
    cpf_cnpj_pagamento: '12345678000190',
    descricao: 'Manutenção corretiva da frota de apoio à obra: revisão de suspensão, troca de pastilhas e alinhamento dos dois veículos alocados no site.',
    // O que quem contratou escreveu sobre ESTA contratação. A descrição acima
    // vem do catálogo e serve para qualquer manutenção da obra.
    detalhamento: 'Serralheiro — fabricação e instalação de grades e portão de acesso ao contêiner.',
    forma_pagamento: 'PIX',
    pix: '91981047902',
    tipo_pix: 'TELEFONE',
    banco: 'Banco Inter',
    valor_total: TOTAL_CONTRATADO,
    valor_pago: 0,
    valor_pagamento: SOLICITADO_AGORA,
    data_pagamento: '2026-09-22',
    condicao_liberacao_saldo: 'conclusão da etapa e aceite da fiscalização LS Office',
    condicao_pagamento: '62,5% na contratação e 37,5% na conclusão',
    // String.raw porque o caminho UNC é só barra invertida: escrito como
    // literal comum, `\E` e `\O` viram E e O e o caminho chega quebrado.
    link_diretorio: String.raw`\\servidor\ENGENHARIA\OBRAS\IMPLANTACAO\PAMRB008`,
    anexos: ['ORCAMENTO_PAMRB008_RODRIGO_AUTO_CENTER.pdf', 'OS_ASSINADA_PAMRB008.pdf'],
    observacoes: 'Veículos liberados para retirada mediante apresentação da ordem de serviço assinada.',
    nome_solicitante: 'Victor Hugo Nogueira da Silva',
    cargo_solicitante: 'Engenharia · LS Office',
    referencia: 'DEM-2026-014 · Parcela 1 de 2 · ATV-2026-003',
};

const cenarios: Record<string, DadosEmail> = {
    completo: base,

    // Campos opcionais ausentes: sem anexos, observações, centro de custo,
    // diretório, condição de pagamento nem saldo.
    minimo: {
        tipo: 'PROGRAMACAO_PAGAMENTO',
        tipo_demanda: 'OPERACAO',
        site: 'PAMRB008',
        sharing: 'Highline do Brasil',
        favorecido: 'Rodrigo Auto Center',
        descricao: 'Troca de óleo do veículo de apoio.',
        forma_pagamento: 'PIX',
        pix: 'rodrigo.autocenter@exemplo.com.br',
        tipo_pix: 'EMAIL',
        valor_pagamento: 320,
        data_pagamento: '2026-09-19',
        nome_solicitante: 'Victor Hugo Nogueira da Silva',
        cargo_solicitante: 'Engenharia · LS Office',
    },

    // O pior caso de largura: chave aleatória de 36 caracteres com um nome de
    // favorecido que não cabe numa linha.
    'chave-longa': {
        ...base,
        favorecido: 'Rodrigo Auto Center Comércio e Manutenção de Veículos Pesados Ltda ME',
        fornecedor: 'Rodrigo Auto Center Comércio e Manutenção de Veículos Pesados Ltda ME',
        pix: '7d4f1a2b-9c3e-4f58-b6a1-2e8d90c4f7b3',
        tipo_pix: 'ALEATORIA',
        banco: 'Banco Cooperativo Sicredi S.A.',
    },

    // Chave de e-mail sem instituição cadastrada: a legenda sob a chave fica
    // só com o tipo, sem separador solto.
    'email-pix': { ...base, pix: 'financeiro@rodrigoautocenter.com.br', tipo_pix: 'EMAIL', banco: undefined },

    // Sem PIX nenhum: o bloco azul da chave não pode aparecer.
    cartao: {
        ...base,
        tipo: 'FORMALIZACAO_CARTAO',
        forma_pagamento: 'CARTAO_CREDITO',
        pix: undefined,
        tipo_pix: undefined,
        cartao: { bandeira: 'Mastercard', final: '4417', apelido: 'Cartão Obras PA' },
        valor_pagamento: TOTAL_CONTRATADO,
        valor_total: TOTAL_CONTRATADO,
        condicao_liberacao_saldo: undefined,
    },
};

async function main() {
    const empresa = await prisma.empresaConfig.findFirst({ select: { logo_url: true } });
    fs.mkdirSync(pasta, { recursive: true });

    for (const [nome, dados] of Object.entries(cenarios)) {
        const { assunto, html } = gerarEmailCorporativo({ ...dados, logo_url: empresa?.logo_url ?? null });
        const destino = path.join(pasta, `${nome}.html`);
        fs.writeFileSync(destino, html, 'utf8');
        console.log(`${nome.padEnd(12)} ${Math.round(html.length / 1024)} KB  ${assunto.slice(0, 74)}`);
    }
    console.log(`\n${Object.keys(cenarios).length} prévias em ${path.resolve(pasta)}\n`);
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
