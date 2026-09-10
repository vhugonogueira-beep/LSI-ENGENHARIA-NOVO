import { prisma } from '../server';

// Cronograma de obra em Gantt para acompanhamento semanal — mesmo desenho do documento
// que a LS Office já envia para a Highline: cabeçalho com logos, dados do site, avanço
// físico (média das etapas), grade dia a dia agrupada por semana, legenda e observações.
// Sai em HTML para o navegador imprimir/salvar em PDF (mesmo caminho do contrato).

const ETAPA_COR: Record<string, string> = {
    LIBERACAO: '#16a34a',
    PRE_OBRA: '#7c3aed',
    CIVIL: '#2563eb',
    ENERGIA: '#ea580c',
    ESTRUTURA: '#059669',
    INSTALACAO: '#0891b2',
    RFI: '#0891b2',
    COMPRA: '#64748b',
    CONTRATACAO: '#64748b',
    PAGAMENTO: '#64748b',
    LOGISTICA: '#7c3aed',
    MOBILIZACAO: '#7c3aed',
    EXECUCAO: '#2563eb',
    DOCUMENTACAO: '#64748b',
    MEDICAO: '#64748b',
    FATURAMENTO: '#64748b',
    OUTROS: '#64748b',
};

const ETAPA_LABEL: Record<string, string> = {
    LIBERACAO: 'LIBERAÇÃO', PRE_OBRA: 'PRÉ-OBRA', CIVIL: 'CIVIL', ENERGIA: 'ENERGIA',
    ESTRUTURA: 'ESTRUTURA', INSTALACAO: 'INSTALAÇÃO', RFI: 'RFI', COMPRA: 'COMPRA',
    CONTRATACAO: 'CONTRATAÇÃO', PAGAMENTO: 'PAGAMENTO', LOGISTICA: 'LOGÍSTICA',
    MOBILIZACAO: 'MOBILIZAÇÃO', EXECUCAO: 'EXECUÇÃO', DOCUMENTACAO: 'DOCUMENTAÇÃO',
    MEDICAO: 'MEDIÇÃO', FATURAMENTO: 'FATURAMENTO', OUTROS: 'OUTROS',
};

const DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Logo da operadora movel. Procura primeiro em Contratante, que e onde a tela de
 * Clientes ja mantem Claro, TIM e Vivo com logo; a tabela Operadora fica como
 * complemento para quem nao esta la.
 *
 * O nome vem de Atividade.operadora, texto livre — a comparacao ignora acento,
 * caixa e sobrenome comercial ("Claro" casa com "Claro / America Movil").
 */
async function acharLogoOperadora(tenantId: string, nomeBruto: string) {
    const alvo = chaveNome(nomeBruto);
    if (!alvo) return null;

    const candidatos = await prisma.contratante.findMany({
        where: { tenant_id: tenantId, logo_url: { not: null } },
        select: { nome: true, logo_url: true },
    });
    const doCliente = candidatos.find(c => {
        const n = chaveNome(c.nome);
        return n === alvo || n.startsWith(alvo) || alvo.startsWith(n);
    });
    if (doCliente) return doCliente;

    const daTabela = await prisma.operadora.findFirst({
        where: { tenant_id: tenantId, nome: nomeBruto.trim().toUpperCase() },
        select: { nome: true, logo_url: true },
    });
    return daTabela;
}

function chaveNome(v: string): string {
    return (v || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .split(/[\/|-]/)[0]          // "Claro / America Movil" -> "Claro"
        .replace(/[^A-Z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function fmtCnpj(v: string): string {
    const n = (v || '').replace(/\D/g, '');
    if (n.length !== 14) return v;
    return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function diaUTC(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDias(d: Date, dias: number): Date {
    const r = new Date(d);
    r.setUTCDate(r.getUTCDate() + dias);
    return r;
}

function fmtCurto(d: Date): string {
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(2)}`;
}

function fmtLongo(d: Date): string {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

export async function gerarCronogramaHtml(atividadeId: string): Promise<{ html: string; filename: string }> {
    const empresa = await prisma.empresaConfig.findFirst();
    const atividade = await prisma.atividade.findUnique({
        where: { id: atividadeId },
        include: { contratante: true },
    });
    if (!atividade) throw new Error('Atividade não encontrada');

    // Só as etapas marcadas como visíveis ao cliente entram no documento — o planejamento
    // interno (prazo de negociação, envio/recebimento da PV...) fica de fora, inclusive do
    // avanço físico mostrado aqui, para o cliente ver um percentual coerente com a obra.
    const itens = await prisma.cronogramaItem.findMany({
        where: { atividade_id: atividadeId, visivel_cliente: true },
        orderBy: [{ ordem: 'asc' }],
    });
    if (itens.length === 0) {
        throw new Error('Nenhuma etapa marcada para o cronograma do cliente. Marque ao menos uma na coluna "No documento".');
    }
    const comDatas = itens.filter(i => i.data_inicio && i.data_fim);
    if (comDatas.length === 0) {
        throw new Error('Preencha as datas de início e fim de pelo menos uma etapa marcada para o documento');
    }

    // Janela do gráfico: da segunda-feira da primeira etapa ao domingo da última.
    const inicioReal = diaUTC(new Date(Math.min(...comDatas.map(i => i.data_inicio!.getTime()))));
    const fimReal = diaUTC(new Date(Math.max(...comDatas.map(i => i.data_fim!.getTime()))));
    const inicioGrade = addDias(inicioReal, -((inicioReal.getUTCDay() + 6) % 7));
    const fimGrade = addDias(fimReal, 6 - ((fimReal.getUTCDay() + 6) % 7));

    const dias: Date[] = [];
    for (let d = inicioGrade; d <= fimGrade; d = addDias(d, 1)) dias.push(d);

    // Semanas (para o cabeçalho agrupado "10 – 16 ago").
    const semanas: { label: string; dias: number }[] = [];
    for (let i = 0; i < dias.length; i += 7) {
        const ini = dias[i];
        const fim = dias[Math.min(i + 6, dias.length - 1)];
        const label = ini.getUTCMonth() === fim.getUTCMonth()
            ? `${ini.getUTCDate()} – ${fim.getUTCDate()} ${MES_CURTO[fim.getUTCMonth()]}`
            : `${ini.getUTCDate()} ${MES_CURTO[ini.getUTCMonth()]} – ${fim.getUTCDate()} ${MES_CURTO[fim.getUTCMonth()]}`;
        semanas.push({ label, dias: Math.min(7, dias.length - i) });
    }

    const hoje = diaUTC(new Date());
    const indiceHoje = dias.findIndex(d => d.getTime() === hoje.getTime());

    // Larguras explícitas por coluna. Com table-layout:fixed quem manda é a primeira
    // linha (ou o colgroup) — declarar largura só no <td> do corpo é ignorado, e foi o
    // que espremia a coluna de tarefa a ponto de quebrar o texto letra a letra.
    const LARGURAS_FIXAS = { tarefa: 190, etapa: 80, progresso: 104, data: 60 };
    const somaFixas = LARGURAS_FIXAS.tarefa + LARGURAS_FIXAS.etapa + LARGURAS_FIXAS.progresso + LARGURAS_FIXAS.data * 2;
    // A3 deitado com 10mm de margem ≈ 1512px úteis; o dia encolhe conforme o cronograma
    // se alonga, com um piso para a grade continuar legível.
    const larguraDia = Math.max(9, Math.min(26, Math.floor((1512 - somaFixas) / Math.max(1, dias.length))));
    const larguraTabela = somaFixas + larguraDia * dias.length;

    const colgroup = `
      <colgroup>
        <col style="width:${LARGURAS_FIXAS.tarefa}px">
        <col style="width:${LARGURAS_FIXAS.etapa}px">
        <col style="width:${LARGURAS_FIXAS.progresso}px">
        <col style="width:${LARGURAS_FIXAS.data}px">
        <col style="width:${LARGURAS_FIXAS.data}px">
        ${dias.map(() => `<col style="width:${larguraDia}px">`).join('')}
      </colgroup>`;

    const concluidas = itens.filter(i => i.status === 'CONCLUIDO').length;
    const emAndamento = itens.filter(i => i.status === 'EM_ANDAMENTO').length;
    const planejadas = itens.filter(i => i.status === 'PENDENTE' || i.status === 'ATRASADO').length;
    const avanco = Math.round(itens.reduce((acc, i) => acc + (i.progresso_percentual || 0), 0) / itens.length);

    const itemRfi = itens.find(i => ['RFI', 'INSTALACAO'].includes(i.categoria) && i.data_fim);
    const diasParaRfi = itemRfi
        ? Math.round((diaUTC(itemRfi.data_fim!).getTime() - hoje.getTime()) / 86400000)
        : null;

    // Tres logos no cabecalho: quem executa (LS), a operadora movel e a
    // sharing (compartilhadora). Cada uma cai para o nome em texto quando nao ha imagem
    // cadastrada — o documento nunca sai com um buraco.
    const operadora = atividade.operadora
        ? await acharLogoOperadora(atividade.tenant_id, atividade.operadora)
        : null;

    const marca = (url: string | null | undefined, nome: string, sub?: string) => url
        ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(nome)}" class="marca-img">`
        : `<span class="marca-texto">${escapeHtml(nome)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</span>`;

    const logoLs = marca(
        empresa?.logo_url,
        empresa?.nome_fantasia || empresa?.razao_social || 'LS OFFICE',
        'SERVIÇOS DE TELECOM E CONSTRUÇÕES',
    );
    const logoOperadora = atividade.operadora
        ? `<div class="marca"><span class="marca-rotulo">OPERADORA</span>${marca(operadora?.logo_url, operadora?.nome || atividade.operadora)}</div>`
        : '';
    const logoSharing = `<div class="marca"><span class="marca-rotulo">SHARING</span>${marca(atividade.contratante?.logo_url, atividade.contratante?.nome || atividade.sharing)}</div>`;

    // Linhas do Gantt, agrupadas pelo campo `grupo` quando houver.
    const linhas: string[] = [];
    let grupoAtual: string | null = null;
    for (const item of itens) {
        if ((item.grupo || null) !== grupoAtual) {
            grupoAtual = item.grupo || null;
            if (grupoAtual) {
                linhas.push(`<tr class="linha-grupo"><td colspan="${5 + dias.length}">${escapeHtml(grupoAtual)}</td></tr>`);
            }
        }

        const cor = ETAPA_COR[item.categoria] || '#64748b';
        const progresso = Math.max(0, Math.min(100, item.progresso_percentual || 0));
        const inicio = item.data_inicio ? diaUTC(item.data_inicio) : null;
        const fim = item.data_fim ? diaUTC(item.data_fim) : null;

        const celulas = dias.map((d, i) => {
            const fds = d.getUTCDay() === 0 || d.getUTCDay() === 6;
            const dentro = inicio && fim && d >= inicio && d <= fim;
            const marcador = i === indiceHoje ? ' hoje' : '';
            if (!dentro) return `<td class="celula${fds ? ' fds' : ''}${marcador}"></td>`;
            const primeiro = inicio && d.getTime() === inicio.getTime();
            const ultimo = fim && d.getTime() === fim.getTime();
            const corBarra = item.status === 'CONCLUIDO' ? '#16a34a' : item.status === 'EM_ANDAMENTO' ? '#f59e0b' : cor;
            const raio = `${primeiro ? '3px 0 0 3px' : '0'}`;
            return `<td class="celula${fds ? ' fds' : ''}${marcador}"><span class="barra" style="background:${corBarra};border-radius:${ultimo && primeiro ? '3px' : raio}"></span></td>`;
        }).join('');

        linhas.push(`
          <tr>
            <td class="tarefa">${escapeHtml(item.titulo)}</td>
            <td class="etapa"><span style="background:${cor}">${escapeHtml(ETAPA_LABEL[item.categoria] || item.categoria)}</span></td>
            <td class="progresso">
              <span class="trilho"><span class="preenchido" style="width:${progresso}%;background:${progresso === 100 ? '#16a34a' : '#f59e0b'}"></span></span>
              <span class="pct">${progresso}%</span>
            </td>
            <td class="data">${inicio ? fmtCurto(inicio) : '—'}</td>
            <td class="data">${fim ? fmtCurto(fim) : '—'}</td>
            ${celulas}
          </tr>`);
    }

    const observacoes = itens
        .filter(i => i.observacoes)
        .map(i => `<li>${escapeHtml(i.observacoes!)}</li>`)
        .join('');

    const codigo = atividade.id_site_sharing || atividade.codigo;
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Cronograma — ${escapeHtml(codigo)}</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 22px 18px; background: #eef2f6; font-size: 12px; }
  /* A folha tem largura própria e fica centralizada: em tela larga o cronograma
     não estica até a borda, o que deixava fonte e barras desproporcionais. */
  .folha { width: ${larguraTabela + 56}px; max-width: 100%; margin: 0 auto; background: #fff; padding: 26px 28px 22px; box-shadow: 0 2px 14px rgba(15,23,42,.10); border-radius: 4px; }
  @media print { body { background: #fff; padding: 0; } .folha { width: auto; box-shadow: none; padding: 0; } }
  .topo { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 3px solid #0f172a; padding-bottom: 14px; gap: 24px; }
  .marca { display: flex; flex-direction: column; gap: 3px; }
  .marca-rotulo { font-size: 7.5px; letter-spacing: .12em; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
  .marca-img { max-height: 52px; max-width: 190px; object-fit: contain; display: block; }
  .marca-texto { font-size: 15px; font-weight: 800; color: #0f172a; line-height: 1.1; }
  .marca-texto small { display: block; font-size: 6.5px; font-weight: 400; letter-spacing: .08em; color: #64748b; }
  .marca-executante .marca-texto { font-size: 18px; font-weight: 900; }
  .marcas-cliente { display: flex; align-items: flex-end; gap: 32px; }
  .cabecalho { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 16px; }
  .eyebrow { font-size: 9.5px; letter-spacing: .16em; color: #64748b; font-weight: 700; }
  h1 { font-size: 24px; margin: 4px 0 0; letter-spacing: -.02em; }
  .meta-doc { text-align: right; font-size: 10px; color: #475569; line-height: 1.6; }
  .cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; margin-top: 14px; }
  .card { background: #fff; padding: 8px 12px; }
  .card .rot { font-size: 8px; letter-spacing: .1em; color: #64748b; font-weight: 700; }
  .card .val { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .resumo { display: flex; align-items: center; gap: 20px; border: 1px solid #e2e8f0; border-left: 4px solid #16a34a; padding: 12px 16px; margin-top: 12px; }
  .resumo .rot { font-size: 9.5px; letter-spacing: .12em; color: #64748b; font-weight: 700; }
  .trilho-geral { height: 9px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin-top: 6px; width: 100%; }
  .trilho-geral span { display: block; height: 100%; background: #16a34a; }
  .kpi { text-align: center; min-width: 74px; }
  .kpi b { display: block; font-size: 20px; line-height: 1; }
  .kpi span { font-size: 8px; letter-spacing: .08em; color: #64748b; font-weight: 700; }
  .rolagem-tabela { overflow-x: auto; }
  table { border-collapse: collapse; margin-top: 16px; table-layout: fixed; }
  thead th { background: #0f172a; color: #fff; font-size: 8px; letter-spacing: .06em; padding: 5px 3px; border: 1px solid #1e293b; white-space: nowrap; }
  th.semana { font-size: 8px; }
  th.dia { font-size: 7px; padding: 4px 0; }
  td { border: 1px solid #e2e8f0; padding: 5px 6px; font-size: 10px; }
  /* o nome da etapa quebra por palavra, nunca no meio dela */
  td.tarefa { font-weight: 700; word-break: normal; overflow-wrap: normal; hyphens: none; line-height: 1.35; }
  td.etapa { text-align: center; }
  td.etapa span { display: inline-block; color: #fff; font-size: 7px; font-weight: 800; letter-spacing: .06em; padding: 2px 6px; border-radius: 3px; }
  td.progresso { white-space: nowrap; }
  .trilho { display: inline-block; width: 62px; height: 7px; background: #e2e8f0; border-radius: 4px; overflow: hidden; vertical-align: middle; }
  .preenchido { display: block; height: 100%; }
  .pct { font-size: 9px; font-weight: 700; margin-left: 5px; }
  td.data { text-align: center; font-size: 10px; white-space: nowrap; }
  td.celula { padding: 0; height: 22px; position: relative; }
  td.celula.fds { background: #f1f5f9; }
  td.celula.hoje { border-left: 2px solid #dc2626; }
  .barra { position: absolute; inset: 5px 0; display: block; }
  .linha-grupo td { background: #f8fafc; font-weight: 800; font-size: 9.5px; letter-spacing: .1em; color: #334155; }
  .legenda { display: flex; gap: 18px; margin-top: 12px; font-size: 9.5px; color: #475569; align-items: center; }
  .legenda i { display: inline-block; width: 11px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
  .rodape { display: flex; justify-content: space-between; gap: 40px; margin-top: 18px; }
  .obs h3 { font-size: 9px; letter-spacing: .12em; color: #64748b; margin: 0 0 6px; }
  .obs ul { margin: 0; padding-left: 16px; color: #334155; line-height: 1.7; }
  .assinatura { border: 1px solid #e2e8f0; padding: 12px 16px; min-width: 240px; font-size: 10px; color: #475569; line-height: 1.6; }
  .assinatura b { color: #0f172a; display: block; margin-bottom: 4px; }
  .rodape-doc { border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; }
</style>
</head>
<body>
<div class="folha">
  <div class="topo">
    <div class="marca marca-executante"><span class="marca-rotulo">EXECUTANTE</span>${logoLs}</div>
    <div class="marcas-cliente">${logoOperadora}${logoSharing}</div>
  </div>

  <div class="cabecalho">
    <div>
      <div class="eyebrow">CRONOGRAMA DE OBRA — ACOMPANHAMENTO SEMANAL</div>
      <h1>${escapeHtml(codigo)}${atividade.id_site_operadora ? ` · ${escapeHtml(atividade.id_site_operadora)}` : ''}${atividade.tipo_site_highline ? ` — ${escapeHtml(atividade.tipo_site_highline)}` : ''}</h1>
    </div>
    <div class="meta-doc">
      Documento nº <b>LSO-CRN-${escapeHtml(codigo)}</b><br>
      Emissão: <b>${fmtLongo(hoje)}</b><br>
      Status: <b>${escapeHtml(atividade.status_operacional.replace(/_/g, ' '))}</b>
    </div>
  </div>

  <div class="cards">
    <div class="card"><div class="rot">CLIENTE</div><div class="val">${escapeHtml(atividade.contratante?.nome || atividade.sharing)}</div></div>
    <div class="card"><div class="rot">OPERADORA</div><div class="val">${escapeHtml(atividade.operadora || '—')}</div></div>
    <div class="card"><div class="rot">ESTRUTURA</div><div class="val">${escapeHtml(atividade.tipo_site_highline || atividade.tipo_obra || '—')}</div></div>
    <div class="card"><div class="rot">INÍCIO DO PROJETO</div><div class="val">${fmtLongo(inicioReal)}</div></div>
    <div class="card"><div class="rot">TÉRMINO PREVISTO</div><div class="val">${fmtLongo(fimReal)}</div></div>
    <div class="card"><div class="rot">EXECUTANTE</div><div class="val">LS Office</div></div>
  </div>

  <div class="resumo">
    <div style="flex:1">
      <div class="rot">AVANÇO FÍSICO — MÉDIA DAS ATIVIDADES</div>
      <div class="trilho-geral"><span style="width:${avanco}%"></span></div>
    </div>
    <div class="kpi"><b>${avanco}%</b><span>AVANÇO</span></div>
    <div class="kpi"><b style="color:#16a34a">${concluidas}</b><span>CONCLUÍDAS</span></div>
    <div class="kpi"><b style="color:#f59e0b">${emAndamento}</b><span>EM ANDAMENTO</span></div>
    <div class="kpi"><b style="color:#2563eb">${planejadas}</b><span>PLANEJADAS</span></div>
    ${diasParaRfi != null ? `<div class="kpi"><b>${diasParaRfi}</b><span>DIAS P/ O RFI</span></div>` : ''}
  </div>

  <div class="rolagem-tabela">
  <table style="width:${larguraTabela}px">
    ${colgroup}
    <thead>
      <tr>
        <th rowspan="2">TAREFA</th><th rowspan="2">ETAPA</th><th rowspan="2">PROGRESSO</th>
        <th rowspan="2">INÍCIO</th><th rowspan="2">TÉRMINO</th>
        ${semanas.map(s => `<th class="semana" colspan="${s.dias}">${escapeHtml(s.label)}</th>`).join('')}
      </tr>
      <tr>
        ${dias.map(d => `<th class="dia">${String(d.getUTCDate()).padStart(2, '0')}<br>${DIA_SEMANA[d.getUTCDay()]}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${linhas.join('')}</tbody>
  </table>
  </div>

  <div class="legenda">
    <span><i style="background:#16a34a"></i>Concluído</span>
    <span><i style="background:#f59e0b"></i>Em andamento</span>
    <span><i style="background:#2563eb"></i>Planejado</span>
    <span><i style="background:#f1f5f9;border:1px solid #e2e8f0"></i>Fim de semana</span>
    <span><i style="background:#dc2626;width:2px"></i>Data de referência (${fmtLongo(hoje)})</span>
  </div>

  <div class="rodape">
    <div class="obs">
      <h3>OBSERVAÇÕES E PREMISSAS</h3>
      <ul>${observacoes || '<li>Sem observações registradas nas etapas do cronograma.</li>'}</ul>
    </div>
    <div class="assinatura">
      <b>${escapeHtml(empresa?.razao_social || 'LS Office Serviços de Telecom e Construções')}</b>
      ${empresa?.cnpj ? `CNPJ ${escapeHtml(fmtCnpj(empresa.cnpj))}<br>` : ''}
      ${escapeHtml(atividade.responsavel || empresa?.assinatura_setor || 'Coordenação de Implantação')}<br>
      ${escapeHtml([atividade.municipio, atividade.estado].filter(Boolean).join(' — ') || '')}<br>
      Emitido em ${fmtLongo(hoje)}
    </div>
  </div>

  <div class="rodape-doc">
    <span>LSO-CRN-${escapeHtml(codigo)} · Emissão ${fmtLongo(hoje)}</span>
    <span>Documento de acompanhamento — uso restrito ${escapeHtml(atividade.contratante?.nome || atividade.sharing)} / LS Office</span>
  </div>
</div>
</body>
</html>`;

    return { html, filename: `Cronograma_${codigo}.html` };
}
