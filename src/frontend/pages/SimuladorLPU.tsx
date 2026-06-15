import React, { useState, useMemo } from "react";
import TabSecretaria from "./TabSecretaria";
import { gerarPdfOrcamento } from "./gerarPdfOrcamento";
import TabOrcamentoV2 from "../budget/TabOrcamentoV2";
import TabLpus from "../budget/TabLpus";
import { calcBudgetTotals, calcItemTotal, calcItemFinancials, roundCurrency, type Budget } from "../budget/types";
import { calcLegacyBudgetItemTotals, calcLegacyBudgetTotals, hydrateLegacyBudget, isLegacyBudget } from "../budget/legacyBudgetMath";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";

function normalizeHistoricBudgetEntry(budget) {
  return isLegacyBudget(budget) ? hydrateLegacyBudget(budget) : budget;
}

const DB_PV_HIGHLINE = { "lpu": [{ "cod": "MS001", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H2m | AeV2m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS002", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H3m | AeV2m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS003", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H3m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS004", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H4m | AeV2m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS005", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H4m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS006", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H6m | AeV2m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS007", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H6m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS008", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H8m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS009", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H8m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS001", "resumo": "POSTE", "solucao": "Suporte RF em plataforma EV > 30m", "config": "H9m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS002", "resumo": "POSTE", "solucao": "Suporte RF em plataforma EV > 30m", "config": "H9m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS003", "resumo": "POSTE", "solucao": "Suporte TX em plataforma EV > 30m", "config": "H9m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS004", "resumo": "POSTE", "solucao": "SPDA", "config": "H9m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS005", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H9m | AeV4m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS006", "resumo": "POSTE", "solucao": "Escada EV > 30m", "config": "H9m | AeV4m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS007", "resumo": "POSTE", "solucao": "Trava quedas", "config": "H9m | AeV4m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS008", "resumo": "POSTE", "solucao": "Trava quedas", "config": "H9m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS009", "resumo": "POSTE", "solucao": "Esteriamento Horizontal EV > 30m", "config": "H9m | AeV5m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS010", "resumo": "POSTE", "solucao": "Esteriamento Horizontal EV > 30m", "config": "H9m | AeV5m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS011", "resumo": "POSTE", "solucao": "Esteriamento Horizontal EV > 30m", "config": "H9m | AeV5m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS012", "resumo": "POSTE", "solucao": "Balizamento Baixa Intensidade EV até 45m", "config": "H9m | AeV5m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS013", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS014", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS015", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS016", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS017", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS018", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS019", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS020", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS021", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS022", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS023", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS024", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS025", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | V", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS026", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H9m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS010", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H10m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "MS011", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H10m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS027", "resumo": "POSTE", "solucao": "Balizamento Média Intensidade EV de 46 até 150m", "config": "H12m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS028", "resumo": "POSTE", "solucao": "FCI", "config": "H12m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS029", "resumo": "POSTE", "solucao": "Projeto", "config": "H12m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS030", "resumo": "POSTE", "solucao": "Projeto", "config": "H12m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS031", "resumo": "POSTE", "solucao": "Projeto", "config": "H12m | AeV4m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS032", "resumo": "POSTE", "solucao": "Mastro 1,8m e fundação em solo para instalação de antena TX (parabólica 1,8m), com eletroduto flexível (envelopado em solo), eletroduto FGF e sistema de fixação para encaminhamento de cabos.", "config": "H12m | AeV4m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS033", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV4m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS034", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS035", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS036", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS037", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS038", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS039", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS040", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS041", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS042", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS043", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS044", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS045", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS046", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS047", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS048", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS049", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS050", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS051", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS052", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H12m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS053", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS054", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS055", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS056", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS057", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS058", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS059", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS060", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS061", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS062", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS063", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS064", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS065", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS066", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS067", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS068", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS069", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS070", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS071", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS072", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS073", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 10.0 }, { "cod": "PS074", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS075", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS076", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS077", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS078", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H18m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS079", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS080", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS081", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS082", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS083", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS084", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS085", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS086", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS087", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS088", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS089", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS090", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS091", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS092", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS093", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS094", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS095", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR001", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR002", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR003", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR004", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR005", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR006", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR007", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR008", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR009", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR010", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR011", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR012", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR013", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR014", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR015", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR016", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR017", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS096", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H30m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MT001", "resumo": "MONTAGEM", "solucao": "Inclui mão de obra, equipamentos p/ içamento, ferramentas e o que for necessário para correta execução da montagem da EV.", "config": "H30m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS097", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS098", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS099", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS100", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS101", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS102", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS103", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS104", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS105", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS106", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS107", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS108", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS109", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS110", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS111", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS112", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR018", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR019", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR020", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR021", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR022", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR023", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR024", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR025", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR026", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR027", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR028", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR029", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR030", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V30", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR031", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V35", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR032", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V40", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR033", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V45", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR034", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PS113", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H40m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MT002", "resumo": "MONTAGEM", "solucao": "Inclui mão de obra, equipamentos p/ içamento, ferramentas e o que for necessário para correta execução da montagem da EV.", "config": "H40m", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN001", "resumo": "INFRA", "solucao": "2a. Abordagem FO — Instalação de Poste de Aço ou Concreto p/ 2a. abordagem fibra óptica", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT001", "resumo": "ATERRAMENTO", "solucao": "Cabo flexível verde 50 mm²", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN002", "resumo": "INFRA", "solucao": "Acesso veicular — Em brita graduada  (no. 3) ou escoria de aciaria", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS012", "resumo": "MASTRO", "solucao": "Acessórios", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT002", "resumo": "ATERRAMENTO", "solucao": "Cordoalha de cobre, 50mm²", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD001", "resumo": "FUNDAÇÃO", "solucao": "Aço CA-60A", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN003", "resumo": "INFRA", "solucao": "Adequação Padrão — Adeqauação do padrão de entrada de energia existente  (até 04 medidores) com fornecimento e instalação de seccionamento padrão da concessionária local (disjuntor), cabos internos ao padrão e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT003", "resumo": "ATERRAMENTO", "solucao": "Cordoalha de aço galvanizado, 50mm²", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN004", "resumo": "INFRA", "solucao": "Alambrado (tela militar)", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS013", "resumo": "MASTRO", "solucao": "Balizamento Baixa Intensidade EV até 45m", "config": "", "unid": "Kit", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS014", "resumo": "MASTRO", "solucao": "Balizamento Média Intensidade EV de 46 até 150m", "config": "", "unid": "Kit", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT004", "resumo": "ATERRAMENTO", "solucao": "Caixa de inspeção circular 30cm, com tampa em aço galvanizado c/ alça", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN005", "resumo": "INFRA", "solucao": "Beliche — Estrutura metálica tipo \"Beliche\" para suporte e fixação de Gabinetes", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT005", "resumo": "ATERRAMENTO", "solucao": "Haste de aterramento 5/8\", revestida em cobre 254μ, L=3,00m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN006", "resumo": "INFRA", "solucao": "Brita — Cobertura com 5 a 7 cm de brita (no. 2), seixo ou similar", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT006", "resumo": "ATERRAMENTO", "solucao": "Cabo de aço com alma de aço de 1/2\"", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT007", "resumo": "ATERRAMENTO", "solucao": "Cabo flexível verde 16 mm²", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT008", "resumo": "ATERRAMENTO", "solucao": "Cabo flexível verde 25 mm²", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT009", "resumo": "ATERRAMENTO", "solucao": "Conector FCI — Conector de compressão FCI tipo Cabo-Cabo", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL001", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 2,5mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL002", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 4mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL003", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 10mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL004", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 16mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL005", "resumo": "ELÉTRICA", "solucao": "Eletroduto corrugado de PVC (PEAD / kanaflex) flexível 2\" com conexões", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL006", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 35mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL007", "resumo": "ELÉTRICA", "solucao": "Eletroduto corrugado de PVC (PEAD / kanaflex) flexível 1\" com conexões", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL008", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 2,5mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL009", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 4mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL010", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 10mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL011", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio, PVC, 1KV, 16mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL012", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 25mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL013", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 35mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL014", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 50mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL015", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x10mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL016", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x10mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL017", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x 25mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL018", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x 25mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL019", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x 35mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL020", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x 35mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL021", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x 50 mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL022", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x 50 mm² neutro nu - alumínio", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL023", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 2x2,5mm² isolamento 750V (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL024", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 3x2,5mm² isolamento 750V (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT010", "resumo": "ATERRAMENTO", "solucao": "EGB — Placa EGB (External Ground Bar), em aço com conectores", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL025", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 3x6mm² isolamento 1kV (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL026", "resumo": "ELÉTRICA", "solucao": "Padrão de entrada BT, Trifásico (FFFN) 380/220V até 75KVA, Poste (padrão concecionária), eletrodutos (bengala), kit Armação Presbow + Roldana e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL027", "resumo": "ELÉTRICA", "solucao": "Caixa de passagem 300x300x600mm em bloco de concreto (inclui tampa)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN007", "resumo": "INFRA", "solucao": "Caixa de passagem 300x300x600mm pré-moldada (inclui tampa)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN008", "resumo": "INFRA", "solucao": "Caixa de passagem 600x600x600mm em bloco de concreto (inclui tampa)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL028", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 25mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN009", "resumo": "INFRA", "solucao": "Caixa de passagem 300x300x120mm em aluminio fundido (inclui tampa)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN010", "resumo": "INFRA", "solucao": "Caixa de passagem Tipo R2 1200x600x800mm Bloco Concreto (inclui tampa)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD002", "resumo": "FUNDAÇÃO", "solucao": "Camisa concreto para construção do tubulão revestido", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD003", "resumo": "FUNDAÇÃO", "solucao": "Camisa metalica (sem reaproveitamento) para construção do tubulão revestido", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL029", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 50mm² (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL030", "resumo": "ELÉTRICA", "solucao": "QTME Trifásico sem PPTA — Quadro QTME Trifásico, sem PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD004", "resumo": "FUNDAÇÃO", "solucao": "Concreto convencional - fck 20MPa", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD005", "resumo": "FUNDAÇÃO", "solucao": "Aço CA-50A", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD006", "resumo": "FUNDAÇÃO", "solucao": "Concreto Bombeável — Fornecimento e lançamento de concreto bombeável - fck 20MPa", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD007", "resumo": "FUNDAÇÃO", "solucao": "Concreto Bombeável — Fornecimento e lançamento de concreto bombeável - fck 25MPa", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT011", "resumo": "ATERRAMENTO", "solucao": "Conector FCI — Conector de compressão FCI tipo Cabo-Haste", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL031", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 3x4mm² isolamento 750V (inclusive terminais)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT012", "resumo": "ATERRAMENTO", "solucao": "Cordoalha de cobre, 25mm²", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL032", "resumo": "ELÉTRICA", "solucao": "Eletroduto PVC flexível  1/2 - 1\" (tipo seal tube)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL033", "resumo": "ELÉTRICA", "solucao": "Eletroduto PVC flexível 1 1/2 - 2\" (tipo seal tube)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN011", "resumo": "INFRA", "solucao": "Demolição de alvenaria   ( salas, paredes, pisos, tetos, muros, abrigos, etc)", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD008", "resumo": "FUNDAÇÃO", "solucao": "Demolição de concreto armado até 1,5m de profundidade", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD009", "resumo": "FUNDAÇÃO", "solucao": "Demolição de concreto armado acima de 1,5m de profundidade", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AD001", "resumo": "ADMINISTRATIVO", "solucao": "Deslocamento Pontual: Deslocamento de recurso para execução de atividade pontual não originada por ação e/ou omissão da contratada.", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL034", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN monopolar 10-50A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL035", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN monopolar 63-80A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL036", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN bipolar 10-50A  (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL037", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN bipolar 63-100A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL038", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN tripolar 10-50A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL039", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN tripolar 63-100A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN012", "resumo": "INFRA", "solucao": "Dry Wall — Fechamento em Dry wall", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL040", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo  (F.G.F) 1 1/2 - 2\"", "config": "VEletroduto rigidos pesado galvanizado a fogo 1 1/2 - 2\"", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD010", "resumo": "FUNDAÇÃO", "solucao": "Bota Fora (remoção de terra, vegetação, entulho em geral, etc). Considerar taxa de empolamento - E 25%", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL041", "resumo": "ELÉTRICA", "solucao": "Padrão de entrada BT, Bifásico (FFN) 220/127V até 75KVA, Poste (padrão concecionária), eletrodutos (bengala), kit Armação Presbow + Roldana e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL042", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo (F.G.F) 1/2 - 1\"", "config": "VEletroduto rigidos pesado galvanizado a fogo 1/2 - 1\"", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL043", "resumo": "ELÉTRICA", "solucao": "Poste de iluminação em aço galvanizado, 3 metros de altura, luminária tipo tartaruga e lampanda de 200 Watts ou LED.", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL044", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo  (F.G.F) 2 1/2 - 3\"", "config": "VEletroduto rigidos pesado galvanizado a fogo  2 1/2 - 3\"", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL045", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo (F.G.F)  4\"", "config": "VEletroduto rigidos pesado galvanizado a fogo  4\"", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL046", "resumo": "ELÉTRICA", "solucao": "QTME Bifásico com PPTA — Quadro QTME Bifásico,com PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 5219.75 }, { "cod": "FD011", "resumo": "FUNDAÇÃO", "solucao": "Concreto magro / lastro", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL047", "resumo": "ELÉTRICA", "solucao": "Eletroduto corrugado de PVC (PEAD / kanaflex) flexível 3-4\" com conexões", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL048", "resumo": "ELÉTRICA", "solucao": "Eletroduto rígido PVC de  1/2 - 1\" preto ou cinza com conexões", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL049", "resumo": "ELÉTRICA", "solucao": "Eletroduto rígido PVC de 1 1/2 - 2\" preto ou cinza com conexões", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN013", "resumo": "INFRA", "solucao": "Enclausuramento (tampa) de esteiramento em chapa galvanizada L=400 mm", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN014", "resumo": "INFRA", "solucao": "Escada \"Marinheiro\" — Escada de Acesso, tipo \"Marinheiro\" com guarda corpo galvanizado a fogo e acessórios de segurança", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS015", "resumo": "MASTRO", "solucao": "Escada EV > 30m", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD012", "resumo": "FUNDAÇÃO", "solucao": "Escavação em rocha — Serviços de escavação, reaterro, nivelamento e compactação", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD013", "resumo": "FUNDAÇÃO", "solucao": "Escavação profunda em solo — Serviços de escavação, reaterro, nivelamento e compactação", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD014", "resumo": "FUNDAÇÃO", "solucao": "Concreto convencional - fck 25MPa", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD015", "resumo": "FUNDAÇÃO", "solucao": "Escavação rasa em solo — Serviços de escavação, reaterro, nivelamento e compactação", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS016", "resumo": "MASTRO", "solucao": "Esteriamento Horizontal EV > 30m", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS017", "resumo": "MASTRO", "solucao": "Esteriamento Horizontal EV > 30m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR035", "resumo": "TORRE", "solucao": "Esteriamento Vertical", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR036", "resumo": "TORRE", "solucao": "Esteriamento Vertical EV > 30m", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR037", "resumo": "TORRE", "solucao": "Esteriamento Vertical EV > 30m", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR038", "resumo": "TORRE", "solucao": "Esteriamento Vertical EV > 30m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS018", "resumo": "MASTRO", "solucao": "FCI", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD016", "resumo": "FUNDAÇÃO", "solucao": "Formas — Fornecimento, montagem, escoras, desmoldante estão inclusas neste item.", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "LG001", "resumo": "LOGÍSTIVA", "solucao": "Frete — Transporte até 500km", "config": "VTransporte até 500km", "unid": "KM/TN", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "LG002", "resumo": "LOGÍSTIVA", "solucao": "Frete — Transporte 501 km à 1000km", "config": "VTransporte 501 km à 1000km", "unid": "KM/TN", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "LG003", "resumo": "LOGÍSTIVA", "solucao": "Frete — Transporte ≥ 1001km", "config": "VTransporte ≥ 1001km", "unid": "KM/TN", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD017", "resumo": "FUNDAÇÃO", "solucao": "Estaca Raiz em solo comum D=20CM", "config": "Furo D=20cm", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD018", "resumo": "FUNDAÇÃO", "solucao": "Estaca Raiz em solo comum D=25CM", "config": "Furo D=25cm", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PT001", "resumo": "PROTEÇÃO", "solucao": "Gradil — Kit Anti-vandalismo ( gradil de proteção e porta cadeado, galvanizado a fogo ) p/ QM (Quadro de Medição)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN015", "resumo": "INFRA", "solucao": "Guarda-corpo metálico (conforme legislação) para fechamento de perímetro de trabalho, galvanizado a fogo", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT013", "resumo": "ATERRAMENTO", "solucao": "Haste de aterramento 3/4\", revestida em cobre 254μ, L=2,4m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN016", "resumo": "INFRA", "solucao": "Alambrado — Mourão de concreto H=2,00m+0,40m com travamentos nos cantos e intermediários + alambrado galvanizado 2”x2”+ 3 x fiadas de arame farpado", "config": "", "unid": "ML", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN017", "resumo": "INFRA", "solucao": "Impermeabilização com primer, manta asfáltica plastomerica tipo 2 com 3mm de espessura, manta asfáltica elastomerica tipo 3 com 4mm de espessura, camada separadora e argamassa para proteção mecânica com 5cm de espessura com juntas de dilatação. Inclui a recomposição da área", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN018", "resumo": "INFRA", "solucao": "Impermeabilização com primer, manta asfáltica plastomerica tipo 2 com 3mm de espessura, camada separadora e argamassa para proteção mecânica com 5cm de espessura com juntas de dilatação. Inclui a recomposição da área", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "LD001", "resumo": "LAUDO", "solucao": "Laudo de Estabilidade de Talude + ART + Comprovante Pagamento", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "LD002", "resumo": "LAUDO", "solucao": "Laudo estrutural de Rooftop (ex: casas, prédios ou outras edificações), com instalação do mastro em caixa d´agua, telhado, platibanda, etc + ART + Comprovante Pagamento", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "LD003", "resumo": "LAUDO", "solucao": "Laudo Técnido de Resistencia do Concreto (fck) Obs.: Laudo de instituto credenciado, não é o fornecido pela empresa de concreto.", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "LC001", "resumo": "LICENCIAMENTO", "solucao": "Licenciamento — Processo de Licenciamento completo - Urbanistico / Ambiental", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL050", "resumo": "ELÉTRICA", "solucao": "Ligação Provisória de Energia considerando cabo 10-16mm2 + disjuntor, inclui negociação de uso provisório junto ao cedente (ex: condomínio, vizinho, etc)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR039", "resumo": "TORRE", "solucao": "Luminária", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS019", "resumo": "MASTRO", "solucao": "Mastro 1,8m e fundação em solo para instalação de antena TX (parabólica 1,8m), com eletroduto flexível (envelopado em solo), eletroduto FGF e sistema de fixação para encaminhamento de cabos.", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD019", "resumo": "FUNDAÇÃO", "solucao": "Micro Estaca Raiz em solo comum (utilização eqto compacto para sites reduzidos)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD020", "resumo": "FUNDAÇÃO", "solucao": "Mobilização — Transporte e remoção do equipamento completo", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN019", "resumo": "INFRA", "solucao": "Muro de alvenaria (espessura acabada 20 cm) , emboço e chapisco + Proteção tipo concertina", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN020", "resumo": "INFRA", "solucao": "Muro (pintura)", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD021", "resumo": "FUNDAÇÃO", "solucao": "Muro Arrimo em Concreto Armado", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN021", "resumo": "INFRA", "solucao": "Abrigo — Construção de Abrigo em alvenaria para QM e QTME", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL051", "resumo": "ELÉTRICA", "solucao": "Padrão de entrada BT, Monofásico (FN) 380/220V até 75KVA, Poste (padrão concecionária), eletrodutos (bengala), kit Armação Presbow + Roldana e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN022", "resumo": "INFRA", "solucao": "Base em concreto armado para gabinetes, mastros de RF ou MW, etc (todas as dimensões) contemplando concreto, aço, forma.", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN001", "resumo": "PINTURA", "solucao": "Pétela de Coqueiro", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN002", "resumo": "PINTURA", "solucao": "Pintura Poste 12m", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN003", "resumo": "PINTURA", "solucao": "Pintura Poste 18m", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN004", "resumo": "PINTURA", "solucao": "Pintura Poste 30m", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN005", "resumo": "PINTURA", "solucao": "Pintura Poste 40m", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN006", "resumo": "PINTURA", "solucao": "Pintura Poste 9m — Fornecimento de tinta epóxi na cor branca e laranja internacional conforme obrigação COMAR ou classificação de agressividade ambiental Classe III: Ambiente marinho e industrial e Classe IV: Ambiente industrial e com respingos de maré.", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN007", "resumo": "PINTURA", "solucao": "Pintura Torre 30m", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PN008", "resumo": "PINTURA", "solucao": "Pintura Torre 40m", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR040", "resumo": "TORRE", "solucao": "Plataforma", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR041", "resumo": "TORRE", "solucao": "Plataforma Poste", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR042", "resumo": "TORRE", "solucao": "Plataforma Torre", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN023", "resumo": "INFRA", "solucao": "Poço de visita para captação de águas pluviais com tampa em contreto.", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN024", "resumo": "INFRA", "solucao": "Portão Chapa — Portão pedestre chapa", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN025", "resumo": "INFRA", "solucao": "Portão Chapa — Portão veicular chapa", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN026", "resumo": "INFRA", "solucao": "Caixa de passagem 600x600x600mm  pré-moldada (inclui tampa)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN027", "resumo": "INFRA", "solucao": "Portão Tela — Portão veicular tela", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN028", "resumo": "INFRA", "solucao": "Concertina para gradil, plataforma da torre, poste do padrão de energia", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL052", "resumo": "ELÉTRICA", "solucao": "Poste de iluminação em aço galvanizado, 6 metros de altura, luminária tipo tartaruga e lampanda de 200 Watts ou LED.", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL053", "resumo": "ELÉTRICA", "solucao": "Poste de monitoramento CATV em aço galvanizado, 5 metros de altura.", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AQ001", "resumo": "ACQ", "solucao": "Processo Aquisição completo - Busca / SAR / Contrato", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS020", "resumo": "MASTRO", "solucao": "Projeto", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS021", "resumo": "MASTRO", "solucao": "Projeto", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS022", "resumo": "MASTRO", "solucao": "Projeto", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PJ001", "resumo": "PROJETO", "solucao": "Projeto — Projeto Prefeitura + ART + Comprovante Pagamento", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "RF001", "resumo": "REFORÇO", "solucao": "Projeto de Reforço de Rooftop (ex: casas, prédios ou outras edificações) + ART + Comprovante Pagamento", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "PJ002", "resumo": "PROJETO", "solucao": "Projeto Executivo (pranchas CW, EL, AT, Elevação, Detalhes)", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN029", "resumo": "INFRA", "solucao": "Proteção esteiramento — Proteção de esteiramento em chapa expandida galvanizada L=400 mm", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL054", "resumo": "ELÉTRICA", "solucao": "QDE Simplificado — Quadro QDE Simplificado, 1x disjuntor 32A (eqto), 1x disjuntor 32A (Reserva eqto) + 1x disjuntor 16A (tomada serviço)", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL055", "resumo": "ELÉTRICA", "solucao": "QM Bífasico — Caixa de medição Simplificado (QM) Bifásico p/ 1x medidor (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL056", "resumo": "ELÉTRICA", "solucao": "QM Monofásico — Caixa de medição Simplificado (QM) Monofásico p/ 1x medidor (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL057", "resumo": "ELÉTRICA", "solucao": "QM Monofásico — Caixa de medição (QM) Monofásico p/ 2x medidores (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL058", "resumo": "ELÉTRICA", "solucao": "QM Trifásico — Caixa de medição (QM) Trifásico p/ 2x medidores (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS023", "resumo": "MASTRO", "solucao": "Esteriamento Horizontal EV > 30m", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL059", "resumo": "ELÉTRICA", "solucao": "QTME Bifásico sem PPTA — Quadro QTME Bifásico, sem PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL060", "resumo": "ELÉTRICA", "solucao": "QTME Trifásico com PPTA — Quadro QTME Trifásico,com PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 5219.75 }, { "cod": "IN030", "resumo": "INFRA", "solucao": "Portão Tela — Portão pedestre tela", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR043", "resumo": "TORRE", "solucao": "Radome", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL061", "resumo": "ELÉTRICA", "solucao": "Ramal de Ligação — Ampliação do Ramal de Ligação ou Extensão de Rede BT (obs.: padrão TBSA até 50m incluso no ramal de ligação)", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AD002", "resumo": "ADMINISTRATIVO", "solucao": "Remobilização de Equipe: Nova mobilização de equipe, em decorrência de interrupção dos serviços não originada por ação e/ou omissão da contratada, mediante análise prévia Sites Brasil.", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD022", "resumo": "FUNDAÇÃO", "solucao": "Retroescavadeira com martelo rompedor", "config": "", "unid": "Dia", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD023", "resumo": "FUNDAÇÃO", "solucao": "Rompedor elétrico — Locação de rompedor elétrico", "config": "", "unid": "DIA", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD024", "resumo": "FUNDAÇÃO", "solucao": "Rompedor pneumático — Locação de rompedor  pneumático", "config": "", "unid": "Dia", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN031", "resumo": "INFRA", "solucao": "Rufos L=0,2m em cima do muro de alvenaria", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN032", "resumo": "INFRA", "solucao": "SKID (estrutura metálica) para suporte e fixação de Gabinetes", "config": "", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL062", "resumo": "ELÉTRICA", "solucao": "Solicitação de ligação de energia junto a concessionária local", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD025", "resumo": "FUNDAÇÃO", "solucao": "Sondagem a percussão com mínimo 2x furos (unitário por site) com Laudo Sondagem  + ART + Comprovante Pagamento", "config": "Sondagem", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD026", "resumo": "FUNDAÇÃO", "solucao": "Sondagem rotativa: furo adicional ou perfuração com profundidade superior a 20m, com aprovação prévia da Engenharia Sites.", "config": "Sondagem Especial", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD027", "resumo": "FUNDAÇÃO", "solucao": "Sondagem rotativa: mobilização eqto com mínimo 2x furos até 20m inclusive (soma dos furos) (unitário por site) com Laudo Sondagem + ART", "config": "Sondagem Especial", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS024", "resumo": "MASTRO", "solucao": "SPDA", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AT014", "resumo": "ATERRAMENTO", "solucao": "SPDA — Adequação dos  mastros de  para-raio existente do prédio\nServiços de reposicionamento, alteamento, reparo,  etc", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR044", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR045", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR046", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR047", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS025", "resumo": "MASTRO", "solucao": "Suporte RF em plataforma EV > 30m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS026", "resumo": "MASTRO", "solucao": "Suporte RF em plataforma EV > 30m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR048", "resumo": "TORRE", "solucao": "Suporte RF Montante", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR049", "resumo": "TORRE", "solucao": "Suporte RF Montante", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR050", "resumo": "TORRE", "solucao": "Suporte RF Topo", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR051", "resumo": "TORRE", "solucao": "Suporte RF Topo", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR052", "resumo": "TORRE", "solucao": "Suporte RF Topo", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR053", "resumo": "TORRE", "solucao": "Suporte TX", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR054", "resumo": "TORRE", "solucao": "Suporte TX Cinta", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR055", "resumo": "TORRE", "solucao": "Suporte TX Cinta", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS027", "resumo": "MASTRO", "solucao": "Suporte TX em plataforma EV > 30m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR056", "resumo": "TORRE", "solucao": "Suporte TX Montante", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR057", "resumo": "TORRE", "solucao": "Suporte TX Montante", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN033", "resumo": "INFRA", "solucao": "Telhado — Demolição telhado (Cobertura), inclusive calhas e rufos até os condutores de Água Pluviais", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN034", "resumo": "INFRA", "solucao": "Telhado — Recomposição do Telhado (Cobertura), inclusive calhas e rufos até os condutores de Água Pluviais", "config": "", "unid": "M2", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "FD028", "resumo": "FUNDAÇÃO", "solucao": "Terraplanagem — Regularização de desníveis (aclive/declive) ou Talude", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS028", "resumo": "MASTRO", "solucao": "Tipo Platibanda", "config": "AeV2m² | V45", "unid": "KG", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS029", "resumo": "MASTRO", "solucao": "Trava quedas", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS030", "resumo": "MASTRO", "solucao": "Trava quedas", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN035", "resumo": "INFRA", "solucao": "Vegetação — Remoção de vegetação alta, árvore, etc", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "TR058", "resumo": "TORRE", "solucao": "Metálico Autoportante", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "MS031", "resumo": "MASTRO", "solucao": "Acessórios Mastro, Poste Simplificado 9, 12, 18, Poste 30 e 40m e Torre 30 e 40m", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "EL063", "resumo": "ELÉTRICA", "solucao": "Caixa de medição (QM) Bifásico p/ 2x medidores (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN036", "resumo": "INFRA", "solucao": "Pavimentação em concreto", "config": "", "unid": "M3", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN037", "resumo": "INFRA", "solucao": "Pavimentação em asfalto", "config": "", "unid": "TON", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN038", "resumo": "INFRA", "solucao": "Enclausuramento (tampa) de esteiramento em chapa galvanizada L=600 mm", "config": "", "unid": "M", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN039", "resumo": "INFRA", "solucao": "Proteção de esteiramento em chapa expandida galvanizada L=600 mm", "config": "", "unid": "m", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "IN040", "resumo": "INFRA", "solucao": "Kit Anti-vandalismo ( gradil de proteção e porta cadeado, galvanizado a fogo ) p/ QTME (Quadro de Medição)", "config": "", "unid": "PÇ", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "AD003", "resumo": "ADMINISTRATIVO", "solucao": "FRETE ESTIMADO", "config": "", "unid": "VB", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_FRZ08", "resumo": "HIGHLINE", "solucao": "Solda nas Ferragens", "config": "Fundação / Estaca Raiz", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_CON02", "resumo": "HIGHLINE", "solucao": "Lona preta 200 micras", "config": "Área Construída", "unid": "m²", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_COM05", "resumo": "HIGHLINE", "solucao": "Caçamba", "config": "Itens complementares", "unid": "un", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_COM09", "resumo": "HIGHLINE", "solucao": "Grama", "config": "Itens complementares", "unid": "m²", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_TRA95", "resumo": "HIGHLINE", "solucao": "Picape Leve (Saveiro, Strada, Montana)", "config": "Transporte EV e Acessórios", "unid": "Km", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_TRA98", "resumo": "HIGHLINE", "solucao": "Carreta até 25t", "config": "Transporte EV e Acessórios", "unid": "Km", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_TRA99", "resumo": "HIGHLINE", "solucao": "Carreta até 32t", "config": "Transporte EV e Acessórios", "unid": "Km", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF09", "resumo": "HIGHLINE", "solucao": "PERFIL DOBRADO ATÉ 200KG", "config": "Reforço", "unid": "Kg", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF10", "resumo": "HIGHLINE", "solucao": "PERFIL DOBRADO DE 200 ATÉ 500KG", "config": "Reforço", "unid": "Kg", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF11", "resumo": "HIGHLINE", "solucao": "PERFIL DOBRADO DE 500 ATÉ 1000KG", "config": "Reforço", "unid": "Kg", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF13", "resumo": "HIGHLINE", "solucao": "CLIPES E CHAPAS", "config": "Reforço", "unid": "Kg", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF26", "resumo": "HIGHLINE", "solucao": "REMANEJAMENTO BTS", "config": "Reforço", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF28", "resumo": "HIGHLINE", "solucao": "REMANEJAMENTO RF", "config": "Reforço", "unid": "Pç", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF29", "resumo": "HIGHLINE", "solucao": "REMANEJAMENTO MW", "config": "Reforço", "unid": "Pç", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF36", "resumo": "HIGHLINE", "solucao": "TAXA DE BOMBEAMENTO POR REGIAO", "config": "Reforço", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF39", "resumo": "HIGHLINE", "solucao": "BOTA FORA", "config": "Reforço", "unid": "m³", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF50", "resumo": "HIGHLINE", "solucao": "LEVANTAMENTO PLANIALTIMÉTRICO", "config": "Reforço", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF54", "resumo": "HIGHLINE", "solucao": "MANUTENÇÃO CORRETIVA", "config": "Reforço", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_RFT10", "resumo": "HIGHLINE", "solucao": "Seal Tube 1''", "config": "Roof Top", "unid": "m", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_RFT11", "resumo": "HIGHLINE", "solucao": "Seal Tube 2''", "config": "Roof Top", "unid": "m", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_RFT14", "resumo": "HIGHLINE", "solucao": "Tubulação 2\" PVC", "config": "Roof Top", "unid": "m", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF16", "resumo": "HIGHLINE", "solucao": "MONTAGEM DE REFORÇO ESTRUTURAS", "config": "Reforço", "unid": "Kg", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF17", "resumo": "HIGHLINE", "solucao": "DESMONTAGEM DE ESTRUTURA E OU REFORÇO EXISTENTE", "config": "Reforço", "unid": "Kg", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF21", "resumo": "HIGHLINE", "solucao": "REAPERTO GERAL EV", "config": "Reforço", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF22", "resumo": "HIGHLINE", "solucao": "REPAROS NA ESTRUTURA/TRATAMENTO OXIDAÇÃO", "config": "Reforço", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF27", "resumo": "HIGHLINE", "solucao": "CONCRETO 25 MPA RODADO EM OBRA - COM ACOMPANHAMENTO TECNICO", "config": "Reforço", "unid": "m³", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF30", "resumo": "HIGHLINE", "solucao": "EXECUÇÃO DE FUNDAÇÃO RADIER (MÃO DE OBRA)", "config": "Reforço", "unid": "m³", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_REF51", "resumo": "HIGHLINE", "solucao": "ALINHAR ESTRUTURA VERTICAL", "config": "Reforço", "unid": "Vb", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_RFT05", "resumo": "HIGHLINE", "solucao": "Luminária com poste", "config": "Roof Top", "unid": "un", "qtde": 1, "vlLS": 0, "vlMercado": 0 }, { "cod": "HL_RFT14", "resumo": "HIGHLINE", "solucao": "Balizamento noturno LED - Com fotocélula", "config": "Roof Top", "unid": "un", "qtde": 1, "vlLS": 0, "vlMercado": 0 }], "mapeamento": [{ "itemHL": "SEN01", "descHL": "Projeto Executivo", "unidHL": "Vb", "codsLS": ["PJ002"], "obs": "Projeto Executivo LS" }, { "itemHL": "SEN02", "descHL": "As Built", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "SEN03", "descHL": "Revisão de Projeto de Prefeitura", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "SEN04", "descHL": "Revisão de Projeto Executivo", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "SEN05", "descHL": "Revisão de As Built", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "SEN06", "descHL": "Sondagem à percussão", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "SEN07", "descHL": "Sondagem Rotativa", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "SEN08", "descHL": "Laudo Estrutural para Roof Top", "unidHL": "Vb", "codsLS": ["LD001"], "obs": "Laudo estabilidade ou estrutural" }, { "itemHL": "SEN09", "descHL": "Projeto de Prefeitura", "unidHL": "Vb", "codsLS": ["PJ001"], "obs": "Projeto Prefeitura + ART" }, { "itemHL": "SEN10", "descHL": "Planialtimétrico", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "SEN11", "descHL": "Laudo Estrutural (RT) - Sem Vistoria", "unidHL": "Vb", "codsLS": ["LD002"], "obs": "Laudo estrutural rooftop" }, { "itemHL": "SEN12", "descHL": "Laudo Estrutural (RT) - Com Vistoria", "unidHL": "Vb", "codsLS": ["LD002"], "obs": "Laudo estrutural rooftop" }, { "itemHL": "FUNC01", "descHL": "Escavação Radier", "unidHL": "m³", "codsLS": ["FD001", "FD002"], "obs": "Escavação rasa ou profunda em solo" }, { "itemHL": "FUNC02", "descHL": "Escavação Tubulão", "unidHL": "m³", "codsLS": ["FD003"], "obs": "Escavação rocha" }, { "itemHL": "FUNC03", "descHL": "Concreto preparado e lançado - Até 20m³", "unidHL": "m³", "codsLS": ["FD005", "FD008"], "obs": "Concreto fck20 ou fck25" }, { "itemHL": "FUNC04", "descHL": "Concreto preparado e lançado - 20m³ a 50m³", "unidHL": "m³", "codsLS": ["FD005", "FD008"], "obs": "Concreto fck20 ou fck25 (volumes maiores)" }, { "itemHL": "FUNC07", "descHL": "Reaterro e compactação", "unidHL": "m³", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "FUNC08", "descHL": "Bota-fora", "unidHL": "m³", "codsLS": ["FD010"], "obs": "Bota fora remoção de terra" }, { "itemHL": "FUNC09", "descHL": "Forma em tábua de madeira comum", "unidHL": "m²", "codsLS": ["FD016"], "obs": "Formas" }, { "itemHL": "FUNC10", "descHL": "Aço de fundação (CA 50/CA 60)", "unidHL": "Kg", "codsLS": ["FD004", "FD009"], "obs": "Aço CA-50A ou CA-60A" }, { "itemHL": "FUNC12", "descHL": "Concreto magro p/regularização", "unidHL": "m³", "codsLS": ["FD011"], "obs": "Concreto magro / lastro" }, { "itemHL": "FUNC14", "descHL": "Escavação rasa em solo", "unidHL": "m³", "codsLS": ["FD002"], "obs": "Escavação rasa" }, { "itemHL": "FUNC15", "descHL": "Escavação profunda em solo", "unidHL": "m³", "codsLS": ["FD001"], "obs": "Escavação profunda" }, { "itemHL": "FUNC16", "descHL": "Escavação em rocha", "unidHL": "m³", "codsLS": ["FD003"], "obs": "Escavação rocha" }, { "itemHL": "FRZ01", "descHL": "Limpeza e Bota Fora da Estaca Raiz", "unidHL": "Vb", "codsLS": ["FD028"], "obs": "Preencher manualmente" }, { "itemHL": "FRZ02", "descHL": "Encamisamento de Tubulão", "unidHL": "m", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "FRZ03", "descHL": "Mobilização perfuratriz - estaca raiz", "unidHL": "un", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "FRZ04", "descHL": "Perfuração + argamassa estaca raiz (Solo)", "unidHL": "m", "codsLS": ["FD019"], "obs": "Micro Estaca Raiz solo" }, { "itemHL": "FRZ05", "descHL": "Perfuração + argamassa estaca raiz (Rocha)", "unidHL": "m", "codsLS": ["FD020"], "obs": "Preencher manualmente" }, { "itemHL": "FEC01", "descHL": "Tapume pintura face externa", "unidHL": "m²", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "FEC02", "descHL": "Fechamento - Alambrado c/ Arame farpado", "unidHL": "m²", "codsLS": ["IN003"], "obs": "Alambrado (tela militar)" }, { "itemHL": "FEC03", "descHL": "Fechamento - Muro c/ Concertina", "unidHL": "m²", "codsLS": ["IN021"], "obs": "Muro de alvenaria + concertina" }, { "itemHL": "FEC04", "descHL": "Fechamento - Cerca Paraguaia", "unidHL": "m²", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "FEC05", "descHL": "Instalação de concertina sobre alambrado", "unidHL": "m", "codsLS": ["IN022"], "obs": "Pétela de coqueiro / concertina" }, { "itemHL": "FEC06", "descHL": "1/2 Folha Portão - Alambrado", "unidHL": "un", "codsLS": ["IN018"], "obs": "Portão tela pedestre" }, { "itemHL": "FEC07", "descHL": "1/2 Folha Portão - Chapa", "unidHL": "un", "codsLS": ["IN017"], "obs": "Portão chapa pedestre" }, { "itemHL": "FEC08", "descHL": "Portão - Alambrado", "unidHL": "un", "codsLS": ["IN016"], "obs": "Portão tela veicular" }, { "itemHL": "FEC09", "descHL": "Portão - Chapa", "unidHL": "un", "codsLS": ["IN016"], "obs": "Portão chapa veicular" }, { "itemHL": "FEC10", "descHL": "Portão para pedestre - Alambrado", "unidHL": "un", "codsLS": ["IN018"], "obs": "Portão pedestre tela" }, { "itemHL": "CON03", "descHL": "Caixa de passagem para instalações elétricas", "unidHL": "un", "codsLS": ["IN009", "IN010", "IN013", "IN014"], "obs": "Caixas de passagem de vários tipos" }, { "itemHL": "CON04", "descHL": "Base de equipamento em concreto armado", "unidHL": "m³", "codsLS": ["FD025"], "obs": "Base em concreto armado" }, { "itemHL": "CON06", "descHL": "Adequação/Alvenaria - Em muro existente", "unidHL": "m²", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "CON10", "descHL": "Muro de arrimo", "unidHL": "m²", "codsLS": ["FD022"], "obs": "Muro arrimo em concreto armado" }, { "itemHL": "CON11", "descHL": "Execução de Muro em Alvenaria", "unidHL": "m²", "codsLS": ["IN020"], "obs": "Muro alvenaria + proteção concertina" }, { "itemHL": "ENT01", "descHL": "QD/QTM - Com Alvenaria (Padrão)", "unidHL": "un", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "ENT03", "descHL": "Suporte para QD/QTM", "unidHL": "un", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "ENT04", "descHL": "Grade para medidor", "unidHL": "un", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "ENT05", "descHL": "Tomada Steck", "unidHL": "un", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "ENT06", "descHL": "Padrão novo para 1 medidor - Com ligação definitiva", "unidHL": "un", "codsLS": ["EL027"], "obs": "Padrão de entrada BT (vários tipos EL027-EL030)" }, { "itemHL": "ENT07", "descHL": "Padrão novo para 2 medidores - Com ligação definitiva", "unidHL": "un", "codsLS": ["EL027"], "obs": "Padrão de entrada BT 2 medidores" }, { "itemHL": "ENT08", "descHL": "Ampliação do padrão de 1 para 2 medidores", "unidHL": "un", "codsLS": ["EL026"], "obs": "Adequação Padrão de entrada" }, { "itemHL": "INFR01", "descHL": "Malha de aterramento", "unidHL": "m", "codsLS": ["AT001", "AT002", "AT003", "AT007", "AT008", "AT005", "AT006", "AT009"], "obs": "Cabo verde 50mm²+25mm²+16mm² + Cordoalha Cu+Aço + Haste + Cabo aço 1/2\" + Conector FCI" }, { "itemHL": "INFR02", "descHL": "Seal Tube 1''", "unidHL": "m", "codsLS": ["EL026"], "obs": "Eletroduto PVC flexível 1/2-1\"" }, { "itemHL": "INFR03", "descHL": "Seal Tube 2''", "unidHL": "m", "codsLS": ["EL027"], "obs": "Eletroduto PVC flexível 1.5-2\"" }, { "itemHL": "INFR04", "descHL": "Tubulação 1\" Galvanizada a fogo", "unidHL": "m", "codsLS": ["EL039"], "obs": "Eletroduto FGF 1/2-1\"" }, { "itemHL": "INFR05", "descHL": "Tubulação 2\" Galvanizada a fogo", "unidHL": "m", "codsLS": ["EL037"], "obs": "Eletroduto FGF 1.5-2\"" }, { "itemHL": "INFR06", "descHL": "Tubulação 3\" Galvanizada a fogo", "unidHL": "m", "codsLS": ["EL036"], "obs": "Eletroduto FGF 2.5-3\"" }, { "itemHL": "INFR07", "descHL": "Tubulação 1\" PVC", "unidHL": "m", "codsLS": ["EL049"], "obs": "Eletroduto rígido PVC 1/2-1\"" }, { "itemHL": "INFR08", "descHL": "Tubulação 2\" PVC", "unidHL": "m", "codsLS": ["EL050"], "obs": "Eletroduto rígido PVC 1.5-2\"" }, { "itemHL": "INFR09", "descHL": "Cabo Multiplex Alum - 4 vias 35mm", "unidHL": "m", "codsLS": ["EL016"], "obs": "Cabo multiplexado 3x35mm²" }, { "itemHL": "INFR10", "descHL": "Cabo flexível #10mm² isol. 750V", "unidHL": "m", "codsLS": ["EL003"], "obs": "Cabo flexível cobre 10mm²" }, { "itemHL": "INFR11", "descHL": "Cabo flexível #25mm² isol. 750V", "unidHL": "m", "codsLS": ["EL005", "EL212"], "obs": "Cabo flexível cobre 25mm² ou alumínio" }, { "itemHL": "INFR12", "descHL": "Cabo flexível #35mm² isol. 750V", "unidHL": "m", "codsLS": ["EL006"], "obs": "Cabo flexível cobre 35mm²" }, { "itemHL": "INFR13", "descHL": "Cabo flexível #50mm² isol. 750V", "unidHL": "m", "codsLS": ["EL217"], "obs": "Cabo flexível cobre 50mm²" }, { "itemHL": "INFR14", "descHL": "Cabo flexível #10mm² isol. 0,6/1,0Kv", "unidHL": "m", "codsLS": ["EL003"], "obs": "Cabo flexível cobre 10mm²" }, { "itemHL": "INFR15", "descHL": "Cabo flexível #16mm² isol. 0,6/1,0Kv", "unidHL": "m", "codsLS": ["EL004"], "obs": "Cabo flexível cobre 16mm²" }, { "itemHL": "INFR16", "descHL": "Poste de iluminação Telecônico", "unidHL": "un", "codsLS": ["EL043"], "obs": "Poste iluminação aço galvanizado" }, { "itemHL": "MON01", "descHL": "Montagem de Torre Autoportante 30m", "unidHL": "Vb", "codsLS": ["TR001"], "obs": "Torre autoportante 30m" }, { "itemHL": "MON02", "descHL": "Montagem de Torre Autoportante 40m", "unidHL": "Vb", "codsLS": ["TR002"], "obs": "Torre autoportante 40m" }, { "itemHL": "MON03", "descHL": "Montagem de Torre Autoportante 50m", "unidHL": "Vb", "codsLS": ["TR003"], "obs": "Torre autoportante 50m" }, { "itemHL": "MON04", "descHL": "Montagem de Torre Autoportante 60m", "unidHL": "Vb", "codsLS": ["TR004"], "obs": "Torre autoportante 60m" }, { "itemHL": "MON05", "descHL": "Montagem de Torre Autoportante 70m", "unidHL": "Vb", "codsLS": ["TR005"], "obs": "Torre autoportante 70m" }, { "itemHL": "MON06", "descHL": "Montagem de Torre Autoportante 80m", "unidHL": "Vb", "codsLS": ["TR006"], "obs": "Torre autoportante 80m" }, { "itemHL": "MON07", "descHL": "Montagem de Poste Autoportante 30m", "unidHL": "Vb", "codsLS": ["PS025"], "obs": "Poste autoportante 30m" }, { "itemHL": "MON08", "descHL": "Montagem de Poste Autoportante 40m", "unidHL": "Vb", "codsLS": ["PS026"], "obs": "Montagem poste 40m" }, { "itemHL": "TRA94", "descHL": "Descarga Mecanizada - Munk", "unidHL": "Vb", "codsLS": [], "obs": "Preencher manualmente" }, { "itemHL": "TRA97", "descHL": "Truck até 14t", "unidHL": "Km", "codsLS": ["LG001", "LG002", "LG003"], "obs": "Frete transporte (km)" }, { "itemHL": "ACS01", "descHL": "Via de acesso simples", "unidHL": "m", "codsLS": ["IN001"], "obs": "2a. abordagem FO / Acesso veicular" }, { "itemHL": "ACS02", "descHL": "Via de acesso Completa", "unidHL": "m", "codsLS": ["IN001"], "obs": "Acesso veicular completo" }, { "itemHL": "FRZ08", "descHL": "Solda nas Ferragens", "unidHL": "Vb", "codsLS": ["HL_FRZ08"], "obs": "Mapeamento 1:1" }, { "itemHL": "CON02", "descHL": "Lona preta 200 micras", "unidHL": "m²", "codsLS": ["HL_CON02"], "obs": "Mapeamento 1:1" }, { "itemHL": "COM03", "descHL": "Caçamba", "unidHL": "un", "codsLS": ["HL_COM03"], "obs": "Mapeamento 1:1" }, { "itemHL": "COM08", "descHL": "Grama", "unidHL": "m²", "codsLS": ["HL_COM08"], "obs": "Mapeamento 1:1" }, { "itemHL": "TRA95", "descHL": "Picape Leve", "unidHL": "Km", "codsLS": ["HL_TRA95"], "obs": "Mapeamento 1:1" }, { "itemHL": "TRA98", "descHL": "Carreta até 25t", "unidHL": "Km", "codsLS": ["HL_TRA98"], "obs": "Mapeamento 1:1" }, { "itemHL": "TRA99", "descHL": "Carreta até 32t", "unidHL": "Km", "codsLS": ["HL_TRA99"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF09", "descHL": "PERFIL DOBRADO ATÉ 200KG", "unidHL": "Kg", "codsLS": ["HL_REF09"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF10", "descHL": "PERFIL DOBRADO DE 200 ATÉ 500KG", "unidHL": "Kg", "codsLS": ["HL_REF10"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF11", "descHL": "PERFIL DOBRADO DE 500 ATÉ 1000KG", "unidHL": "Kg", "codsLS": ["HL_REF11"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF12", "descHL": "PERFIL DOBRADO ACIMA DE 1000KG", "unidHL": "Kg", "codsLS": ["HL_REF12"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF13", "descHL": "CLIPES E CHAPAS", "unidHL": "Kg", "codsLS": ["HL_REF13"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF16", "descHL": "MONTAGEM DE REFORÇO ESTRUTURAS", "unidHL": "Kg", "codsLS": ["HL_REF16"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF17", "descHL": "DESMONTAGEM DE ESTRUTURA", "unidHL": "Kg", "codsLS": ["HL_REF17"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF21", "descHL": "REAPERTO GERAL EV", "unidHL": "Vb", "codsLS": ["HL_REF21"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF22", "descHL": "REPAROS/TRATAMENTO OXIDAÇÃO", "unidHL": "Vb", "codsLS": ["HL_REF22"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF27", "descHL": "CONCRETO 25 MPA RODADO EM OBRA", "unidHL": "m³", "codsLS": ["HL_REF27"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF30", "descHL": "EXECUÇÃO FUNDAÇÃO RADIER", "unidHL": "m³", "codsLS": ["HL_REF30"], "obs": "Mapeamento 1:1" }, { "itemHL": "REF51", "descHL": "ALINHAR ESTRUTURA VERTICAL", "unidHL": "Vb", "codsLS": ["HL_REF51"], "obs": "Mapeamento 1:1" }, { "itemHL": "RFT05", "descHL": "Luminária com poste", "unidHL": "un", "codsLS": ["HL_RFT05"], "obs": "Mapeamento 1:1" }, { "itemHL": "RFT14", "descHL": "Balizamento noturno LED", "unidHL": "un", "codsLS": ["HL_RFT14"], "obs": "Mapeamento 1:1" }], "pvTemplate": [{ "atividade": "Serviços de Engenharia", "item": "SEN01", "desc": "Projeto Executivo", "unid": "Vb", "vlUnit": 3755.14 }, { "atividade": "Serviços de Engenharia", "item": "SEN02", "desc": "As Built", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Serviços de Engenharia", "item": "SEN03", "desc": "Revisão de Projeto de Prefeitura (Compartilhamento ou ampliação)", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Serviços de Engenharia", "item": "SEN04", "desc": "Revisão de Projeto Executivo (Compartilhamento ou ampliação)", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Serviços de Engenharia", "item": "SEN05", "desc": "Revisão de As Built (Compartilhamento ou ampliação)", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Serviços de Engenharia", "item": "SEN06", "desc": "Sondagem à percussão", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Serviços de Engenharia", "item": "SEN07", "desc": "Sondagem Rotativa", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Serviços de Engenharia", "item": "SEN08", "desc": "Laudo Estrutural para Roof Top", "unid": "Vb", "vlUnit": 5835.82 }, { "atividade": "Serviços de Engenharia", "item": "SEN09", "desc": "Projeto de Prefeitura", "unid": "Vb", "vlUnit": 1763.98 }, { "atividade": "Serviços de Engenharia", "item": "SEN10", "desc": "Planialtimétrico", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Serviços de Engenharia", "item": "SEN11", "desc": "Laudo Estrutural (RT) - Sem Vistoria", "unid": "Vb", "vlUnit": 5876.61 }, { "atividade": "Serviços de Engenharia", "item": "SEN12", "desc": "Laudo Estrutural (RT) - Com Vistoria", "unid": "Vb", "vlUnit": 5876.61 }, { "atividade": "Fundação / Comum", "item": "FUNC01", "desc": "Escavação Radier", "unid": "m³", "vlUnit": 31.49 }, { "atividade": "Fundação / Comum", "item": "FUNC02", "desc": "Escavação Tubulão", "unid": "m³", "vlUnit": 47.9 }, { "atividade": "Fundação / Comum", "item": "FUNC03", "desc": "Concreto preparado e lançado(fck. conf.projeto)  - Até 20m³", "unid": "m³", "vlUnit": 23.52 }, { "atividade": "Fundação / Comum", "item": "FUNC04", "desc": "Concreto preparado e lançado(fck. conf.projeto)  - 20m³ a 50m³", "unid": "m³", "vlUnit": 23.52 }, { "atividade": "Fundação / Comum", "item": "FUNC05", "desc": "Concreto preparado e lançado(fck. conf.projeto)  - 50m³ a 80m³", "unid": "m³", "vlUnit": 0 }, { "atividade": "Fundação / Comum", "item": "FUNC06", "desc": "Concreto preparado e lançado(fck. conf.projeto)  - 80m³ a 100m³", "unid": "m³", "vlUnit": 0 }, { "atividade": "Fundação / Comum", "item": "FUNC07", "desc": "Concreto preparado e lançado(fck. conf.projeto)  - Acima de 100m³", "unid": "m³", "vlUnit": 0.0 }, { "atividade": "Fundação / Comum", "item": "FUNC08", "desc": "Reaterro e compactação", "unid": "m³", "vlUnit": 121.54 }, { "atividade": "Fundação / Comum", "item": "FUNC09", "desc": "Bota-fora", "unid": "m³", "vlUnit": 144.05 }, { "atividade": "Fundação / Comum", "item": "FUNC10", "desc": "Forma em tábua de madeira comum", "unid": "m²", "vlUnit": 2798.21 }, { "atividade": "Fundação / Comum", "item": "FUNC11", "desc": "Aço de fundação (CA 50 / CA 60) para tubulão ou radier", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Fundação / Comum", "item": "FUNC12", "desc": "Lastro de brita nº 2", "unid": "m³", "vlUnit": 630.44 }, { "atividade": "Fundação / Comum", "item": "FUNC13", "desc": "Concreto magro p/regularização (não estrutural)", "unid": "m³", "vlUnit": 0 }, { "atividade": "Fundação / Comum", "item": "FUNC14", "desc": "Concreto ciclópico", "unid": "m³", "vlUnit": 905.96 }, { "atividade": "Fundação / Comum", "item": "FUNC15", "desc": "Limpeza e Bota Fora da Estaca Raiz", "unid": "Vb", "vlUnit": 31.49 }, { "atividade": "Fundação / Comum", "item": "FUNC16", "desc": "Encamisamento de Tubulão com manilha de concreto, incluso içamento com munck se necessário", "unid": "m", "vlUnit": 47.9 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ01", "desc": "Mobilização perfuratriz - estaca raiz", "unid": "un", "vlUnit": 1273.69 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ02", "desc": "Perfuração + argamassa para estaca raiz (Solo Comum)", "unid": "m", "vlUnit": 0.0 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ03", "desc": "Perfuração + argamassa para estaca raiz (Rochoso)", "unid": "m", "vlUnit": 0.0 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ04", "desc": "Arame Recozido", "unid": "kg", "vlUnit": 1646.66 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ05", "desc": "Gerador de Energia", "unid": "Vb", "vlUnit": 39831.92 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ06", "desc": "Água para estaca-raiz (modalidade fornecimento material)", "unid": "m³", "vlUnit": 0 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ07", "desc": "Aço de fundação (CA 50 / CA 60) para estacas-raiz, blocos de coroamento e viga de ligação", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Fundação / Estaca Raiz", "item": "FRZ08", "desc": "Solda nas Ferragens", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Fechamento", "item": "FEC01", "desc": "Tapume h=225cm apoiado no terreno e pintura latex face externa (Quando solicitado pela HL)", "unid": "m²", "vlUnit": 0.0 }, { "atividade": "Fechamento", "item": "FEC02", "desc": "Fechamento - Alambrado c/ Arame farpado", "unid": "m²", "vlUnit": 10789.55 }, { "atividade": "Fechamento", "item": "FEC03", "desc": "Fechamento - Muro c/ Concertina", "unid": "m²", "vlUnit": 3158.23 }, { "atividade": "Fechamento", "item": "FEC04", "desc": "Fechamento - Cerca Paraguaia", "unid": "m²", "vlUnit": 0.0 }, { "atividade": "Fechamento", "item": "FEC05", "desc": "Instalação de concertina sobre alambrado (Quando solicitado pela HL)", "unid": "m", "vlUnit": 3316.7 }, { "atividade": "Fechamento", "item": "FEC06", "desc": "1/2 Folha Portão - Alambrado", "unid": "un", "vlUnit": 375.09 }, { "atividade": "Fechamento", "item": "FEC07", "desc": "1/2 Folha Portão - Chapa", "unid": "un", "vlUnit": 374.95 }, { "atividade": "Fechamento", "item": "FEC08", "desc": "Portão - Alambrado", "unid": "un", "vlUnit": 512.46 }, { "atividade": "Fechamento", "item": "FEC09", "desc": "Portão - Chapa", "unid": "un", "vlUnit": 512.46 }, { "atividade": "Fechamento", "item": "FEC10", "desc": "Portão para pedestre - Alambrado", "unid": "un", "vlUnit": 375.09 }, { "atividade": "Fechamento", "item": "FEC12", "desc": "Cadeado MULT-LOCK com corrente", "unid": "un", "vlUnit": 0 }, { "atividade": "Fechamento", "item": "FEC13", "desc": "Cadeado com segredo com corrente", "unid": "un", "vlUnit": 0 }, { "atividade": "Área Construída", "item": "CON01", "desc": "Execução de passeio com guia e Sarjeta", "unid": "m²", "vlUnit": 0 }, { "atividade": "Área Construída", "item": "CON02", "desc": "Lona preta 200 micras", "unid": "m²", "vlUnit": 0.0 }, { "atividade": "Área Construída", "item": "CON03", "desc": "Pedra Brita Nº 2", "unid": "m³", "vlUnit": 710.02 }, { "atividade": "Área Construída", "item": "CON04", "desc": "Caixa de passagem para instalações elétricas", "unid": "un", "vlUnit": 8164.05 }, { "atividade": "Área Construída", "item": "CON06", "desc": "Base de equipamento em concreto armado", "unid": "m³", "vlUnit": 0.0 }, { "atividade": "Área Construída", "item": "CON07", "desc": "Skid metálico (galvanizado à fogo)", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Área Construída", "item": "CON08", "desc": "Adequação/Alvenaria - Em muro existente", "unid": "m²", "vlUnit": 0 }, { "atividade": "Área Construída", "item": "CON09", "desc": "Chapisco de muro - Em muro existente", "unid": "m²", "vlUnit": 0 }, { "atividade": "Área Construída", "item": "CON10", "desc": "Demolição de muro existente", "unid": "m²", "vlUnit": 3763.12 }, { "atividade": "Área Construída", "item": "CON11", "desc": "Muro de arrimo", "unid": "m²", "vlUnit": 173.57 }, { "atividade": "Área Construída", "item": "CON12", "desc": "Execução de Muro em Alvenaria", "unid": "m²", "vlUnit": 0 }, { "atividade": "Área Construída", "item": "CON13", "desc": "Conector FCI Barra - Para esteira", "unid": "un", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT01", "desc": "QD/ QTM - Com Alvenaria (Padrão Claro)", "unid": "un", "vlUnit": 0.0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT02", "desc": "QD/ QTM - Com Alvenaria (Padrão Vivo)", "unid": "un", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT03", "desc": "QD/ QTM - Com Alvenaria (Padrão Tim)", "unid": "un", "vlUnit": 0.0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT02", "desc": "Suporte para QD/ QTM", "unid": "un", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT03", "desc": "Grade para medidor", "unid": "un", "vlUnit": 0.0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT04", "desc": "Tomada Steck", "unid": "un", "vlUnit": 0.0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT05", "desc": "Padrão novo para 1 medidor - Com ligação definitiva", "unid": "un", "vlUnit": 0.0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT06", "desc": "Padrão novo para 2 medidores - Com ligação definitiva", "unid": "un", "vlUnit": 847.56 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT07", "desc": "Ampliação do padrão de 1 para 2 medidores - Com ligação definitiva", "unid": "un", "vlUnit": 847.56 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT08", "desc": "Ampliação do padrão de 2 para 3 medidores - Com ligação definitiva", "unid": "un", "vlUnit": 6960.74 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT09", "desc": "Ampliação do padrão de 3 para 4 medidores - Com ligação definitiva", "unid": "un", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT10", "desc": "Ampliação do padrão de 2 para 4 medidores - Com ligação definitiva", "unid": "un", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT11", "desc": "Projeto de ampliação do padrão - Memorial, carta de aprovação e ART", "unid": "un", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT12", "desc": "Cabo Cobre Isolado EPR-06/1KV # 4mm²", "unid": "m", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT13", "desc": "Eletroduto Corrugado Tipo KANAFLEX Ø 1\"", "unid": "m", "vlUnit": 0 }, { "atividade": "Energia / Entrada de Energia", "item": "ENT14", "desc": "Eletroduto Corrugado Tipo KANAFLEX Ø 2\"", "unid": "m", "vlUnit": 0 }, { "atividade": "Energia / Infra - Site", "item": "INFR01", "desc": "Malha de aterramento", "unid": "m", "vlUnit": 86.85 }, { "atividade": "Energia / Infra - Site", "item": "INFR02", "desc": "Seal Tube 1''", "unid": "m", "vlUnit": 6960.74 }, { "atividade": "Energia / Infra - Site", "item": "INFR03", "desc": "Seal Tube 2''", "unid": "m", "vlUnit": 847.56 }, { "atividade": "Energia / Infra - Site", "item": "INFR04", "desc": "Tubulação 1\" Galvanizada à fogo", "unid": "m", "vlUnit": 596.56 }, { "atividade": "Energia / Infra - Site", "item": "INFR05", "desc": "Tubulação 2\" Galvanizada à fogo", "unid": "m", "vlUnit": 402.91 }, { "atividade": "Energia / Infra - Site", "item": "INFR06", "desc": "Tubulação 3\" Galvanizada à fogo", "unid": "m", "vlUnit": 194.86 }, { "atividade": "Energia / Infra - Site", "item": "INFR07", "desc": "Tubulação 1\" PVC", "unid": "m", "vlUnit": 66.96 }, { "atividade": "Energia / Infra - Site", "item": "INFR08", "desc": "Tubulação 2\" PVC", "unid": "m", "vlUnit": 82.13 }, { "atividade": "Energia / Infra - Site", "item": "INFR09", "desc": "Cabo Multiplex Alum - 4 vias 35mm", "unid": "m", "vlUnit": 26.46 }, { "atividade": "Energia / Infra - Site", "item": "INFR10", "desc": "Cabo flexível #10mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 22.59 }, { "atividade": "Energia / Infra - Site", "item": "INFR11", "desc": "Cabo flexível #25mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 31.73 }, { "atividade": "Energia / Infra - Site", "item": "INFR12", "desc": "Cabo flexível #35mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 74.63 }, { "atividade": "Energia / Infra - Site", "item": "INFR13", "desc": "Cabo flexível #50mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 0.0 }, { "atividade": "Energia / Infra - Site", "item": "INFR14", "desc": "Cabo flexível #10mm² isol.  0,6/1,0Kv", "unid": "m", "vlUnit": 22.59 }, { "atividade": "Energia / Infra - Site", "item": "INFR15", "desc": "Cabo flexível #16mm² isol.  0,6/1,0Kv", "unid": "m", "vlUnit": 31.41 }, { "atividade": "Energia / Infra - Site", "item": "INFR16", "desc": "Poste de iluminação Telecônico Curvo Simples Flangeado com luminária inclusa", "unid": "un", "vlUnit": 3267.67 }, { "atividade": "Itens complementares", "item": "COM01", "desc": "Caixa de alumínio", "unid": "un", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM02", "desc": "Acessórios metálicos (mastro, costela de vaca, esteira horizontal e suportes de antena adicionais)", "unid": "kg", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM03", "desc": "Segunda Mobilização (acima de 500Km da sede da companhia)", "unid": "un", "vlUnit": 0.0 }, { "atividade": "Itens complementares", "item": "COM04", "desc": "Supressão de Vegetação existente (Limpeza de mato rasteiro, entulho e objetos existentes no site)", "unid": "un", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM05", "desc": "Caçamba", "unid": "un", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM06", "desc": "Retirada de Arvore de Pequeno Porte - Até 2,4m (Sem incluir licenciamento)", "unid": "un", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM07", "desc": "Retirada de Arvore de Grande Porte - Acima de 2,4m (Sem incluir licenciamento)", "unid": "un", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM08", "desc": "Sistema de Drenagem (Ao redor do site, por metro linear)", "unid": "m", "vlUnit": 0.0 }, { "atividade": "Itens complementares", "item": "COM09", "desc": "Grama", "unid": "m²", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM10", "desc": "Logistica de Obra (Transporte dos materiais de obra)", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM11", "desc": "Escada de Acesso de até 1,5m de largura", "unid": "m", "vlUnit": 0 }, { "atividade": "Itens complementares", "item": "COM12", "desc": "Corte, Regularização e Nivelamento do Talude", "unid": "m²", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV01", "desc": "Suporte MW Canto Adicional 0,6", "unid": "un", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV02", "desc": "Suporte MW Canto Adicional 0,9", "unid": "un", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV03", "desc": "Suporte MW Canto Adicional 1,2", "unid": "un", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV04", "desc": "Suporte MW Face Adicional 0,6", "unid": "un", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV05", "desc": "Suporte MW Face Adicional 0,9", "unid": "un", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV06", "desc": "Suporte MW Face Adicional 1,2", "unid": "un", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV07", "desc": "Suporte de RF", "unid": "un", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV08", "desc": "Esteiramento Encapsulado", "unid": "m", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV09", "desc": "Esteiramento Aéreo", "unid": "m", "vlUnit": 0 }, { "atividade": "Acessórios EV", "item": "AEV10", "desc": "Esteiramento Aéreo Encapsulado", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT01", "desc": "Estrutura de derivação - Compacta Bifásica", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT02", "desc": "Estrutura de derivação - Compacta Monofásica", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT03", "desc": "Estrutura de derivação -Compacta Trifásica", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT04", "desc": "Estrutura de derivação - Convencional Bifásica", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT05", "desc": "Estrutura de derivação - Convencional Monofásica", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT06", "desc": "Estrutura de derivação - Convencional Trifásica", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT07", "desc": "Subestação  - 15 kV - transformador monofásico - 10 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT08", "desc": "Subestação  - 15 kV - transformador bifásico - 10 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT09", "desc": "Subestação - 15 kV - transformador trifásico - 15 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT10", "desc": "Subestação - 15 kV - transformador trifásico - 30 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT11", "desc": "Subestação - 15 kV - transformador trifásico - 45 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT12", "desc": "Subestação - 15 kV - transformador trifásico - 75 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT13", "desc": "Subestação  - 25 kV - transformador monofásico - 10 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT14", "desc": "Subestação - 25 kV - transformador bifásico - 10 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT15", "desc": "Subestação - 25 kV - transformador trifásico - 15 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT16", "desc": "Subestação - 25 kV - transformador trifásico - 30 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT17", "desc": "Subestação - 25 kV - transformador trifásico - 45 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT18", "desc": "Subestação - 25 kV - transformador trifásico - 75 kVA", "unid": "Unid", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT19", "desc": "Extensão de Rede Aérea  - Baixa tensão - Compacta  Monofásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT20", "desc": "Extensão de Rede Aérea  - Baixa tensão - Compacta Bifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT21", "desc": "Extensão de Rede Aérea  - Baixa tensão - Compacta  Trifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT22", "desc": "Extensão de Rede Aérea  - Baixa tensão - Convencional  Monofásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT23", "desc": "Extensão de Rede Aérea  - Baixa tensão - Convencional  Bifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT24", "desc": "Extensão de Rede Aérea  - Baixa tensão - Convencional  Trifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT25", "desc": "Extensão de Rede Aérea  - Alta tensão (15 kV)Compacta - Monofásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT26", "desc": "Extensão de Rede Aérea - Alta tensão  (15 kV)Compacta - Bifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT27", "desc": "Extensão de Rede Aérea - Alta tensão  (15 kV)Compacta - Trifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT28", "desc": "Extensão de Rede Aérea  - Alta tensão (15 kV)  Convencional  - Monofásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT29", "desc": "Extensão de Rede Aérea  - Alta tensão (15 kV)Convencional - Bifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT30", "desc": "Extensão de Rede Aérea - Alta tensão  (15 kV)Convencional - Trifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT31", "desc": "Extensão de Rede Aérea  - Alta tensão (25 kV)Compacta - Monofásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT32", "desc": "Extensão de Rede Aérea - Alta tensão  (25 kV)Compacta - Bifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT33", "desc": "Extensão de Rede Aérea  - Alta tensão  (25 kV)Compacta - Trifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT34", "desc": "Extensão de Rede Aérea  - Alta tensão (25 kV)  Convencional  - Monofásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT35", "desc": "Extensão de Rede Aérea  - Alta tensão (25 kV)Convencional - Bifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Extensão de Rede", "item": "EXT36", "desc": "Extensão de Rede Aérea  - Alta tensão  (25 kV)Convencional - Trifásica", "unid": "m", "vlUnit": 0 }, { "atividade": "Acesso", "item": "ACS01", "desc": "Via de acesso simples (Raspagem Superficial)", "unid": "m", "vlUnit": 3569.6 }, { "atividade": "Acesso", "item": "ACS02", "desc": "Via de acesso Completa (Raspagem, canaletas, curvas de nivel, caixas secas, sistema de drenagem)", "unid": "m", "vlUnit": 3569.6 }, { "atividade": "Montagem", "item": "MON01", "desc": "Montagem de Torre Autoportante 30m", "unid": "Vb", "vlUnit": 61412.8 }, { "atividade": "Montagem", "item": "MON02", "desc": "Montagem de Torre Autoportante 40m", "unid": "Vb", "vlUnit": 65386.6 }, { "atividade": "Montagem", "item": "MON03", "desc": "Montagem de Torre Autoportante 50m", "unid": "Vb", "vlUnit": 70867.47 }, { "atividade": "Montagem", "item": "MON04", "desc": "Montagem de Torre Autoportante 60m", "unid": "Vb", "vlUnit": 75539.4 }, { "atividade": "Montagem", "item": "MON05", "desc": "Montagem de Torre Autoportante 70m", "unid": "Vb", "vlUnit": 63883.77 }, { "atividade": "Montagem", "item": "MON06", "desc": "Montagem de Torre Autoportante 80m", "unid": "Vb", "vlUnit": 68225.04 }, { "atividade": "Montagem", "item": "MON07", "desc": "Montagem de Poste Autoportante 30m", "unid": "Vb", "vlUnit": 1550.57 }, { "atividade": "Montagem", "item": "MON08", "desc": "Montagem de Poste Autoportante 40m", "unid": "Vb", "vlUnit": 14259.29 }, { "atividade": "Montagem", "item": "MON09", "desc": "Montagem de Poste Autoportante 50m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON10", "desc": "Montagem de Poste Autoportante 60m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON11", "desc": "Pintura de Torre Autoportante 30m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON12", "desc": "Pintura de Torre Autoportante 40m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON13", "desc": "Pintura de Torre Autoportante 50m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON14", "desc": "Pintura de Torre Autoportante 60m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON15", "desc": "Pintura de Torre Autoportante 70m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON16", "desc": "Pintura de Torre Autoportante 80m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON17", "desc": "Pintura de Poste Autoportante 30m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON18", "desc": "Pintura de Poste Autoportante 40m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON19", "desc": "Pintura de Poste Autoportante 50m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Montagem", "item": "MON20", "desc": "Pintura de Poste Autoportante 60m", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Transporte EV e Acessórios", "item": "TRA94", "desc": "Descarga Mecanizada - Munk", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Transporte EV e Acessórios", "item": "TRA95", "desc": "Picape Leve (Saveiro, Strada, Montana)", "unid": "Km", "vlUnit": 0.0 }, { "atividade": "Transporte EV e Acessórios", "item": "TRA96", "desc": "Transporte Veiculo Urbano de Carga - Ducato, Iveco daily, HR, Kia Bongo (Transporte de Chumbadores e pequenas cargas) até 1,5t", "unid": "Km", "vlUnit": 0 }, { "atividade": "Transporte EV e Acessórios", "item": "TRA97", "desc": "Truck até 14t", "unid": "Km", "vlUnit": 6966.64 }, { "atividade": "Transporte EV e Acessórios", "item": "TRA98", "desc": "Carreta até 25t", "unid": "Km", "vlUnit": 0.0 }, { "atividade": "Transporte EV e Acessórios", "item": "TRA99", "desc": "Carreta até 32t", "unid": "Km", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF01", "desc": "REFORÇO ESTRUTURAL EM CANTONEIRAS ATÉ 200KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF02", "desc": "REFORÇO ESTRUTURAL EM CANTONEIRAS DE 200 ATÉ 500KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF03", "desc": "REFORÇO ESTRUTURAL EM CANTONEIRAS DE 500 ATÉ 1000KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF04", "desc": "REFORÇO ESTRUTURAL EM CANTONEIRAS ACIMA DE 1000KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF05", "desc": "REFORÇO ESTRUTURAL EM BARRA MACIÇA ATÉ 200KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF06", "desc": "REFORÇO ESTRUTURAL EM BARRA MACIÇA DE 200 ATÉ 500KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF07", "desc": "REFORÇO ESTRUTURAL EM BARRA MACIÇA DE 500 ATÉ 1000KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF08", "desc": "REFORÇO ESTRUTURAL EM BARRA MACIÇA ACIMA DE 1000KG", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF09", "desc": "PERFIL DOBRADO ATÉ 200KG", "unid": "Kg", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF10", "desc": "PERFIL DOBRADO DE 200 ATÉ 500KG", "unid": "Kg", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF11", "desc": "PERFIL DOBRADO DE 500 ATÉ 1000KG", "unid": "Kg", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF12", "desc": "PERFIL DOBRADO ACIMA DE 1000KG", "unid": "Kg", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF13", "desc": "CLIPES E CHAPAS", "unid": "Kg", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF14", "desc": "FORNECIMENTO E APLICAÇÃO DE CODBOLT ATÉ 5/8\"", "unid": "Unid.", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF15", "desc": "FORNECIMENTO E APLICAÇÃO DE CODBOLT  DE 3/4\" OU ACIMA", "unid": "Unid.", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF16", "desc": "FUROS EM ESTRUTURA", "unid": "Unid.", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF17", "desc": "MONTAGEM DE REFORÇO ESTRUTURAS", "unid": "Kg", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF18", "desc": "DESMONTAGEM DE ESTRUTURA E OU REFORÇO EXISTENTE", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF19", "desc": "SUBSTITUIÇÃO DE PARAFUSOS", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF20", "desc": "PINTURA", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF21", "desc": "MOBILIZAÇÃO DE EQUIPE DE MONTAGEM", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF22", "desc": "REAPERTO GERAL EV", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF23", "desc": "REPAROS NA ESTRUTURA/TRATAMENTO OXIDAÇÃO", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF24", "desc": "FORNECIMENTO CHUMBADORES", "unid": "Unid.", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF25", "desc": "VISTORIA PARA DETALHAMENTO/PROJETO DE FABRICAÇÃO", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF26", "desc": "REMANEJAMENTO BTS", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF27", "desc": "REMANEJAMENTO DE ESTEIRAMENTO", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF28", "desc": "REMANEJAMENTO RF", "unid": "Pç", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF29", "desc": "REMANEJAMENTO MW", "unid": "Pç", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF30", "desc": "SUPORTE DE ANTENAS RF", "unid": "Pç", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF31", "desc": "SUPORTE  DE ANTENAS MW", "unid": "Pç", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF32", "desc": "CONCRETO 20 MPA LANÇADO - EXCLUSA TAXA DE BOMBEAMENTO", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF33", "desc": "CONCRETO 25 MPA LANÇADO - EXCLUSA TAXA DE BOMBEAMENTO", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF34", "desc": "CONCRETO 20 MPA RODADO EM OBRA - COM ACOMPANHAMENTO TECNICO", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF35", "desc": "CONCRETO 25 MPA RODADO EM OBRA - COM ACOMPANHAMENTO TECNICO", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF36", "desc": "TAXA DE BOMBEAMENTO POR REGIAO", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF37", "desc": "FORMAS", "unid": "m²", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF38", "desc": "ESCAVAÇÃO", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF39", "desc": "BOTA FORA", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF40", "desc": "REATERRO", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF41", "desc": "FURAÇÃO E APLICAÇÃO DE RESINA EPOXI EM BASES DE CONCRETO", "unid": "Unid.", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF42", "desc": "EXECUÇÃO DE FUNDAÇÃO RADIER (MÃO DE OBRA)", "unid": "m³", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF43", "desc": "EXECUÇÃO DE ESTACA RAIZ EM SOLO", "unid": "m", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF44", "desc": "EXECUÇÃO DE ESTACA RAIZ EM ROCHA", "unid": "m", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF45", "desc": "COMPRESSOR ESTACA RAIZ (PARA EXECUÇÃO DE ESTACAS EM ROCHA)", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF46", "desc": "MOBILIZAÇÃO PARA EQUIPAMENTOS DE ESTACA RAIZ", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF47", "desc": "AGUA PARA EXECUÇÃO DE ESTACAS ( SOMENTE SE NÃO INCLUSO NO ITEM MACRO PELO FORNECEDOR)", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF48", "desc": "MOBILIZAÇÃO DE EQUIPE DE FUNDAÇÃO", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF49", "desc": "FRETE DE MATERIAIS ATÉ A OBRA", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF50", "desc": "LEVANTAMENTO PLANIALTIMÉTRICO", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF51", "desc": "SONDAGEM ATÉ 2 FUROS", "unid": "Vb", "vlUnit": 0.0 }, { "atividade": "Reforço", "item": "REF52", "desc": "FORNECIMENTO E INSTALAÇÃO DE PARAFUSOS 3/4\"", "unid": "Pç", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF53", "desc": "EXECUÇÃO DE FUROS EM BLOCO DE CONCRETO PARA FIXAÇÃO DOS CHUMBADORES", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF54", "desc": "MANUTENÇÃO CORRETIVA", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF55", "desc": "FORNECIMENTO E INSTALAÇÃO DE PARA RAIOS CONFORME PROJETO", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF56", "desc": "FORNECIMENTO E INSTALAÇÃO DE PLATAFORMA", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF57", "desc": "FORNECIMENTO DE BALIZAMENTO SOLAR", "unid": "Unid.", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF58", "desc": "JANELA DE MANUTENÇÃO 2 OPERADORA  ( REMANEJAMENTO DE CABOS E  ANTENAS)", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF59", "desc": "REMANEJAMENTO DE ANTENA MW EM JANELA DE MANUTENÇÃO COM ALINHAMENTO", "unid": "Unid.", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF60", "desc": "TRATAMENTO DE PEÇAS OXIDADAS CONFORME INFORMADO EM PROJETO", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF61", "desc": "FORNECIMENTO E INSTALAÇÃO DE SUPORTES DUPLO PADRÃO TIM", "unid": "Unid.", "vlUnit": 0 }, { "atividade": "Reforço", "item": "REF62", "desc": "ALINHAR ESTRUTURA VERTICAL", "unid": "Vb", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT01", "desc": "Demolição de telhado existente", "unid": "m²", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT02", "desc": "Recomposição de telhado", "unid": "m²", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT03", "desc": "Adicional Metálico / Reforço Metálico para Rooftop (PROJETO NÃO INCLUSO)", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT04", "desc": "Conector FCI Barra - Para esteira", "unid": "un", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT05", "desc": "Conector FCI Torre", "unid": "un", "vlUnit": 0.0 }, { "atividade": "Roof Top", "item": "RFT06", "desc": "Luminária", "unid": "un", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT07", "desc": "Luminária com poste", "unid": "un", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT08", "desc": "Acessórios metálicos (mastro, costela de vaca, esteira horizontal, suportes de antena adicionais, escada marinheiro e guarda-corpo)", "unid": "Kg", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT09", "desc": "Bloco de concreto", "unid": "un", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT10", "desc": "Seal Tube 1''", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT11", "desc": "Seal Tube 2''", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT12", "desc": "Tubulação 2\" Galvanizada à fogo", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT13", "desc": "Tubulação 3\" Galvanizada à fogo", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT14", "desc": "Tubulação 2\" PVC", "unid": "m", "vlUnit": 0.0 }, { "atividade": "Roof Top", "item": "RFT15", "desc": "Balizamento noturno LED - Com fotocélula", "unid": "un", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT16", "desc": "Cabo Multiplex Alum - 4 vias 35mm", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT17", "desc": "Cabo flexível #10mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT18", "desc": "Cabo flexível #25mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT19", "desc": "Cabo flexível #35mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT20", "desc": "Cabo flexível #50mm² isol. 750V - qualquer cor", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT21", "desc": "Cabo flexível #10mm² isol.  0,6/1,0Kv", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT22", "desc": "Cabo flexível #16mm² isol.  0,6/1,0Kv", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT23", "desc": "Caixa de alumínio", "unid": "un", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT24", "desc": "Impermeabilização (área total da laje / cobertura)", "unid": "m²", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT25", "desc": "Malha de aterramento Roof Top", "unid": "m", "vlUnit": 0 }, { "atividade": "Roof Top", "item": "RFT26", "desc": "Segunda Mobilização (acima de 500Km da sede da companhia)", "unid": "un", "vlUnit": 0 }], "resumoCats": ["Serviços de Engenharia", "Fundação", "Fechamento", "Área Construída", "Energia", "Extensão de Rede", "Acesso", "Itens complementares", "Transporte", "Montagem", "Acessórios EV", "Roof Top"] };
const XLSX_TEMPLATE_PV_B64 = "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";


// ── Login Screen
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  // Usuários permitidos (simples, client-side)
  const USERS = [
    { email: "victor.silva@lsoffice.com.br", senha: "LS2026", nome: "Administrador" },
    { email: "rs@lsoffice.com.br", senha: "LS2026", nome: "Rodolfo" },
    { email: "kf@lsoffice.com.br", senha: "LS2026", nome: "Kayky" },
  ];

  const handleLogin = () => {
    if (!email || !senha) { setErro("Preencha e-mail e senha."); return; }
    setLoading(true);
    setTimeout(() => {
      const user = USERS.find(u => u.email === email.toLowerCase().trim() && u.senha === senha);
      if (user) { onLogin(user); }
      else { setErro("E-mail ou senha incorretos."); setLoading(false); }
    }, 700);
  };

  const T = {
    bg0: "#0B0F14", bg1: "#0F141C", bg2: "#121821", bg3: "#18202C", bg4: "#1F2937",
    brBase: "rgba(255,255,255,0.08)", blue: "#3B82F6", txPri: "#F0F4FA", txSec: "#B4C5D8", txMut: "#7C94B0",
    red: "#EF4444", green: "#22C55E",
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter','DM Sans',system-ui,sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, #3b82f610 0%, transparent 70%)",
        pointerEvents: "none"
      }} />

      {/* Logo */}
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div style={{
          width: 80, height: 80, borderRadius: 18, overflow: "hidden",
          margin: "0 auto 16px",
          border: `1px solid ${T.brBase}`,
          boxShadow: "0 0 40px #3b82f620",
        }}>
          <img src={LOGO_B64} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="LSI" />
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", color: T.txPri }}>
          <span style={{ color: T.blue }}>LSI</span>
          <span style={{ fontWeight: 300, color: T.txSec }}> Engenharia</span>
        </div>
        <div style={{ fontSize: 13, color: T.txMut, marginTop: 4, letterSpacing: "0.04em" }}>
          SISTEMA DE GESTÃO ERP
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: T.bg2, borderRadius: 18,
        border: `1px solid ${T.brBase}`,
        padding: "32px 36px", width: 400, maxWidth: "92vw",
        boxShadow: "0 24px 80px #00000060",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.txPri, marginBottom: 6 }}>Bem-vindo</div>
        <div style={{ fontSize: 12, color: T.txMut, marginBottom: 24 }}>Acesse o portal de gestão de obras</div>

        {/* E-mail */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: T.txMut, letterSpacing: "0.08em", marginBottom: 6 }}>
            E-MAIL
          </label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErro(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="nome@lsiengenharia.com.br"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "11px 14px", borderRadius: 10,
              border: `1px solid ${erro ? T.red : email ? T.blue + "60" : T.brBase}`,
              background: T.bg3, color: T.txPri, fontSize: 13, outline: "none",
              transition: "border-color 0.15s",
            }} />
        </div>

        {/* Senha */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: T.txMut, letterSpacing: "0.08em", marginBottom: 6 }}>
            SENHA
          </label>
          <input
            type="password"
            value={senha}
            onChange={e => { setSenha(e.target.value); setErro(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="••••••••"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "11px 14px", borderRadius: 10,
              border: `1px solid ${erro ? T.red : senha ? T.blue + "60" : T.brBase}`,
              background: T.bg3, color: T.txPri, fontSize: 13, outline: "none",
              transition: "border-color 0.15s",
            }} />
        </div>

        {/* Erro */}
        {erro && (
          <div style={{
            background: T.red + "15", border: `1px solid ${T.red}40`,
            borderRadius: 8, padding: "9px 14px", marginBottom: 16,
            fontSize: 12, color: T.red, display: "flex", alignItems: "center", gap: 8,
          }}>
            ⚠️ {erro}
          </div>
        )}

        {/* Botão */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%", padding: "13px", borderRadius: 10, border: "none",
            background: loading ? T.bg3 : "linear-gradient(135deg,#1d4ed8,#3b82f6)",
            color: loading ? T.txMut : "#fff",
            fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            transition: "all 0.15s",
            boxShadow: loading ? "none" : "0 4px 20px #3b82f640",
          }}>
          {loading ? (
            <>
              <div style={{ width: 16, height: 16, border: "2px solid #ffffff40", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              Entrando...
            </>
          ) : (
            <>→ ENTRAR</>
          )}
        </button>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: T.txMut }}>
          Problemas de acesso? Fale com o administrador.
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: "absolute", bottom: 20, fontSize: 11, color: T.txMut, letterSpacing: "0.04em" }}>
        LSI ENGENHARIA © {new Date().getFullYear()}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

const LOGO_B64 = "data:image/png;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//Z";

const DB = [{ "cod": "MS001", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H2m | AeV2m² | V45", "unid": "VB", "vl_medio": 3820.06, "ls_office": 0 }, { "cod": "MS002", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H3m | AeV2m² | V45", "unid": "VB", "vl_medio": 6958.3, "ls_office": 0 }, { "cod": "MS003", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H3m | AeV3m² | V45", "unid": "VB", "vl_medio": 7277.47, "ls_office": 0 }, { "cod": "MS004", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H4m | AeV2m² | V45", "unid": "VB", "vl_medio": 8814.38, "ls_office": 0 }, { "cod": "MS005", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H4m | AeV3m² | V45", "unid": "VB", "vl_medio": 9886.65, "ls_office": 0 }, { "cod": "MS006", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H6m | AeV2m² | V45", "unid": "VB", "vl_medio": 12802.44, "ls_office": 0 }, { "cod": "MS007", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H6m | AeV3m² | V45", "unid": "VB", "vl_medio": 14131.97, "ls_office": 0 }, { "cod": "MS008", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H8m | AeV3m² | V45", "unid": "VB", "vl_medio": 22685.59, "ls_office": 0 }, { "cod": "MS009", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H8m | AeV4m² | V45", "unid": "VB", "vl_medio": 23319.46, "ls_office": 0 }, { "cod": "PS001", "resumo": "POSTE", "solucao": "Suporte RF em plataforma EV > 30m", "config": "H9m | AeV3m² | V30", "unid": "VB", "vl_medio": 3375.0, "ls_office": 0 }, { "cod": "PS002", "resumo": "POSTE", "solucao": "Suporte RF em plataforma EV > 30m", "config": "H9m | AeV3m² | V35", "unid": "VB", "vl_medio": 3543.75, "ls_office": 0 }, { "cod": "PS003", "resumo": "POSTE", "solucao": "Suporte TX em plataforma EV > 30m", "config": "H9m | AeV3m² | V40", "unid": "VB", "vl_medio": 3720.94, "ls_office": 0 }, { "cod": "PS004", "resumo": "POSTE", "solucao": "SPDA", "config": "H9m | AeV3m² | V45", "unid": "VB", "vl_medio": 3906.98, "ls_office": 0 }, { "cod": "PS005", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H9m | AeV4m² | V30", "unid": "VB", "vl_medio": 3881.25, "ls_office": 0 }, { "cod": "PS006", "resumo": "POSTE", "solucao": "Escada EV > 30m", "config": "H9m | AeV4m² | V35", "unid": "VB", "vl_medio": 4075.31, "ls_office": 0 }, { "cod": "PS007", "resumo": "POSTE", "solucao": "Trava quedas", "config": "H9m | AeV4m² | V40", "unid": "VB", "vl_medio": 4279.08, "ls_office": 0 }, { "cod": "PS008", "resumo": "POSTE", "solucao": "Trava quedas", "config": "H9m | AeV4m² | V45", "unid": "VB", "vl_medio": 4493.03, "ls_office": 0 }, { "cod": "PS009", "resumo": "POSTE", "solucao": "Esteriamento Horizontal EV > 30m", "config": "H9m | AeV5m² | V30", "unid": "VB", "vl_medio": 4463.44, "ls_office": 0 }, { "cod": "PS010", "resumo": "POSTE", "solucao": "Esteriamento Horizontal EV > 30m", "config": "H9m | AeV5m² | V35", "unid": "VB", "vl_medio": 4686.61, "ls_office": 0 }, { "cod": "PS011", "resumo": "POSTE", "solucao": "Esteriamento Horizontal EV > 30m", "config": "H9m | AeV5m² | V40", "unid": "VB", "vl_medio": 4920.94, "ls_office": 0 }, { "cod": "PS012", "resumo": "POSTE", "solucao": "Balizamento Baixa Intensidade EV até 45m", "config": "H9m | AeV5m² | V45", "unid": "VB", "vl_medio": 5166.99, "ls_office": 0 }, { "cod": "PS013", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V30", "unid": "VB", "vl_medio": 12075.67, "ls_office": 0 }, { "cod": "PS014", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V35", "unid": "VB", "vl_medio": 12101.49, "ls_office": 0 }, { "cod": "PS015", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V40", "unid": "VB", "vl_medio": 12723.31, "ls_office": 0 }, { "cod": "PS016", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV3m² | V45", "unid": "VB", "vl_medio": 12957.27, "ls_office": 0 }, { "cod": "PS017", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V30", "unid": "VB", "vl_medio": 12503.95, "ls_office": 0 }, { "cod": "PS018", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V35", "unid": "VB", "vl_medio": 12601.29, "ls_office": 0 }, { "cod": "PS019", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V40", "unid": "VB", "vl_medio": 13144.01, "ls_office": 0 }, { "cod": "PS020", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV4m² | V45", "unid": "VB", "vl_medio": 13390.39, "ls_office": 0 }, { "cod": "PS021", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V30", "unid": "VB", "vl_medio": 13314.78, "ls_office": 0 }, { "cod": "PS022", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V35", "unid": "VB", "vl_medio": 13403.46, "ls_office": 0 }, { "cod": "PS023", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V40", "unid": "VB", "vl_medio": 13947.27, "ls_office": 0 }, { "cod": "PS024", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | AeV5m² | V45", "unid": "VB", "vl_medio": 14196.06, "ls_office": 0 }, { "cod": "PS025", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H9m | V", "unid": "VB", "vl_medio": 1550.57, "ls_office": 0 }, { "cod": "PS026", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H9m", "unid": "VB", "vl_medio": 14259.29, "ls_office": 0 }, { "cod": "MS010", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H10m | AeV3m² | V45", "unid": "VB", "vl_medio": 34744.96, "ls_office": 0 }, { "cod": "MS011", "resumo": "MASTRO", "solucao": "Mastros com altura superior 2m deverão ser providos de pedaleira e cabo trava-quedas.", "config": "H10m | AeV4m² | V45", "unid": "VB", "vl_medio": 37922.49, "ls_office": 0 }, { "cod": "PS027", "resumo": "POSTE", "solucao": "Balizamento Média Intensidade EV de 46 até 150m", "config": "H12m | AeV3m² | V30", "unid": "VB", "vl_medio": 4950.0, "ls_office": 0 }, { "cod": "PS028", "resumo": "POSTE", "solucao": "FCI", "config": "H12m | AeV3m² | V35", "unid": "VB", "vl_medio": 5197.5, "ls_office": 0 }, { "cod": "PS029", "resumo": "POSTE", "solucao": "Projeto", "config": "H12m | AeV3m² | V40", "unid": "VB", "vl_medio": 5457.38, "ls_office": 0 }, { "cod": "PS030", "resumo": "POSTE", "solucao": "Projeto", "config": "H12m | AeV3m² | V45", "unid": "VB", "vl_medio": 5730.24, "ls_office": 0 }, { "cod": "PS031", "resumo": "POSTE", "solucao": "Projeto", "config": "H12m | AeV4m² | V30", "unid": "VB", "vl_medio": 5692.5, "ls_office": 0 }, { "cod": "PS032", "resumo": "POSTE", "solucao": "Mastro 1,8m e fundação em solo para instalação de antena TX (parabólica 1,8m), com eletroduto flexível (envelopado em solo), eletroduto FGF e sistema de fixação para encaminhamento de cabos.", "config": "H12m | AeV4m² | V35", "unid": "VB", "vl_medio": 5977.13, "ls_office": 0 }, { "cod": "PS033", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV4m² | V40", "unid": "VB", "vl_medio": 6275.98, "ls_office": 0 }, { "cod": "PS034", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV4m² | V45", "unid": "VB", "vl_medio": 6589.78, "ls_office": 0 }, { "cod": "PS035", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V30", "unid": "VB", "vl_medio": 6546.38, "ls_office": 0 }, { "cod": "PS036", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V35", "unid": "VB", "vl_medio": 6873.69, "ls_office": 0 }, { "cod": "PS037", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V40", "unid": "VB", "vl_medio": 7217.38, "ls_office": 0 }, { "cod": "PS038", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H12m | AeV5m² | V45", "unid": "VB", "vl_medio": 7578.25, "ls_office": 0 }, { "cod": "PS039", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V30", "unid": "VB", "vl_medio": 17515.63, "ls_office": 0 }, { "cod": "PS040", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V35", "unid": "VB", "vl_medio": 17840.42, "ls_office": 0 }, { "cod": "PS041", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V40", "unid": "VB", "vl_medio": 18794.91, "ls_office": 0 }, { "cod": "PS042", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV3m² | V45", "unid": "VB", "vl_medio": 19842.01, "ls_office": 0 }, { "cod": "PS043", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V30", "unid": "VB", "vl_medio": 17707.55, "ls_office": 0 }, { "cod": "PS044", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V35", "unid": "VB", "vl_medio": 18026.69, "ls_office": 0 }, { "cod": "PS045", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V40", "unid": "VB", "vl_medio": 18984.09, "ls_office": 0 }, { "cod": "PS046", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV4m² | V45", "unid": "VB", "vl_medio": 20045.7, "ls_office": 0 }, { "cod": "PS047", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V30", "unid": "VB", "vl_medio": 18743.61, "ls_office": 0 }, { "cod": "PS048", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V35", "unid": "VB", "vl_medio": 19069.42, "ls_office": 0 }, { "cod": "PS049", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V40", "unid": "VB", "vl_medio": 20031.25, "ls_office": 0 }, { "cod": "PS050", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m | AeV5m² | V45", "unid": "VB", "vl_medio": 21059.0, "ls_office": 0 }, { "cod": "PS051", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H12m", "unid": "VB", "vl_medio": 1795.89, "ls_office": 0 }, { "cod": "PS052", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H12m", "unid": "VB", "vl_medio": 16290.56, "ls_office": 0 }, { "cod": "PS053", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V30", "unid": "VB", "vl_medio": 21750.0, "ls_office": 0 }, { "cod": "PS054", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V35", "unid": "VB", "vl_medio": 22837.5, "ls_office": 0 }, { "cod": "PS055", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V40", "unid": "VB", "vl_medio": 23979.38, "ls_office": 0 }, { "cod": "PS056", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV3m² | V45", "unid": "VB", "vl_medio": 25178.34, "ls_office": 0 }, { "cod": "PS057", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V30", "unid": "VB", "vl_medio": 25012.5, "ls_office": 0 }, { "cod": "PS058", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V35", "unid": "VB", "vl_medio": 26263.13, "ls_office": 0 }, { "cod": "PS059", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V40", "unid": "VB", "vl_medio": 27576.28, "ls_office": 0 }, { "cod": "PS060", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV4m² | V45", "unid": "VB", "vl_medio": 28955.1, "ls_office": 0 }, { "cod": "PS061", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V30", "unid": "VB", "vl_medio": 28764.38, "ls_office": 0 }, { "cod": "PS062", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V35", "unid": "VB", "vl_medio": 30202.59, "ls_office": 0 }, { "cod": "PS063", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V40", "unid": "VB", "vl_medio": 31712.72, "ls_office": 0 }, { "cod": "PS064", "resumo": "POSTE", "solucao": "Concreto ou Fibra Simplificado Deflexão máxima 1◦0\"00\"", "config": "H18m | AeV5m² | V45", "unid": "VB", "vl_medio": 33298.36, "ls_office": 0 }, { "cod": "PS065", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V30", "unid": "VB", "vl_medio": 23674.47, "ls_office": 0 }, { "cod": "PS066", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V35", "unid": "VB", "vl_medio": 23850.64, "ls_office": 0 }, { "cod": "PS067", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V40", "unid": "VB", "vl_medio": 27691.59, "ls_office": 0 }, { "cod": "PS068", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV3m² | V45", "unid": "VB", "vl_medio": 28791.38, "ls_office": 0 }, { "cod": "PS069", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V30", "unid": "VB", "vl_medio": 24064.2, "ls_office": 0 }, { "cod": "PS070", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V35", "unid": "VB", "vl_medio": 24206.23, "ls_office": 0 }, { "cod": "PS071", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V40", "unid": "VB", "vl_medio": 28090.73, "ls_office": 0 }, { "cod": "PS072", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV4m² | V45", "unid": "VB", "vl_medio": 29205.03, "ls_office": 0 }, { "cod": "PS073", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V30", "unid": "VB", "vl_medio": 24480.54, "ls_office": 0 }, { "cod": "PS074", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V35", "unid": "VB", "vl_medio": 24624.79, "ls_office": 0 }, { "cod": "PS075", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V40", "unid": "VB", "vl_medio": 28511.12, "ls_office": 0 }, { "cod": "PS076", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m | AeV5m² | V45", "unid": "VB", "vl_medio": 29635.09, "ls_office": 0 }, { "cod": "PS077", "resumo": "POSTE", "solucao": "Metálico Simplificado Deflexão máxima 1◦0\"00\" Fornecimento de Poste inclui gabaritos, peças, placa de identificação, parafusos e tudo o que for necessário para sua correta instalação, sempre galvanizado a quente (≥ 84micron, NBR 6323).", "config": "H18m", "unid": "VB", "vl_medio": 2251.2, "ls_office": 0 }, { "cod": "PS078", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H18m", "unid": "VB", "vl_medio": 18801.79, "ls_office": 0 }, { "cod": "PS079", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V30", "unid": "VB", "vl_medio": 71630.6, "ls_office": 0 }, { "cod": "PS080", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V35", "unid": "VB", "vl_medio": 73943.63, "ls_office": 0 }, { "cod": "PS081", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V40", "unid": "VB", "vl_medio": 92300.56, "ls_office": 0 }, { "cod": "PS082", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV3m² | V45", "unid": "VB", "vl_medio": 98731.18, "ls_office": 0 }, { "cod": "PS083", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V30", "unid": "VB", "vl_medio": 74087.39, "ls_office": 0 }, { "cod": "PS084", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V35", "unid": "VB", "vl_medio": 76975.62, "ls_office": 0 }, { "cod": "PS085", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V40", "unid": "VB", "vl_medio": 97315.29, "ls_office": 0 }, { "cod": "PS086", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV6m² | V45", "unid": "VB", "vl_medio": 105401.6, "ls_office": 0 }, { "cod": "PS087", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V30", "unid": "VB", "vl_medio": 76740.54, "ls_office": 0 }, { "cod": "PS088", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V35", "unid": "VB", "vl_medio": 80948.11, "ls_office": 0 }, { "cod": "PS089", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V40", "unid": "VB", "vl_medio": 107897.13, "ls_office": 0 }, { "cod": "PS090", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV9m² | V45", "unid": "VB", "vl_medio": 114675.51, "ls_office": 0 }, { "cod": "PS091", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V30", "unid": "VB", "vl_medio": 81254.22, "ls_office": 0 }, { "cod": "PS092", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V35", "unid": "VB", "vl_medio": 87551.56, "ls_office": 0 }, { "cod": "PS093", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V40", "unid": "VB", "vl_medio": 113919.07, "ls_office": 0 }, { "cod": "PS094", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m | AeV12m² | V45", "unid": "VB", "vl_medio": 123964.29, "ls_office": 0 }, { "cod": "PS095", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H30m", "unid": "PÇ", "vl_medio": 4567.84, "ls_office": 0 }, { "cod": "TR001", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V30", "unid": "VB", "vl_medio": 61412.8, "ls_office": 0 }, { "cod": "TR002", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V35", "unid": "VB", "vl_medio": 65386.6, "ls_office": 0 }, { "cod": "TR003", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V40", "unid": "VB", "vl_medio": 70867.47, "ls_office": 0 }, { "cod": "TR004", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV3m² | V45", "unid": "VB", "vl_medio": 75539.4, "ls_office": 0 }, { "cod": "TR005", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V30", "unid": "VB", "vl_medio": 63883.77, "ls_office": 0 }, { "cod": "TR006", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V35", "unid": "VB", "vl_medio": 68225.04, "ls_office": 0 }, { "cod": "TR007", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V40", "unid": "VB", "vl_medio": 71853.79, "ls_office": 0 }, { "cod": "TR008", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV6m² | V45", "unid": "VB", "vl_medio": 78236.15, "ls_office": 0 }, { "cod": "TR009", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V30", "unid": "VB", "vl_medio": 67598.16, "ls_office": 0 }, { "cod": "TR010", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V35", "unid": "VB", "vl_medio": 72726.1, "ls_office": 0 }, { "cod": "TR011", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V40", "unid": "VB", "vl_medio": 77971.6, "ls_office": 0 }, { "cod": "TR012", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV9m² | V45", "unid": "VB", "vl_medio": 86359.26, "ls_office": 0 }, { "cod": "TR013", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V30", "unid": "VB", "vl_medio": 70505.82, "ls_office": 0 }, { "cod": "TR014", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V35", "unid": "VB", "vl_medio": 75917.38, "ls_office": 0 }, { "cod": "TR015", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V40", "unid": "VB", "vl_medio": 82261.17, "ls_office": 0 }, { "cod": "TR016", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m | AeV12m² | V45", "unid": "VB", "vl_medio": 90823.17, "ls_office": 0 }, { "cod": "TR017", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H30m", "unid": "PÇ", "vl_medio": 5232.44, "ls_office": 0 }, { "cod": "PS096", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H30m", "unid": "VB", "vl_medio": 32843.46, "ls_office": 0 }, { "cod": "MT001", "resumo": "MONTAGEM", "solucao": "Inclui mão de obra, equipamentos p/ içamento, ferramentas e o que for necessário para correta execução da montagem da EV.", "config": "H30m", "unid": "VB", "vl_medio": 20604.3, "ls_office": 0 }, { "cod": "PS097", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V30", "unid": "VB", "vl_medio": 108140.79, "ls_office": 0 }, { "cod": "PS098", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V35", "unid": "VB", "vl_medio": 116056.65, "ls_office": 0 }, { "cod": "PS099", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V40", "unid": "VB", "vl_medio": 135069.64, "ls_office": 0 }, { "cod": "PS100", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV3m² | V45", "unid": "VB", "vl_medio": 135603.93, "ls_office": 0 }, { "cod": "PS101", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V30", "unid": "VB", "vl_medio": 112704.37, "ls_office": 0 }, { "cod": "PS102", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V35", "unid": "VB", "vl_medio": 119964.61, "ls_office": 0 }, { "cod": "PS103", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V40", "unid": "VB", "vl_medio": 139368.77, "ls_office": 0 }, { "cod": "PS104", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV6m² | V45", "unid": "VB", "vl_medio": 154018.71, "ls_office": 0 }, { "cod": "PS105", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V30", "unid": "VB", "vl_medio": 117977.88, "ls_office": 0 }, { "cod": "PS106", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V35", "unid": "VB", "vl_medio": 125471.94, "ls_office": 0 }, { "cod": "PS107", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V40", "unid": "VB", "vl_medio": 152727.2, "ls_office": 0 }, { "cod": "PS108", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV9m² | V45", "unid": "VB", "vl_medio": 167671.9, "ls_office": 0 }, { "cod": "PS109", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V30", "unid": "VB", "vl_medio": 122311.67, "ls_office": 0 }, { "cod": "PS110", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V35", "unid": "VB", "vl_medio": 133707.77, "ls_office": 0 }, { "cod": "PS111", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V40", "unid": "VB", "vl_medio": 165188.05, "ls_office": 0 }, { "cod": "PS112", "resumo": "POSTE", "solucao": "Metálico Autoportante", "config": "H40m | AeV12m² | V45", "unid": "VB", "vl_medio": 187786.13, "ls_office": 0 }, { "cod": "TR018", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V30", "unid": "VB", "vl_medio": 82448.28, "ls_office": 0 }, { "cod": "TR019", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V35", "unid": "VB", "vl_medio": 87585.31, "ls_office": 0 }, { "cod": "TR020", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V40", "unid": "VB", "vl_medio": 97219.94, "ls_office": 0 }, { "cod": "TR021", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV3m² | V45", "unid": "VB", "vl_medio": 104375.23, "ls_office": 0 }, { "cod": "TR022", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V30", "unid": "VB", "vl_medio": 83610.32, "ls_office": 0 }, { "cod": "TR023", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V35", "unid": "VB", "vl_medio": 89530.94, "ls_office": 0 }, { "cod": "TR024", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V40", "unid": "VB", "vl_medio": 100312.87, "ls_office": 0 }, { "cod": "TR025", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV6m² | V45", "unid": "VB", "vl_medio": 109696.05, "ls_office": 0 }, { "cod": "TR026", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V30", "unid": "VB", "vl_medio": 85375.84, "ls_office": 0 }, { "cod": "TR027", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V35", "unid": "VB", "vl_medio": 91243.46, "ls_office": 0 }, { "cod": "TR028", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V40", "unid": "VB", "vl_medio": 105032.8, "ls_office": 0 }, { "cod": "TR029", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV9m² | V45", "unid": "VB", "vl_medio": 107745.06, "ls_office": 0 }, { "cod": "TR030", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V30", "unid": "VB", "vl_medio": 89057.46, "ls_office": 0 }, { "cod": "TR031", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V35", "unid": "VB", "vl_medio": 98838.66, "ls_office": 0 }, { "cod": "TR032", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V40", "unid": "VB", "vl_medio": 108961.58, "ls_office": 0 }, { "cod": "TR033", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m | AeV12m² | V45", "unid": "VB", "vl_medio": 120833.87, "ls_office": 0 }, { "cod": "TR034", "resumo": "TORRE", "solucao": "Metálica Autoportante", "config": "H40m", "unid": "PÇ", "vl_medio": 5140.46, "ls_office": 0 }, { "cod": "PS113", "resumo": "POSTE", "solucao": "Montagem Poste", "config": "H40m", "unid": "VB", "vl_medio": 39985.18, "ls_office": 0 }, { "cod": "MT002", "resumo": "MONTAGEM", "solucao": "Inclui mão de obra, equipamentos p/ içamento, ferramentas e o que for necessário para correta execução da montagem da EV.", "config": "H40m", "unid": "VB", "vl_medio": 24951.54, "ls_office": 0 }, { "cod": "IN001", "resumo": "INFRA", "solucao": "2a. Abordagem FO — Instalação de Poste de Aço ou Concreto p/ 2a. abordagem fibra óptica", "config": "", "unid": "VB", "vl_medio": 3569.6, "ls_office": 0 }, { "cod": "AT001", "resumo": "ATERRAMENTO", "solucao": "Cabo flexível verde 50 mm²", "config": "", "unid": "M", "vl_medio": 86.85, "ls_office": 0 }, { "cod": "IN002", "resumo": "INFRA", "solucao": "Acesso veicular — Em brita graduada  (no. 3) ou escoria de aciaria", "config": "", "unid": "M2", "vl_medio": 77.84, "ls_office": 0 }, { "cod": "MS012", "resumo": "MASTRO", "solucao": "Acessórios", "config": "", "unid": "PÇ", "vl_medio": 260.38, "ls_office": 0 }, { "cod": "AT002", "resumo": "ATERRAMENTO", "solucao": "Cordoalha de cobre, 50mm²", "config": "", "unid": "M", "vl_medio": 100.5, "ls_office": 0 }, { "cod": "FD001", "resumo": "FUNDAÇÃO", "solucao": "Aço CA-60A", "config": "", "unid": "KG", "vl_medio": 31.49, "ls_office": 0 }, { "cod": "IN003", "resumo": "INFRA", "solucao": "Adequação Padrão — Adeqauação do padrão de entrada de energia existente  (até 04 medidores) com fornecimento e instalação de seccionamento padrão da concessionária local (disjuntor), cabos internos ao padrão e demais acessórios", "config": "", "unid": "VB", "vl_medio": 10789.55, "ls_office": 0 }, { "cod": "AT003", "resumo": "ATERRAMENTO", "solucao": "Cordoalha de aço galvanizado, 50mm²", "config": "", "unid": "M", "vl_medio": 64.07, "ls_office": 0 }, { "cod": "IN004", "resumo": "INFRA", "solucao": "Alambrado (tela militar)", "config": "", "unid": "M2", "vl_medio": 400.27, "ls_office": 0 }, { "cod": "MS013", "resumo": "MASTRO", "solucao": "Balizamento Baixa Intensidade EV até 45m", "config": "", "unid": "Kit", "vl_medio": 2610.87, "ls_office": 0 }, { "cod": "MS014", "resumo": "MASTRO", "solucao": "Balizamento Média Intensidade EV de 46 até 150m", "config": "", "unid": "Kit", "vl_medio": 5851.04, "ls_office": 0 }, { "cod": "AT004", "resumo": "ATERRAMENTO", "solucao": "Caixa de inspeção circular 30cm, com tampa em aço galvanizado c/ alça", "config": "", "unid": "PÇ", "vl_medio": 455.53, "ls_office": 0 }, { "cod": "IN005", "resumo": "INFRA", "solucao": "Beliche — Estrutura metálica tipo \"Beliche\" para suporte e fixação de Gabinetes", "config": "", "unid": "KG", "vl_medio": 52.86, "ls_office": 0 }, { "cod": "AT005", "resumo": "ATERRAMENTO", "solucao": "Haste de aterramento 5/8\", revestida em cobre 254μ, L=3,00m", "config": "", "unid": "PÇ", "vl_medio": 309.3, "ls_office": 0 }, { "cod": "IN006", "resumo": "INFRA", "solucao": "Brita — Cobertura com 5 a 7 cm de brita (no. 2), seixo ou similar", "config": "", "unid": "M2", "vl_medio": 52.74, "ls_office": 0 }, { "cod": "AT006", "resumo": "ATERRAMENTO", "solucao": "Cabo de aço com alma de aço de 1/2\"", "config": "", "unid": "M", "vl_medio": 74.53, "ls_office": 0 }, { "cod": "AT007", "resumo": "ATERRAMENTO", "solucao": "Cabo flexível verde 16 mm²", "config": "", "unid": "M", "vl_medio": 33.76, "ls_office": 0 }, { "cod": "AT008", "resumo": "ATERRAMENTO", "solucao": "Cabo flexível verde 25 mm²", "config": "", "unid": "M", "vl_medio": 46.4, "ls_office": 0 }, { "cod": "AT009", "resumo": "ATERRAMENTO", "solucao": "Conector FCI — Conector de compressão FCI tipo Cabo-Cabo", "config": "", "unid": "PÇ", "vl_medio": 101.39, "ls_office": 0 }, { "cod": "EL001", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 2,5mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 8.61, "ls_office": 0 }, { "cod": "EL002", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 4mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 12.96, "ls_office": 0 }, { "cod": "EL003", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 10mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 22.59, "ls_office": 0 }, { "cod": "EL004", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 16mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 31.41, "ls_office": 0 }, { "cod": "EL005", "resumo": "ELÉTRICA", "solucao": "Eletroduto corrugado de PVC (PEAD / kanaflex) flexível 2\" com conexões", "config": "", "unid": "M", "vl_medio": 31.73, "ls_office": 0 }, { "cod": "EL006", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 35mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 74.63, "ls_office": 0 }, { "cod": "EL007", "resumo": "ELÉTRICA", "solucao": "Eletroduto corrugado de PVC (PEAD / kanaflex) flexível 1\" com conexões", "config": "", "unid": "M", "vl_medio": 21.09, "ls_office": 0 }, { "cod": "EL008", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 2,5mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 11.4, "ls_office": 0 }, { "cod": "EL009", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 4mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 14.07, "ls_office": 0 }, { "cod": "EL010", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 10mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 15.8, "ls_office": 0 }, { "cod": "EL011", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio, PVC, 1KV, 16mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 24.22, "ls_office": 0 }, { "cod": "EL012", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 25mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 41.27, "ls_office": 0 }, { "cod": "EL013", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 35mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 48.85, "ls_office": 0 }, { "cod": "EL014", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de alumínio flexível, PVC, 1KV, 50mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 63.54, "ls_office": 0 }, { "cod": "EL015", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x10mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 17.3, "ls_office": 0 }, { "cod": "EL016", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x10mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 26.46, "ls_office": 0 }, { "cod": "EL017", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x 25mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 47.44, "ls_office": 0 }, { "cod": "EL018", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x 25mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 65.17, "ls_office": 0 }, { "cod": "EL019", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x 35mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 55.77, "ls_office": 0 }, { "cod": "EL020", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x 35mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 78.13, "ls_office": 0 }, { "cod": "EL021", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 2x 50 mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 83.9, "ls_office": 0 }, { "cod": "EL022", "resumo": "ELÉTRICA", "solucao": "Cabo multiplexado 3x 50 mm² neutro nu - alumínio", "config": "", "unid": "M", "vl_medio": 110.6, "ls_office": 0 }, { "cod": "EL023", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 2x2,5mm² isolamento 750V (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 18.58, "ls_office": 0 }, { "cod": "EL024", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 3x2,5mm² isolamento 750V (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 24.81, "ls_office": 0 }, { "cod": "AT010", "resumo": "ATERRAMENTO", "solucao": "EGB — Placa EGB (External Ground Bar), em aço com conectores", "config": "", "unid": "PÇ", "vl_medio": 583.23, "ls_office": 0 }, { "cod": "EL025", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 3x6mm² isolamento 1kV (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 46.53, "ls_office": 0 }, { "cod": "EL026", "resumo": "ELÉTRICA", "solucao": "Padrão de entrada BT, Trifásico (FFFN) 380/220V até 75KVA, Poste (padrão concecionária), eletrodutos (bengala), kit Armação Presbow + Roldana e demais acessórios", "config": "", "unid": "VB", "vl_medio": 6960.74, "ls_office": 0 }, { "cod": "EL027", "resumo": "ELÉTRICA", "solucao": "Caixa de passagem 300x300x600mm em bloco de concreto (inclui tampa)", "config": "", "unid": "PÇ", "vl_medio": 847.56, "ls_office": 0 }, { "cod": "IN007", "resumo": "INFRA", "solucao": "Caixa de passagem 300x300x600mm pré-moldada (inclui tampa)", "config": "", "unid": "PÇ", "vl_medio": 836.81, "ls_office": 0 }, { "cod": "IN008", "resumo": "INFRA", "solucao": "Caixa de passagem 600x600x600mm em bloco de concreto (inclui tampa)", "config": "", "unid": "PÇ", "vl_medio": 1128.31, "ls_office": 0 }, { "cod": "EL028", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 25mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 50.63, "ls_office": 0 }, { "cod": "IN009", "resumo": "INFRA", "solucao": "Caixa de passagem 300x300x120mm em aluminio fundido (inclui tampa)", "config": "", "unid": "PÇ", "vl_medio": 710.02, "ls_office": 0 }, { "cod": "IN010", "resumo": "INFRA", "solucao": "Caixa de passagem Tipo R2 1200x600x800mm Bloco Concreto (inclui tampa)", "config": "", "unid": "PÇ", "vl_medio": 3447.11, "ls_office": 0 }, { "cod": "FD002", "resumo": "FUNDAÇÃO", "solucao": "Camisa concreto para construção do tubulão revestido", "config": "", "unid": "M", "vl_medio": 905.96, "ls_office": 0 }, { "cod": "FD003", "resumo": "FUNDAÇÃO", "solucao": "Camisa metalica (sem reaproveitamento) para construção do tubulão revestido", "config": "", "unid": "KG", "vl_medio": 47.9, "ls_office": 0 }, { "cod": "EL029", "resumo": "ELÉTRICA", "solucao": "Cabo flexível — Cabo de cobre flexível, PVC, 1KV, 50mm² (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 112.17, "ls_office": 0 }, { "cod": "EL030", "resumo": "ELÉTRICA", "solucao": "QTME Trifásico sem PPTA — Quadro QTME Trifásico, sem PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "vl_medio": 9953.73, "ls_office": 0 }, { "cod": "FD004", "resumo": "FUNDAÇÃO", "solucao": "Concreto convencional - fck 20MPa", "config": "", "unid": "M3", "vl_medio": 2798.21, "ls_office": 0 }, { "cod": "FD005", "resumo": "FUNDAÇÃO", "solucao": "Aço CA-50A", "config": "", "unid": "KG", "vl_medio": 23.52, "ls_office": 0 }, { "cod": "FD006", "resumo": "FUNDAÇÃO", "solucao": "Concreto Bombeável — Fornecimento e lançamento de concreto bombeável - fck 20MPa", "config": "", "unid": "M3", "vl_medio": 1805.39, "ls_office": 0 }, { "cod": "FD007", "resumo": "FUNDAÇÃO", "solucao": "Concreto Bombeável — Fornecimento e lançamento de concreto bombeável - fck 25MPa", "config": "", "unid": "M3", "vl_medio": 2064.06, "ls_office": 0 }, { "cod": "AT011", "resumo": "ATERRAMENTO", "solucao": "Conector FCI — Conector de compressão FCI tipo Cabo-Haste", "config": "", "unid": "PÇ", "vl_medio": 120.26, "ls_office": 0 }, { "cod": "EL031", "resumo": "ELÉTRICA", "solucao": "Cabo PP — Cabo de cobre flexível tipo PP 3x4mm² isolamento 750V (inclusive terminais)", "config": "", "unid": "M", "vl_medio": 34.52, "ls_office": 0 }, { "cod": "AT012", "resumo": "ATERRAMENTO", "solucao": "Cordoalha de cobre, 25mm²", "config": "", "unid": "M", "vl_medio": 55.81, "ls_office": 0 }, { "cod": "EL032", "resumo": "ELÉTRICA", "solucao": "Eletroduto PVC flexível  1/2 - 1\" (tipo seal tube)", "config": "", "unid": "M", "vl_medio": 62.15, "ls_office": 0 }, { "cod": "EL033", "resumo": "ELÉTRICA", "solucao": "Eletroduto PVC flexível 1 1/2 - 2\" (tipo seal tube)", "config": "", "unid": "M", "vl_medio": 99.19, "ls_office": 0 }, { "cod": "IN011", "resumo": "INFRA", "solucao": "Demolição de alvenaria   ( salas, paredes, pisos, tetos, muros, abrigos, etc)", "config": "", "unid": "M2", "vl_medio": 433.98, "ls_office": 0 }, { "cod": "FD008", "resumo": "FUNDAÇÃO", "solucao": "Demolição de concreto armado até 1,5m de profundidade", "config": "", "unid": "M3", "vl_medio": 1800.62, "ls_office": 0 }, { "cod": "FD009", "resumo": "FUNDAÇÃO", "solucao": "Demolição de concreto armado acima de 1,5m de profundidade", "config": "", "unid": "M3", "vl_medio": 1859.52, "ls_office": 0 }, { "cod": "AD001", "resumo": "ADMINISTRATIVO", "solucao": "Deslocamento Pontual: Deslocamento de recurso para execução de atividade pontual não originada por ação e/ou omissão da contratada.", "config": "", "unid": "VB", "vl_medio": 4041.26, "ls_office": 0 }, { "cod": "EL034", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN monopolar 10-50A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "vl_medio": 108.29, "ls_office": 0 }, { "cod": "EL035", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN monopolar 63-80A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "vl_medio": 225.6, "ls_office": 0 }, { "cod": "EL036", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN bipolar 10-50A  (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "vl_medio": 194.86, "ls_office": 0 }, { "cod": "EL037", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN bipolar 63-100A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "vl_medio": 402.91, "ls_office": 0 }, { "cod": "EL038", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN tripolar 10-50A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "vl_medio": 264.42, "ls_office": 0 }, { "cod": "EL039", "resumo": "ELÉTRICA", "solucao": "Disjuntor DIN tripolar 63-100A (Abb, Siemens, GE), curva \"C\"", "config": "", "unid": "PÇ", "vl_medio": 596.56, "ls_office": 0 }, { "cod": "IN012", "resumo": "INFRA", "solucao": "Dry Wall — Fechamento em Dry wall", "config": "", "unid": "M2", "vl_medio": 322.79, "ls_office": 0 }, { "cod": "EL040", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo  (F.G.F) 1 1/2 - 2\"", "config": "VEletroduto rigidos pesado galvanizado a fogo 1 1/2 - 2\"", "unid": "M", "vl_medio": 172.73, "ls_office": 0 }, { "cod": "FD010", "resumo": "FUNDAÇÃO", "solucao": "Bota Fora (remoção de terra, vegetação, entulho em geral, etc). Considerar taxa de empolamento - E 25%", "config": "", "unid": "M3", "vl_medio": 121.54, "ls_office": 0 }, { "cod": "EL041", "resumo": "ELÉTRICA", "solucao": "Padrão de entrada BT, Bifásico (FFN) 220/127V até 75KVA, Poste (padrão concecionária), eletrodutos (bengala), kit Armação Presbow + Roldana e demais acessórios", "config": "", "unid": "VB", "vl_medio": 5523.4, "ls_office": 0 }, { "cod": "EL042", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo (F.G.F) 1/2 - 1\"", "config": "VEletroduto rigidos pesado galvanizado a fogo 1/2 - 1\"", "unid": "M", "vl_medio": 128.88, "ls_office": 0 }, { "cod": "EL043", "resumo": "ELÉTRICA", "solucao": "Poste de iluminação em aço galvanizado, 3 metros de altura, luminária tipo tartaruga e lampanda de 200 Watts ou LED.", "config": "", "unid": "PÇ", "vl_medio": 3267.67, "ls_office": 0 }, { "cod": "EL044", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo  (F.G.F) 2 1/2 - 3\"", "config": "VEletroduto rigidos pesado galvanizado a fogo  2 1/2 - 3\"", "unid": "M", "vl_medio": 302.49, "ls_office": 0 }, { "cod": "EL045", "resumo": "ELÉTRICA", "solucao": "Eletroduto rigidos pesado galvanizado a fogo (F.G.F)  4\"", "config": "VEletroduto rigidos pesado galvanizado a fogo  4\"", "unid": "M", "vl_medio": 395.64, "ls_office": 0 }, { "cod": "EL046", "resumo": "ELÉTRICA", "solucao": "QTME Bifásico com PPTA — Quadro QTME Bifásico,com PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "vl_medio": 11454.52, "ls_office": 0 }, { "cod": "FD011", "resumo": "FUNDAÇÃO", "solucao": "Concreto magro / lastro", "config": "", "unid": "M3", "vl_medio": 630.44, "ls_office": 0 }, { "cod": "EL047", "resumo": "ELÉTRICA", "solucao": "Eletroduto corrugado de PVC (PEAD / kanaflex) flexível 3-4\" com conexões", "config": "", "unid": "M", "vl_medio": 41.86, "ls_office": 0 }, { "cod": "EL048", "resumo": "ELÉTRICA", "solucao": "Eletroduto rígido PVC de  1/2 - 1\" preto ou cinza com conexões", "config": "", "unid": "M", "vl_medio": 40.31, "ls_office": 0 }, { "cod": "EL049", "resumo": "ELÉTRICA", "solucao": "Eletroduto rígido PVC de 1 1/2 - 2\" preto ou cinza com conexões", "config": "", "unid": "M", "vl_medio": 66.96, "ls_office": 0 }, { "cod": "IN013", "resumo": "INFRA", "solucao": "Enclausuramento (tampa) de esteiramento em chapa galvanizada L=400 mm", "config": "", "unid": "M", "vl_medio": 591.02, "ls_office": 0 }, { "cod": "IN014", "resumo": "INFRA", "solucao": "Escada \"Marinheiro\" — Escada de Acesso, tipo \"Marinheiro\" com guarda corpo galvanizado a fogo e acessórios de segurança", "config": "", "unid": "KG", "vl_medio": 52.04, "ls_office": 0 }, { "cod": "MS015", "resumo": "MASTRO", "solucao": "Escada EV > 30m", "config": "", "unid": "M", "vl_medio": 338.32, "ls_office": 0 }, { "cod": "FD012", "resumo": "FUNDAÇÃO", "solucao": "Escavação em rocha — Serviços de escavação, reaterro, nivelamento e compactação", "config": "", "unid": "M3", "vl_medio": 3206.23, "ls_office": 0 }, { "cod": "FD013", "resumo": "FUNDAÇÃO", "solucao": "Escavação profunda em solo — Serviços de escavação, reaterro, nivelamento e compactação", "config": "", "unid": "M3", "vl_medio": 683.09, "ls_office": 0 }, { "cod": "FD014", "resumo": "FUNDAÇÃO", "solucao": "Concreto convencional - fck 25MPa", "config": "", "unid": "M3", "vl_medio": 1330.64, "ls_office": 0 }, { "cod": "FD015", "resumo": "FUNDAÇÃO", "solucao": "Escavação rasa em solo — Serviços de escavação, reaterro, nivelamento e compactação", "config": "", "unid": "M3", "vl_medio": 177.66, "ls_office": 0 }, { "cod": "MS016", "resumo": "MASTRO", "solucao": "Esteriamento Horizontal EV > 30m", "config": "", "unid": "M", "vl_medio": 384.24, "ls_office": 0 }, { "cod": "MS017", "resumo": "MASTRO", "solucao": "Esteriamento Horizontal EV > 30m", "config": "", "unid": "PÇ", "vl_medio": 279.05, "ls_office": 0 }, { "cod": "TR035", "resumo": "TORRE", "solucao": "Esteriamento Vertical", "config": "", "unid": "VB", "vl_medio": 7269.04, "ls_office": 0 }, { "cod": "TR036", "resumo": "TORRE", "solucao": "Esteriamento Vertical EV > 30m", "config": "", "unid": "M", "vl_medio": 312.84, "ls_office": 0 }, { "cod": "TR037", "resumo": "TORRE", "solucao": "Esteriamento Vertical EV > 30m", "config": "", "unid": "M", "vl_medio": 447.9, "ls_office": 0 }, { "cod": "TR038", "resumo": "TORRE", "solucao": "Esteriamento Vertical EV > 30m", "config": "", "unid": "PÇ", "vl_medio": 154.92, "ls_office": 0 }, { "cod": "MS018", "resumo": "MASTRO", "solucao": "FCI", "config": "", "unid": "PÇ", "vl_medio": 309.33, "ls_office": 0 }, { "cod": "FD016", "resumo": "FUNDAÇÃO", "solucao": "Formas — Fornecimento, montagem, escoras, desmoldante estão inclusas neste item.", "config": "", "unid": "M2", "vl_medio": 144.05, "ls_office": 0 }, { "cod": "LG001", "resumo": "LOGÍSTIVA", "solucao": "Frete — Transporte até 500km", "config": "VTransporte até 500km", "unid": "KM/TN", "vl_medio": 6966.64, "ls_office": 0 }, { "cod": "LG002", "resumo": "LOGÍSTIVA", "solucao": "Frete — Transporte 501 km à 1000km", "config": "VTransporte 501 km à 1000km", "unid": "KM/TN", "vl_medio": 11738.06, "ls_office": 0 }, { "cod": "LG003", "resumo": "LOGÍSTIVA", "solucao": "Frete — Transporte ≥ 1001km", "config": "VTransporte ≥ 1001km", "unid": "KM/TN", "vl_medio": 18052.34, "ls_office": 0 }, { "cod": "FD017", "resumo": "FUNDAÇÃO", "solucao": "Estaca Raiz em solo comum D=20CM", "config": "Furo D=20cm", "unid": "M", "vl_medio": 1297.71, "ls_office": 0 }, { "cod": "FD018", "resumo": "FUNDAÇÃO", "solucao": "Estaca Raiz em solo comum D=25CM", "config": "Furo D=25cm", "unid": "M", "vl_medio": 1444.58, "ls_office": 0 }, { "cod": "PT001", "resumo": "PROTEÇÃO", "solucao": "Gradil — Kit Anti-vandalismo ( gradil de proteção e porta cadeado, galvanizado a fogo ) p/ QM (Quadro de Medição)", "config": "", "unid": "PÇ", "vl_medio": 1224.27, "ls_office": 0 }, { "cod": "IN015", "resumo": "INFRA", "solucao": "Guarda-corpo metálico (conforme legislação) para fechamento de perímetro de trabalho, galvanizado a fogo", "config": "", "unid": "KG", "vl_medio": 54.12, "ls_office": 0 }, { "cod": "AT013", "resumo": "ATERRAMENTO", "solucao": "Haste de aterramento 3/4\", revestida em cobre 254μ, L=2,4m", "config": "", "unid": "PÇ", "vl_medio": 338.43, "ls_office": 0 }, { "cod": "IN016", "resumo": "INFRA", "solucao": "Alambrado — Mourão de concreto H=2,00m+0,40m com travamentos nos cantos e intermediários + alambrado galvanizado 2”x2”+ 3 x fiadas de arame farpado", "config": "", "unid": "ML", "vl_medio": 512.46, "ls_office": 0 }, { "cod": "IN017", "resumo": "INFRA", "solucao": "Impermeabilização com primer, manta asfáltica plastomerica tipo 2 com 3mm de espessura, manta asfáltica elastomerica tipo 3 com 4mm de espessura, camada separadora e argamassa para proteção mecânica com 5cm de espessura com juntas de dilatação. Inclui a recomposição da área", "config": "", "unid": "M2", "vl_medio": 374.95, "ls_office": 0 }, { "cod": "IN018", "resumo": "INFRA", "solucao": "Impermeabilização com primer, manta asfáltica plastomerica tipo 2 com 3mm de espessura, camada separadora e argamassa para proteção mecânica com 5cm de espessura com juntas de dilatação. Inclui a recomposição da área", "config": "", "unid": "M2", "vl_medio": 375.09, "ls_office": 0 }, { "cod": "LD001", "resumo": "LAUDO", "solucao": "Laudo de Estabilidade de Talude + ART + Comprovante Pagamento", "config": "", "unid": "VB", "vl_medio": 5835.82, "ls_office": 0 }, { "cod": "LD002", "resumo": "LAUDO", "solucao": "Laudo estrutural de Rooftop (ex: casas, prédios ou outras edificações), com instalação do mastro em caixa d´agua, telhado, platibanda, etc + ART + Comprovante Pagamento", "config": "", "unid": "VB", "vl_medio": 5876.61, "ls_office": 0 }, { "cod": "LD003", "resumo": "LAUDO", "solucao": "Laudo Técnido de Resistencia do Concreto (fck) Obs.: Laudo de instituto credenciado, não é o fornecido pela empresa de concreto.", "config": "", "unid": "VB", "vl_medio": 4373.77, "ls_office": 0 }, { "cod": "LC001", "resumo": "LICENCIAMENTO", "solucao": "Licenciamento — Processo de Licenciamento completo - Urbanistico / Ambiental", "config": "", "unid": "VB", "vl_medio": 8659.94, "ls_office": 0 }, { "cod": "EL050", "resumo": "ELÉTRICA", "solucao": "Ligação Provisória de Energia considerando cabo 10-16mm2 + disjuntor, inclui negociação de uso provisório junto ao cedente (ex: condomínio, vizinho, etc)", "config": "", "unid": "M", "vl_medio": 82.13, "ls_office": 0 }, { "cod": "TR039", "resumo": "TORRE", "solucao": "Luminária", "config": "", "unid": "PÇ", "vl_medio": 3819.68, "ls_office": 0 }, { "cod": "MS019", "resumo": "MASTRO", "solucao": "Mastro 1,8m e fundação em solo para instalação de antena TX (parabólica 1,8m), com eletroduto flexível (envelopado em solo), eletroduto FGF e sistema de fixação para encaminhamento de cabos.", "config": "", "unid": "VB", "vl_medio": 5441.35, "ls_office": 0 }, { "cod": "FD019", "resumo": "FUNDAÇÃO", "solucao": "Micro Estaca Raiz em solo comum (utilização eqto compacto para sites reduzidos)", "config": "", "unid": "M", "vl_medio": 1646.66, "ls_office": 0 }, { "cod": "FD020", "resumo": "FUNDAÇÃO", "solucao": "Mobilização — Transporte e remoção do equipamento completo", "config": "", "unid": "VB", "vl_medio": 39831.92, "ls_office": 0 }, { "cod": "IN019", "resumo": "INFRA", "solucao": "Muro de alvenaria (espessura acabada 20 cm) , emboço e chapisco + Proteção tipo concertina", "config": "", "unid": "M2", "vl_medio": 687.89, "ls_office": 0 }, { "cod": "IN020", "resumo": "INFRA", "solucao": "Muro (pintura)", "config": "", "unid": "M2", "vl_medio": 173.57, "ls_office": 0 }, { "cod": "FD021", "resumo": "FUNDAÇÃO", "solucao": "Muro Arrimo em Concreto Armado", "config": "", "unid": "M3", "vl_medio": 3630.59, "ls_office": 0 }, { "cod": "IN021", "resumo": "INFRA", "solucao": "Abrigo — Construção de Abrigo em alvenaria para QM e QTME", "config": "", "unid": "VB", "vl_medio": 3158.23, "ls_office": 0 }, { "cod": "EL051", "resumo": "ELÉTRICA", "solucao": "Padrão de entrada BT, Monofásico (FN) 380/220V até 75KVA, Poste (padrão concecionária), eletrodutos (bengala), kit Armação Presbow + Roldana e demais acessórios", "config": "", "unid": "VB", "vl_medio": 5451.68, "ls_office": 0 }, { "cod": "IN022", "resumo": "INFRA", "solucao": "Base em concreto armado para gabinetes, mastros de RF ou MW, etc (todas as dimensões) contemplando concreto, aço, forma.", "config": "", "unid": "M3", "vl_medio": 3316.7, "ls_office": 0 }, { "cod": "PN001", "resumo": "PINTURA", "solucao": "Pétela de Coqueiro", "config": "", "unid": "KG", "vl_medio": 1934.03, "ls_office": 0 }, { "cod": "PN002", "resumo": "PINTURA", "solucao": "Pintura Poste 12m", "config": "", "unid": "VB", "vl_medio": 10403.86, "ls_office": 0 }, { "cod": "PN003", "resumo": "PINTURA", "solucao": "Pintura Poste 18m", "config": "", "unid": "VB", "vl_medio": 14439.12, "ls_office": 0 }, { "cod": "PN004", "resumo": "PINTURA", "solucao": "Pintura Poste 30m", "config": "", "unid": "VB", "vl_medio": 32027.86, "ls_office": 0 }, { "cod": "PN005", "resumo": "PINTURA", "solucao": "Pintura Poste 40m", "config": "", "unid": "VB", "vl_medio": 43486.61, "ls_office": 0 }, { "cod": "PN006", "resumo": "PINTURA", "solucao": "Pintura Poste 9m — Fornecimento de tinta epóxi na cor branca e laranja internacional conforme obrigação COMAR ou classificação de agressividade ambiental Classe III: Ambiente marinho e industrial e Classe IV: Ambiente industrial e com respingos de maré.", "config": "", "unid": "VB", "vl_medio": 8459.06, "ls_office": 0 }, { "cod": "PN007", "resumo": "PINTURA", "solucao": "Pintura Torre 30m", "config": "", "unid": "VB", "vl_medio": 31014.81, "ls_office": 0 }, { "cod": "PN008", "resumo": "PINTURA", "solucao": "Pintura Torre 40m", "config": "", "unid": "VB", "vl_medio": 43259.11, "ls_office": 0 }, { "cod": "TR040", "resumo": "TORRE", "solucao": "Plataforma", "config": "", "unid": "PÇ", "vl_medio": 4282.73, "ls_office": 0 }, { "cod": "TR041", "resumo": "TORRE", "solucao": "Plataforma Poste", "config": "", "unid": "PÇ", "vl_medio": 12315.26, "ls_office": 0 }, { "cod": "TR042", "resumo": "TORRE", "solucao": "Plataforma Torre", "config": "", "unid": "PÇ", "vl_medio": 10583.07, "ls_office": 0 }, { "cod": "IN023", "resumo": "INFRA", "solucao": "Poço de visita para captação de águas pluviais com tampa em contreto.", "config": "", "unid": "VB", "vl_medio": 1724.21, "ls_office": 0 }, { "cod": "IN024", "resumo": "INFRA", "solucao": "Portão Chapa — Portão pedestre chapa", "config": "", "unid": "VB", "vl_medio": 4743.12, "ls_office": 0 }, { "cod": "IN025", "resumo": "INFRA", "solucao": "Portão Chapa — Portão veicular chapa", "config": "", "unid": "VB", "vl_medio": 10694.92, "ls_office": 0 }, { "cod": "IN026", "resumo": "INFRA", "solucao": "Caixa de passagem 600x600x600mm  pré-moldada (inclui tampa)", "config": "", "unid": "PÇ", "vl_medio": 1149.46, "ls_office": 0 }, { "cod": "IN027", "resumo": "INFRA", "solucao": "Portão Tela — Portão veicular tela", "config": "", "unid": "VB", "vl_medio": 8406.75, "ls_office": 0 }, { "cod": "IN028", "resumo": "INFRA", "solucao": "Concertina para gradil, plataforma da torre, poste do padrão de energia", "config": "", "unid": "M", "vl_medio": 109.54, "ls_office": 0 }, { "cod": "EL052", "resumo": "ELÉTRICA", "solucao": "Poste de iluminação em aço galvanizado, 6 metros de altura, luminária tipo tartaruga e lampanda de 200 Watts ou LED.", "config": "", "unid": "PÇ", "vl_medio": 5797.77, "ls_office": 0 }, { "cod": "EL053", "resumo": "ELÉTRICA", "solucao": "Poste de monitoramento CATV em aço galvanizado, 5 metros de altura.", "config": "", "unid": "PÇ", "vl_medio": 4260.4, "ls_office": 0 }, { "cod": "AQ001", "resumo": "ACQ", "solucao": "Processo Aquisição completo - Busca / SAR / Contrato", "config": "", "unid": "VB", "vl_medio": 6112.5, "ls_office": 0 }, { "cod": "MS020", "resumo": "MASTRO", "solucao": "Projeto", "config": "", "unid": "VB", "vl_medio": 2673.21, "ls_office": 0 }, { "cod": "MS021", "resumo": "MASTRO", "solucao": "Projeto", "config": "", "unid": "VB", "vl_medio": 4572.19, "ls_office": 0 }, { "cod": "MS022", "resumo": "MASTRO", "solucao": "Projeto", "config": "", "unid": "VB", "vl_medio": 2694.65, "ls_office": 0 }, { "cod": "PJ001", "resumo": "PROJETO", "solucao": "Projeto — Projeto Prefeitura + ART + Comprovante Pagamento", "config": "", "unid": "VB", "vl_medio": 1763.98, "ls_office": 0 }, { "cod": "RF001", "resumo": "REFORÇO", "solucao": "Projeto de Reforço de Rooftop (ex: casas, prédios ou outras edificações) + ART + Comprovante Pagamento", "config": "", "unid": "VB", "vl_medio": 3887.28, "ls_office": 0 }, { "cod": "PJ002", "resumo": "PROJETO", "solucao": "Projeto Executivo (pranchas CW, EL, AT, Elevação, Detalhes)", "config": "", "unid": "VB", "vl_medio": 3755.14, "ls_office": 0 }, { "cod": "IN029", "resumo": "INFRA", "solucao": "Proteção esteiramento — Proteção de esteiramento em chapa expandida galvanizada L=400 mm", "config": "", "unid": "M", "vl_medio": 695.04, "ls_office": 0 }, { "cod": "EL054", "resumo": "ELÉTRICA", "solucao": "QDE Simplificado — Quadro QDE Simplificado, 1x disjuntor 32A (eqto), 1x disjuntor 32A (Reserva eqto) + 1x disjuntor 16A (tomada serviço)", "config": "", "unid": "VB", "vl_medio": 4399.37, "ls_office": 0 }, { "cod": "EL055", "resumo": "ELÉTRICA", "solucao": "QM Bífasico — Caixa de medição Simplificado (QM) Bifásico p/ 1x medidor (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "vl_medio": 2140.77, "ls_office": 0 }, { "cod": "EL056", "resumo": "ELÉTRICA", "solucao": "QM Monofásico — Caixa de medição Simplificado (QM) Monofásico p/ 1x medidor (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "vl_medio": 1922.98, "ls_office": 0 }, { "cod": "EL057", "resumo": "ELÉTRICA", "solucao": "QM Monofásico — Caixa de medição (QM) Monofásico p/ 2x medidores (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "vl_medio": 3364.44, "ls_office": 0 }, { "cod": "EL058", "resumo": "ELÉTRICA", "solucao": "QM Trifásico — Caixa de medição (QM) Trifásico p/ 2x medidores (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "vl_medio": 3151.62, "ls_office": 0 }, { "cod": "MS023", "resumo": "MASTRO", "solucao": "Esteriamento Horizontal EV > 30m", "config": "", "unid": "M", "vl_medio": 313.02, "ls_office": 0 }, { "cod": "EL059", "resumo": "ELÉTRICA", "solucao": "QTME Bifásico sem PPTA — Quadro QTME Bifásico, sem PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "vl_medio": 9072.96, "ls_office": 0 }, { "cod": "EL060", "resumo": "ELÉTRICA", "solucao": "QTME Trifásico com PPTA — Quadro QTME Trifásico,com PPTA, chave de transferência até 160A, tomada GMG + Supressores de surto + barramento + disjuntores e demais acessórios", "config": "", "unid": "VB", "vl_medio": 11630.0, "ls_office": 0 }, { "cod": "IN030", "resumo": "INFRA", "solucao": "Portão Tela — Portão pedestre tela", "config": "", "unid": "VB", "vl_medio": 3886.04, "ls_office": 0 }, { "cod": "TR043", "resumo": "TORRE", "solucao": "Radome", "config": "", "unid": "PÇ", "vl_medio": 10886.67, "ls_office": 0 }, { "cod": "EL061", "resumo": "ELÉTRICA", "solucao": "Ramal de Ligação — Ampliação do Ramal de Ligação ou Extensão de Rede BT (obs.: padrão TBSA até 50m incluso no ramal de ligação)", "config": "", "unid": "M", "vl_medio": 289.77, "ls_office": 0 }, { "cod": "AD002", "resumo": "ADMINISTRATIVO", "solucao": "Remobilização de Equipe: Nova mobilização de equipe, em decorrência de interrupção dos serviços não originada por ação e/ou omissão da contratada, mediante análise prévia Sites Brasil.", "config": "", "unid": "VB", "vl_medio": 6296.68, "ls_office": 0 }, { "cod": "FD022", "resumo": "FUNDAÇÃO", "solucao": "Retroescavadeira com martelo rompedor", "config": "", "unid": "Dia", "vl_medio": 3763.12, "ls_office": 0 }, { "cod": "FD023", "resumo": "FUNDAÇÃO", "solucao": "Rompedor elétrico — Locação de rompedor elétrico", "config": "", "unid": "DIA", "vl_medio": 613.95, "ls_office": 0 }, { "cod": "FD024", "resumo": "FUNDAÇÃO", "solucao": "Rompedor pneumático — Locação de rompedor  pneumático", "config": "", "unid": "Dia", "vl_medio": 563.32, "ls_office": 0 }, { "cod": "IN031", "resumo": "INFRA", "solucao": "Rufos L=0,2m em cima do muro de alvenaria", "config": "", "unid": "M", "vl_medio": 141.62, "ls_office": 0 }, { "cod": "IN032", "resumo": "INFRA", "solucao": "SKID (estrutura metálica) para suporte e fixação de Gabinetes", "config": "", "unid": "KG", "vl_medio": 52.89, "ls_office": 0 }, { "cod": "EL062", "resumo": "ELÉTRICA", "solucao": "Solicitação de ligação de energia junto a concessionária local", "config": "", "unid": "VB", "vl_medio": 2259.31, "ls_office": 0 }, { "cod": "FD025", "resumo": "FUNDAÇÃO", "solucao": "Sondagem a percussão com mínimo 2x furos (unitário por site) com Laudo Sondagem  + ART + Comprovante Pagamento", "config": "Sondagem", "unid": "VB", "vl_medio": 8164.05, "ls_office": 0 }, { "cod": "FD026", "resumo": "FUNDAÇÃO", "solucao": "Sondagem rotativa: furo adicional ou perfuração com profundidade superior a 20m, com aprovação prévia da Engenharia Sites.", "config": "Sondagem Especial", "unid": "M", "vl_medio": 1208.97, "ls_office": 0 }, { "cod": "FD027", "resumo": "FUNDAÇÃO", "solucao": "Sondagem rotativa: mobilização eqto com mínimo 2x furos até 20m inclusive (soma dos furos) (unitário por site) com Laudo Sondagem + ART", "config": "Sondagem Especial", "unid": "VB", "vl_medio": 28995.5, "ls_office": 0 }, { "cod": "MS024", "resumo": "MASTRO", "solucao": "SPDA", "config": "", "unid": "PÇ", "vl_medio": 585.99, "ls_office": 0 }, { "cod": "AT014", "resumo": "ATERRAMENTO", "solucao": "SPDA — Adequação dos  mastros de  para-raio existente do prédio\nServiços de reposicionamento, alteamento, reparo,  etc", "config": "", "unid": "VB", "vl_medio": 2238.51, "ls_office": 0 }, { "cod": "TR044", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "vl_medio": 2649.54, "ls_office": 0 }, { "cod": "TR045", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "vl_medio": 6732.4, "ls_office": 0 }, { "cod": "TR046", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "vl_medio": 4188.27, "ls_office": 0 }, { "cod": "TR047", "resumo": "TORRE", "solucao": "Suporte RF Cinta", "config": "", "unid": "PÇ", "vl_medio": 8496.01, "ls_office": 0 }, { "cod": "MS025", "resumo": "MASTRO", "solucao": "Suporte RF em plataforma EV > 30m", "config": "", "unid": "PÇ", "vl_medio": 2672.41, "ls_office": 0 }, { "cod": "MS026", "resumo": "MASTRO", "solucao": "Suporte RF em plataforma EV > 30m", "config": "", "unid": "PÇ", "vl_medio": 3742.15, "ls_office": 0 }, { "cod": "TR048", "resumo": "TORRE", "solucao": "Suporte RF Montante", "config": "", "unid": "PÇ", "vl_medio": 3499.26, "ls_office": 0 }, { "cod": "TR049", "resumo": "TORRE", "solucao": "Suporte RF Montante", "config": "", "unid": "PÇ", "vl_medio": 2163.03, "ls_office": 0 }, { "cod": "TR050", "resumo": "TORRE", "solucao": "Suporte RF Topo", "config": "", "unid": "PÇ", "vl_medio": 2072.93, "ls_office": 0 }, { "cod": "TR051", "resumo": "TORRE", "solucao": "Suporte RF Topo", "config": "", "unid": "PÇ", "vl_medio": 2282.87, "ls_office": 0 }, { "cod": "TR052", "resumo": "TORRE", "solucao": "Suporte RF Topo", "config": "", "unid": "PÇ", "vl_medio": 4311.8, "ls_office": 0 }, { "cod": "TR053", "resumo": "TORRE", "solucao": "Suporte TX", "config": "", "unid": "PÇ", "vl_medio": 2165.84, "ls_office": 0 }, { "cod": "TR054", "resumo": "TORRE", "solucao": "Suporte TX Cinta", "config": "", "unid": "PÇ", "vl_medio": 2879.01, "ls_office": 0 }, { "cod": "TR055", "resumo": "TORRE", "solucao": "Suporte TX Cinta", "config": "", "unid": "PÇ", "vl_medio": 7315.86, "ls_office": 0 }, { "cod": "MS027", "resumo": "MASTRO", "solucao": "Suporte TX em plataforma EV > 30m", "config": "", "unid": "PÇ", "vl_medio": 2250.67, "ls_office": 0 }, { "cod": "TR056", "resumo": "TORRE", "solucao": "Suporte TX Montante", "config": "", "unid": "PÇ", "vl_medio": 2603.87, "ls_office": 0 }, { "cod": "TR057", "resumo": "TORRE", "solucao": "Suporte TX Montante", "config": "", "unid": "PÇ", "vl_medio": 5993.97, "ls_office": 0 }, { "cod": "IN033", "resumo": "INFRA", "solucao": "Telhado — Demolição telhado (Cobertura), inclusive calhas e rufos até os condutores de Água Pluviais", "config": "", "unid": "M2", "vl_medio": 289.07, "ls_office": 0 }, { "cod": "IN034", "resumo": "INFRA", "solucao": "Telhado — Recomposição do Telhado (Cobertura), inclusive calhas e rufos até os condutores de Água Pluviais", "config": "", "unid": "M2", "vl_medio": 712.34, "ls_office": 0 }, { "cod": "FD028", "resumo": "FUNDAÇÃO", "solucao": "Terraplanagem — Regularização de desníveis (aclive/declive) ou Talude", "config": "", "unid": "M3", "vl_medio": 1273.69, "ls_office": 0 }, { "cod": "MS028", "resumo": "MASTRO", "solucao": "Tipo Platibanda", "config": "AeV2m² | V45", "unid": "KG", "vl_medio": 1576.52, "ls_office": 0 }, { "cod": "MS029", "resumo": "MASTRO", "solucao": "Trava quedas", "config": "", "unid": "M", "vl_medio": 74.99, "ls_office": 0 }, { "cod": "MS030", "resumo": "MASTRO", "solucao": "Trava quedas", "config": "", "unid": "M", "vl_medio": 116.96, "ls_office": 0 }, { "cod": "IN035", "resumo": "INFRA", "solucao": "Vegetação — Remoção de vegetação alta, árvore, etc", "config": "", "unid": "M3", "vl_medio": 599.91, "ls_office": 0 }, { "cod": "TR058", "resumo": "TORRE", "solucao": "Metálico Autoportante", "config": "", "unid": "PÇ", "vl_medio": 6616.42, "ls_office": 0 }, { "cod": "MS031", "resumo": "MASTRO", "solucao": "Acessórios Mastro, Poste Simplificado 9, 12, 18, Poste 30 e 40m e Torre 30 e 40m", "config": "", "unid": "PÇ", "vl_medio": 667.48, "ls_office": 0 }, { "cod": "EL063", "resumo": "ELÉTRICA", "solucao": "Caixa de medição (QM) Bifásico p/ 2x medidores (padrão concessionaria), seccionamento (disjuntor), cabos e demais acessórios", "config": "", "unid": "VB", "vl_medio": 3274.98, "ls_office": 0 }, { "cod": "IN036", "resumo": "INFRA", "solucao": "Pavimentação em concreto", "config": "", "unid": "M3", "vl_medio": 3230.7, "ls_office": 0 }, { "cod": "IN037", "resumo": "INFRA", "solucao": "Pavimentação em asfalto", "config": "", "unid": "TON", "vl_medio": 2892.98, "ls_office": 0 }, { "cod": "IN038", "resumo": "INFRA", "solucao": "Enclausuramento (tampa) de esteiramento em chapa galvanizada L=600 mm", "config": "", "unid": "M", "vl_medio": 705.54, "ls_office": 0 }, { "cod": "IN039", "resumo": "INFRA", "solucao": "Proteção de esteiramento em chapa expandida galvanizada L=600 mm", "config": "", "unid": "m", "vl_medio": 884.76, "ls_office": 0 }, { "cod": "IN040", "resumo": "INFRA", "solucao": "Kit Anti-vandalismo ( gradil de proteção e porta cadeado, galvanizado a fogo ) p/ QTME (Quadro de Medição)", "config": "", "unid": "PÇ", "vl_medio": 1610.82, "ls_office": 0 }, { "cod": "AD003", "resumo": "ADMINISTRATIVO", "solucao": "FRETE ESTIMADO", "config": "", "unid": "VB", "vl_medio": 20570.0, "ls_office": 0 }];

const CATEGORIAS = [...new Set(DB.map(i => i.resumo))].sort();

// ── LPU OPERAÇÃO — lista específica de manutenção e operação de sites
const DB_OP = [
  { cod: "OP001", resumo: "PREVENTIVA", solucao: "Manutenção preventiva mensal de site — inspeção geral, limpeza, aperto de conexões, verificação de sistemas", config: "Mensal", unid: "VB", vl_medio: 2850.00 },
  { cod: "OP002", resumo: "PREVENTIVA", solucao: "Manutenção preventiva trimestral de site — inclui OP001 + teste de baterias, calibração de alarmes", config: "Trimestral", unid: "VB", vl_medio: 4200.00 },
  { cod: "OP003", resumo: "PREVENTIVA", solucao: "Manutenção preventiva semestral de site — inclui OP002 + pintura de proteção, revisão estrutural", config: "Semestral", unid: "VB", vl_medio: 6800.00 },
  { cod: "OP004", resumo: "CORRETIVA", solucao: "Manutenção corretiva — atendimento emergencial para restauração de serviço fora do horário comercial", config: "Emergencial", unid: "VB", vl_medio: 3500.00 },
  { cod: "OP005", resumo: "CORRETIVA", solucao: "Manutenção corretiva — atendimento em horário comercial, diagnóstico e reparo de falhas", config: "Horário Comercial", unid: "VB", vl_medio: 1800.00 },
  { cod: "OP006", resumo: "CORRETIVA", solucao: "Substituição de equipamento de energia (retificador, banco de baterias) — fornecimento e instalação", config: "Energia", unid: "VB", vl_medio: 8500.00 },
  { cod: "OP007", resumo: "ENERGIA", solucao: "Recarga e substituição de banco de baterias 48V — fornecimento e instalação", config: "Banco de Baterias", unid: "VB", vl_medio: 12000.00 },
  { cod: "OP008", resumo: "ENERGIA", solucao: "Gerador a diesel — locação mensal com abastecimento incluso (até 500h/mês)", config: "Locação Mensal", unid: "MÊS", vl_medio: 9800.00 },
  { cod: "OP009", resumo: "ENERGIA", solucao: "Gerador a diesel — instalação de gerador fixo, cabeamento e quadro de transferência", config: "Instalação", unid: "VB", vl_medio: 22000.00 },
  { cod: "OP010", resumo: "ENERGIA", solucao: "Adequação de sistema de energia — retrofit de retificadores e controladores", config: "Retrofit", unid: "VB", vl_medio: 15000.00 },
  { cod: "OP011", resumo: "SPDA", solucao: "Manutenção e adequação do SPDA — verificação de hastes, cordoalhas e conexões", config: "Manutenção", unid: "VB", vl_medio: 3200.00 },
  { cod: "OP012", resumo: "SPDA", solucao: "Substituição completa do SPDA — fornecimento e instalação de hastes, cordoalhas e caixas de inspeção", config: "Substituição", unid: "VB", vl_medio: 8900.00 },
  { cod: "OP013", resumo: "LIMPEZA", solucao: "Limpeza geral do site — varrição, retirada de entulho, limpeza de sala de equipamentos", config: "Geral", unid: "VB", vl_medio: 950.00 },
  { cod: "OP014", resumo: "LIMPEZA", solucao: "Limpeza e desobstrução de sistema de drenagem — calhas, ralos e poços de visita", config: "Drenagem", unid: "VB", vl_medio: 1400.00 },
  { cod: "OP015", resumo: "SEGURANÇA", solucao: "Adequação de cercamento — reparo ou substituição de alambrado, concertina e portão", config: "Cercamento", unid: "VB", vl_medio: 5500.00 },
  { cod: "OP016", resumo: "SEGURANÇA", solucao: "Instalação de câmera de monitoramento CFTV — fornecimento, instalação e configuração", config: "CFTV", unid: "PÇ", vl_medio: 2800.00 },
  { cod: "OP017", resumo: "SEGURANÇA", solucao: "Sistema de alarme anti-intrusão — fornecimento, instalação e programação de central", config: "Alarme", unid: "VB", vl_medio: 6200.00 },
  { cod: "OP018", resumo: "CIVIL", solucao: "Reparo de cobertura e telhado — identificação de vazamentos, troca de telhas e impermeabilização", config: "Telhado", unid: "M2", vl_medio: 380.00 },
  { cod: "OP019", resumo: "CIVIL", solucao: "Pintura interna de sala de equipamentos — preparação de superfície, massa corrida e tinta PVA", config: "Pintura Interna", unid: "M2", vl_medio: 85.00 },
  { cod: "OP020", resumo: "CIVIL", solucao: "Pintura externa — preparação, primer e tinta acrílica resistente a UV", config: "Pintura Externa", unid: "M2", vl_medio: 120.00 },
  { cod: "OP021", resumo: "CIVIL", solucao: "Reparo de piso — regularização, rejuntamento ou reposição de piso cimentício", config: "Piso", unid: "M2", vl_medio: 210.00 },
  { cod: "OP022", resumo: "ESTRUTURA", solucao: "Vistoria estrutural de torre ou poste — laudo técnico com ART", config: "Laudo", unid: "VB", vl_medio: 4500.00 },
  { cod: "OP023", resumo: "ESTRUTURA", solucao: "Reaperto geral de parafusos de torre ou mastro — inspeção visual e aperto com torquímetro", config: "Reaperto", unid: "VB", vl_medio: 2200.00 },
  { cod: "OP024", resumo: "ESTRUTURA", solucao: "Pintura anticorrosiva de estrutura metálica — jato de areia e aplicação de primer + esmalte", config: "Anticorrosiva", unid: "KG", vl_medio: 42.00 },
  { cod: "OP025", resumo: "CABOS", solucao: "Substituição de cabo coaxial de RF — fornecimento e instalação por metro", config: "RF", unid: "M", vl_medio: 185.00 },
  { cod: "OP026", resumo: "CABOS", solucao: "Substituição de jumper de RF — fornecimento e instalação", config: "Jumper", unid: "PÇ", vl_medio: 650.00 },
  { cod: "OP027", resumo: "CABOS", solucao: "Instalação de cabo de fibra óptica interno — passagem em eletroduto com fusão e certificação", config: "FO Interno", unid: "M", vl_medio: 95.00 },
  { cod: "OP028", resumo: "DESATIVAÇÃO", solucao: "Desativação parcial de site — desmontagem de equipamentos de RF e retirada de cabos", config: "Parcial", unid: "VB", vl_medio: 5500.00 },
  { cod: "OP029", resumo: "DESATIVAÇÃO", solucao: "Desativação total de site — desmontagem completa, retirada de equipamentos e limpeza final", config: "Total", unid: "VB", vl_medio: 12000.00 },
  { cod: "OP030", resumo: "ADMINISTRATIVO", solucao: "Deslocamento pontual — mobilização de equipe para atividade avulsa não prevista em contrato", config: "Mobilização", unid: "VB", vl_medio: 1800.00 },
];
const CATEGORIAS_OP = [...new Set(DB_OP.map(i => i.resumo))].sort();

// ── Etapas padrão de cronograma para obras de telecom

// ── Tipos de Projeto e seus cronogramas padrão
const TIPOS_PROJETO = [
  { id: "manutencao_geral", label: "Manutenção O&M", icon: "⚙️" },
  { id: "bts", label: "BTS", icon: "🏗️" },
  { id: "obra_bts", label: "Obra BTS", icon: "🏗️" },
  { id: "obra_couro", label: "Obra Couro", icon: "📡" },
  { id: "adequacao_infra", label: "Adequação de Infra", icon: "🔧" },
  { id: "custom", label: "Personalizado", icon: "✏️" },
];

const ETAPAS_POR_TIPO = {
  adequacao_infra: [
    { nome: "Aceite do Projeto", grupo: "Aceite", cor: "#34d399" },
    { nome: "Compras e Logística de Obra", grupo: "Compras", cor: "#34d399" },
    { nome: "Solicitação de Energia", grupo: "Energia", cor: "#34d399" },
    { nome: "Ligação de Energia Definitiva", grupo: "Energia", cor: "#fbbf24" },
    { nome: "Execução de Obra Civil", grupo: "Civil", cor: "#3b82f6" },
    { nome: "Montagem dos Metálicos", grupo: "Civil", cor: "#a78bfa" },
    { nome: "RFI", grupo: "Civil", cor: "#5a6a82" },
  ],
  bts: [
    { nome: "Aceite do Projeto", grupo: "Aceite", cor: "#34d399" },
    { nome: "Compras e Logística de Obra", grupo: "Compras", cor: "#34d399" },
    { nome: "Aprovação de Projeto", grupo: "Projeto", cor: "#67e8f9" },
    { nome: "Solicitação de Energia", grupo: "Energia", cor: "#34d399" },
    { nome: "Serviços Preliminares / Terraplenagem", grupo: "Civil", cor: "#fb923c" },
    { nome: "Fundação", grupo: "Civil", cor: "#f87171" },
    { nome: "Estrutura Metálica", grupo: "Civil", cor: "#a78bfa" },
    { nome: "Obra Civil BTS", grupo: "Civil", cor: "#3b82f6" },
    { nome: "Instalação Elétrica", grupo: "Elétrica", cor: "#fbbf24" },
    { nome: "Ligação de Energia Definitiva", grupo: "Energia", cor: "#fbbf24" },
    { nome: "Montagem dos Metálicos", grupo: "Civil", cor: "#a78bfa" },
    { nome: "Comissionamento", grupo: "Telecom", cor: "#67e8f9" },
    { nome: "RFI", grupo: "Civil", cor: "#5a6a82" },
    { nome: "Aceite Final", grupo: "Aceite", cor: "#34d399" },
  ],
  obra_bts: [
    { nome: "Aceite do Projeto", grupo: "Aceite", cor: "#34d399" },
    { nome: "Compras e Logística de Obra", grupo: "Compras", cor: "#34d399" },
    { nome: "Fundação e Civil", grupo: "Civil", cor: "#3b82f6" },
    { nome: "Montagem Metálica", grupo: "Civil", cor: "#a78bfa" },
    { nome: "RFI", grupo: "Civil", cor: "#5a6a82" },
  ],
  obra_couro: [
    { nome: "Aceite do Projeto", grupo: "Aceite", cor: "#34d399" },
    { nome: "Compras e Logística", grupo: "Compras", cor: "#34d399" },
    { nome: "Vistoria Técnica", grupo: "Projeto", cor: "#67e8f9" },
    { nome: "Adequação de Infra Existente", grupo: "Civil", cor: "#3b82f6" },
    { nome: "Instalação de Equipamentos", grupo: "Telecom", cor: "#a78bfa" },
    { nome: "Configuração / Integração", grupo: "Telecom", cor: "#fbbf24" },
    { nome: "Testes e Comissionamento", grupo: "Telecom", cor: "#67e8f9" },
    { nome: "RFI", grupo: "Civil", cor: "#5a6a82" },
  ],
  manutencao_geral: [
    { nome: "Abertura de OS", grupo: "OS", cor: "#67e8f9" },
    { nome: "Diagnóstico / Vistoria", grupo: "Execução", cor: "#fbbf24" },
    { nome: "Execução / Reparo", grupo: "Execução", cor: "#3b82f6" },
    { nome: "Testes Pós-Serviço", grupo: "Execução", cor: "#a78bfa" },
    { nome: "Encerramento de OS", grupo: "OS", cor: "#34d399" },
  ],
  custom: [
    { nome: "Aceite do Projeto", grupo: "Aceite", cor: "#34d399" },
    { nome: "Execução", grupo: "Execução", cor: "#3b82f6" },
    { nome: "Entrega / RFI", grupo: "Entrega", cor: "#5a6a82" },
  ],
};

const makeEtapasPorTipo = (tipo) => {
  const base = ETAPAS_POR_TIPO[tipo] || ETAPAS_POR_TIPO.adequacao_infra;
  return base.map((e, i) => ({
    ...e, progresso: 0, responsavel: "", inicio: "", fim: "",
    id: `et_${tipo}_${i}_${Date.now()}`
  }));
};

const ETAPAS_PADRAO = [
  { nome: "Aceite do Projeto", grupo: "Aceite", cor: "#34d399", progresso: 0, responsavel: "", inicio: "", fim: "" },
  { nome: "Compras e Logística de Obra", grupo: "Compras", cor: "#34d399", progresso: 0, responsavel: "", inicio: "", fim: "" },
  { nome: "Solicitação de Energia", grupo: "Energia", cor: "#34d399", progresso: 0, responsavel: "", inicio: "", fim: "" },
  { nome: "Ligação de Energia Definitiva", grupo: "Energia", cor: "#fbbf24", progresso: 0, responsavel: "", inicio: "", fim: "" },
  { nome: "Início de Obra Civil", grupo: "Civil", cor: "#34d399", progresso: 0, responsavel: "", inicio: "", fim: "" },
  { nome: "Execução de Obra Civil", grupo: "Civil", cor: "#3b82f6", progresso: 0, responsavel: "", inicio: "", fim: "" },
  { nome: "Montagem dos Metálicos", grupo: "Civil", cor: "#a78bfa", progresso: 0, responsavel: "", inicio: "", fim: "" },
  { nome: "RFI", grupo: "Civil", cor: "#5a6a82", progresso: 0, responsavel: "", inicio: "", fim: "" },
];
const makeEtapas = () => ETAPAS_PADRAO.map((e, i) => ({ ...e, id: `et_pad_${i}_${Date.now()}` }));
const ETAPA_FORM_INIT = { nome: "", grupo: "", responsavel: "", inicio: "", fim: "", progresso: 0, cor: "#3b82f6" };

const PROJETOS_INIT = [
  {
    id: "proj_papcj001", siteIdSharing: "PAPCJ001", siteIdOperadora: "", sharing: "Highline", operadora: "Vivo",
    Sharing: "Highline", municipio: "Campinas", uf: "SP",
    endereco: "Av. Brasil, 1240, Jd. Paulista",
    descricao: "Fornecimento de Estrutura Metálica", fornecedor: "Cell Project",
    contato: "Matheus Canova", dataOrcamento: "11/03/2026", dataInicioAtividade: "17/12/2025", dataFimAtividade: "27/01/2026", proposta: "N°03",
    status: "Em Andamento", bdi: 0, lucro: 0, avancoFisico: 45, segmento: "Implantação", gestor: "Diego Melo", tipoProjeto: "adequacao_infra",
    budgetAprovado: 13850,
    notas: "Materiais padrão à pronta entrega. Específicos: 15 dias após aprovação.",
    itens: [
      { id: 1, descricao: "Esteira Metálica L=400mm", unid: "M", qtde: 6, vlUnit: 120, qtdeMed: 6, tipo: "Material" },
      { id: 2, descricao: "Tampa de Proteção para Esteira L=400mm", unid: "M", qtde: 6, vlUnit: 100, qtdeMed: 4, tipo: "Material" },
      { id: 3, descricao: "Costela de Vaca L=400mm (a cada 0,60m)", unid: "Pç", qtde: 85, vlUnit: 42, qtdeMed: 60, tipo: "Material" },
      { id: 4, descricao: "Suporte Simples Antena RF/RRU", unid: "Und", qtde: 3, vlUnit: 1700, qtdeMed: 2, tipo: "Material" },
      { id: 5, descricao: "Barra EGB", unid: "pç", qtde: 1, vlUnit: 200, qtdeMed: 1, tipo: "Material" },
      { id: 6, descricao: "Barra FCI", unid: "pç", qtde: 3, vlUnit: 80, qtdeMed: 0, tipo: "Material" },
      { id: 7, descricao: "Caixa de Passagem 600x600mm", unid: "Und", qtde: 3, vlUnit: 350, qtdeMed: 3, tipo: "Material" },
      { id: 8, descricao: "Caixa de Passagem 300x300mm", unid: "Und", qtde: 1, vlUnit: 270, qtdeMed: 1, tipo: "Material" },
      { id: 9, descricao: "Gradil de Proteção 800x1000mm", unid: "Und", qtde: 1, vlUnit: 800, qtdeMed: 1, tipo: "Material" },
      { id: 10, descricao: "Gradil de Proteção para Medidor", unid: "Und", qtde: 1, vlUnit: 500, qtdeMed: 0, tipo: "Material" },
      { id: 11, descricao: "Poste Metálico H=3,00m para Luminária", unid: "Und", qtde: 1, vlUnit: 800, qtdeMed: 0, tipo: "Material" },
    ],
    nfs: [
      { id: "nf_p1_1", num: "003847", cnpj: "12.345.678/0001-99", fornecedor: "Cell Project", desc: "Fornecimento Estrutura Metálica", valor: 13850, status: "Pago", emissao: "11/03/2026", vencimento: "11/04/2026", categoria: "Material", vinculo: "Itens 1-11" },
    ],
    etapas: [
      { id: "et_p1_0", nome: "Aceite do Projeto", grupo: "Aceite", cor: "#34d399", progresso: 100, responsavel: "Luan", inicio: "17/12/25", fim: "17/12/25" },
      { id: "et_p1_1", nome: "Compras e Logística de Obra", grupo: "Compras", cor: "#34d399", progresso: 100, responsavel: "Luan", inicio: "18/12/25", fim: "31/12/25" },
      { id: "et_p1_2", nome: "Solicitação de Energia", grupo: "Energia", cor: "#34d399", progresso: 100, responsavel: "Luan", inicio: "16/01/26", fim: "20/01/26" },
      { id: "et_p1_3", nome: "Ligação de Energia Definitiva", grupo: "Energia", cor: "#fbbf24", progresso: 25, responsavel: "Luan", inicio: "20/01/26", fim: "27/01/26" },
      { id: "et_p1_4", nome: "Início de Obra Civil", grupo: "Civil", cor: "#34d399", progresso: 100, responsavel: "Luan", inicio: "14/01/26", fim: "20/08/35" },
      { id: "et_p1_5", nome: "Execução de Obra Civil", grupo: "Civil", cor: "#3b82f6", progresso: 57, responsavel: "Luan", inicio: "14/01/26", fim: "27/01/26" },
      { id: "et_p1_6", nome: "Montagem dos Metálicos", grupo: "Civil", cor: "#a78bfa", progresso: 0, responsavel: "Luan", inicio: "26/01/26", fim: "27/01/26" },
      { id: "et_p1_7", nome: "RFI", grupo: "Civil", cor: "#5a6a82", progresso: 0, responsavel: "Luan", inicio: "27/01/26", fim: "27/01/26" },
    ],
  },
  {
    id: "proj_papcj06", siteIdSharing: "PAPCJ06", siteIdOperadora: "", sharing: "Highline", operadora: "Claro",
    Sharing: "Highline", municipio: "Campinas", uf: "SP",
    endereco: "Rua das Palmeiras, 890, Vila Nova",
    descricao: "Fornecimento de Estrutura Metálica", fornecedor: "Cell Project",
    contato: "Matheus Canova", dataOrcamento: "11/03/2026", dataInicioAtividade: "11/03/2026", dataFimAtividade: "", proposta: "N°04",
    status: "Em Andamento", bdi: 0, lucro: 0, avancoFisico: 22, segmento: "Implantação", gestor: "Diego Melo", tipoProjeto: "colo",
    budgetAprovado: 17080,
    notas: "Materiais padrão à pronta entrega. Específicos (skid, mastro e GC): 15 dias após aprovação.",
    itens: [
      { id: 1, descricao: "Esteira Metálica L=400mm", unid: "m", qtde: 6, vlUnit: 120, qtdeMed: 6, tipo: "Material" },
      { id: 2, descricao: "Costela de Vaca L=400mm (a cada 1,00m)", unid: "Pç", qtde: 35, vlUnit: 40, qtdeMed: 0, tipo: "Material" },
      { id: 3, descricao: "Estrutura Metálica SKID Reforço Equipamentos", unid: "Und", qtde: 3, vlUnit: 1050, qtdeMed: 0, tipo: "Material" },
      { id: 4, descricao: "Suporte Duplo Antena RF/RRU", unid: "Und", qtde: 3, vlUnit: 2300, qtdeMed: 0, tipo: "Material" },
      { id: 5, descricao: "Barra EGB", unid: "pç", qtde: 1, vlUnit: 200, qtdeMed: 1, tipo: "Material" },
      { id: 6, descricao: "Barra FCI", unid: "pç", qtde: 3, vlUnit: 80, qtdeMed: 0, tipo: "Material" },
      { id: 7, descricao: "Caixa de Passagem 600x600mm", unid: "Und", qtde: 6, vlUnit: 350, qtdeMed: 3, tipo: "Material" },
      { id: 8, descricao: "Caixa de Passagem 300x300mm", unid: "Und", qtde: 1, vlUnit: 270, qtdeMed: 1, tipo: "Material" },
      { id: 9, descricao: "Gradil de Proteção 800x1000mm", unid: "Und", qtde: 1, vlUnit: 800, qtdeMed: 1, tipo: "Material" },
      { id: 10, descricao: "Gradil de Proteção para Medidor", unid: "Und", qtde: 1, vlUnit: 500, qtdeMed: 0, tipo: "Material" },
      { id: 11, descricao: "Poste Metálico H=2,00m para Luminária", unid: "Und", qtde: 1, vlUnit: 800, qtdeMed: 0, tipo: "Material" },
    ],
    nfs: [
      { id: "nf_p2_1", num: "003848", cnpj: "12.345.678/0001-99", fornecedor: "Cell Project", desc: "Fornecimento Estrutura Metálica - Proposta N°04", valor: 17080, status: "Pago", emissao: "11/03/2026", vencimento: "11/04/2026", categoria: "Material", vinculo: "Itens 1-11" },
    ],
    etapas: makeEtapas(),
  },
];

const AREAS = [
  { id: "implantacao", label: "Implantação", icon: "🔧", desc: "Construção civil, estrutura metálica, fundação, elétrica e SPDA.", color: "#3b82f6", gradient: "linear-gradient(135deg,#1e3a5f,#1d4ed8)", lpu: "LPU ADEQUAÇÃO", hasLPU: true },
  { id: "operacao", label: "Operação", icon: "⚙️", desc: "Manutenção preventiva, corretiva e operação de sites.", color: "#34d399", gradient: "linear-gradient(135deg,#064e3b,#059669)", lpu: "LPU OPERAÇÃO", hasLPU: false },
  { id: "aquisicao", label: "Aquisição", icon: "📋", desc: "Processos de aquisição de área, SAR e contratos.", color: "#f59e0b", gradient: "linear-gradient(135deg,#78350f,#d97706)", lpu: "LPU AQUISIÇÃO", hasLPU: false },
  { id: "licenciamento", label: "Licenciamento", icon: "📜", desc: "Processos de licenciamento urbanístico e ambiental.", color: "#a78bfa", gradient: "linear-gradient(135deg,#3b0764,#7c3aed)", lpu: "LPU LICENCIAMENTO", hasLPU: false },
];
const SHARINGS = ["Highline", "SBA Torres", "IHS", "American Tower", "Grupo TôrresTelecom", "Própria"];
const OPERADORAS = ["Vivo", "Claro", "TIM", "Oi", "Outros"];
const STATUS_OPTS = ["Prospectando", "Planejado", "Em Andamento", "Pausado", "Concluído", "Cancelado"];
const CATEG_TIPO = ["Material", "MO", "Serviço", "Equipamento", "Locação"];
const NF_STATUS = ["A Pagar", "Pago", "Em Atraso", "Pendente"];

const padDatePart = (value, size = 2) => String(value || "").padStart(size, "0");
const isoDateToBr = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(raw)) return raw;
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${padDatePart(day)}/${padDatePart(month)}/${year}`;
};
const brDateToIso = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [day, month, year] = raw.split("/");
  if (!day || !month || !year) return "";
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${padDatePart(fullYear, 4)}-${padDatePart(month)}-${padDatePart(day)}`;
};
const parseProjectDate = (value) => {
  const iso = brDateToIso(value);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
const formatDateToBr = (date) => date.toLocaleDateString("pt-BR");
const getProjectStartDate = (project) => {
  if (project?.dataInicioAtividade) return project.dataInicioAtividade;
  const dates: Date[] = [];
  (project?.etapas || []).forEach(etapa => {
    const parsed = parseProjectDate(etapa?.inicio);
    if (parsed) dates.push(parsed);
  });
  if (dates.length > 0) return formatDateToBr(new Date(Math.min(...dates.map(date => date.getTime()))));
  return project?.dataOrcamento || "";
};
const getProjectEndDate = (project) => {
  if (project?.dataFimAtividade) return project.dataFimAtividade;
  const dates: Date[] = [];
  (project?.etapas || []).forEach(etapa => {
    const parsed = parseProjectDate(etapa?.fim || etapa?.inicio);
    if (parsed) dates.push(parsed);
  });
  if (dates.length > 0) return formatDateToBr(new Date(Math.max(...dates.map(date => date.getTime()))));
  return "";
};
const fmt = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (a, b) => b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;

const T = {
  bg0: "#07090f", bg1: "#0e1117", bg2: "#13181f", bg3: "#1a2030", bg4: "#222a3a",
  bgHover: "rgba(59,130,246,0.10)", bgSidebar: "#0e1117",
  brSub: "#1e2840", brBase: "#2d3a52", brStrong: "#3d5070",
  txPri: "#f0f4fa", txSec: "#b4c5d8", txMut: "#7c94b0", txDis: "#506480",
  blue: "#3b82f6", blueD: "#1d4ed8", blueL: "#93c5fd",
  green: "#34d399", greenD: "#0d9e74",
  amber: "#fbbf24", amberD: "#d97706",
  red: "#f87171", redD: "#dc2626",
  purple: "#a78bfa", cyan: "#67e8f9", orange: "#fb923c",
  gradBlue: "linear-gradient(90deg, #2563EB, #3B82F6)",
};

const ST_COLOR = {
  "Prospectando": T.purple, "Planejado": T.txMut, "Em Andamento": T.blue,
  "Pausado": T.amber, "Concluído": T.green, "Cancelado": T.red,
  "Em Execução": T.blue, "Alerta": T.red,
};
const NF_PAGO_STATUS = new Set(["Pago", "Paga"]);
const NF_ATRASO_STATUS = new Set(["Em Atraso", "Vencida"]);
const PAGAMENTO_PAGO_STATUS = new Set(["Pago"]);
const DESPESA_CONFIRMADA_STATUS = new Set(["Validada", "Reembolsada", "Pago"]);
const NF_COLOR = {
  "Pago": T.green,
  "Paga": T.green,
  "Aguardando Pagamento": T.amber,
  "Lançada": T.blue,
  "Vencida": T.red,
  "Em Atraso": T.red,
  "Cancelada": T.redD,
  "A Pagar": T.amber,
  "Pendente": T.purple,
};
const CAT_COLOR = { "Material": T.blue, "MO": T.orange, "Serviço": T.purple, "Equipamento": T.cyan, "Locação": T.amber };
const OP_COLOR = { "Vivo": "#818cf8", "Claro": T.red, "TIM": T.blue, "Oi": T.amber, "Outros": T.txMut };
const normalizeNFStatus = (status) => {
  const current = String(status || "").trim();
  if (current === "Cancelada") return "Cancelada";
  return "Pago";
};
const isComprovanteValido = (arquivo) => {
  if (!arquivo || typeof arquivo !== "object") return false;
  const nome = typeof arquivo.name === "string" ? arquivo.name.trim() : "";
  const dados = typeof arquivo.data === "string" ? arquivo.data.trim() : "";
  return !!(nome && dados);
};
const getComprovanteArquivo = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const candidatos = [entry.comprovante, entry.anexoComprovante, entry.anexoTC];
  for (const candidato of candidatos) {
    if (isComprovanteValido(candidato)) return candidato;
  }
  return null;
};
const hasComprovanteArquivo = (entry) => {
  return isComprovanteValido(getComprovanteArquivo(entry));
};
const normalizeLancamentoComprovante = (entry) => {
  if (!entry || typeof entry !== "object") return entry;
  const comprovante = getComprovanteArquivo(entry);
  const anexoComprovante = isComprovanteValido(entry.anexoComprovante) ? entry.anexoComprovante : comprovante;
  const anexoTC = isComprovanteValido(entry.anexoTC) ? entry.anexoTC : comprovante;
  return {
    ...entry,
    comprovante: comprovante || null,
    anexoComprovante: anexoComprovante || null,
    anexoTC: anexoTC || null,
  };
};
const normalizeProjetoFinanceiro = (project) => {
  if (!project || typeof project !== "object") return project;
  return {
    ...project,
    nfs: (project.nfs || []).map(normalizeLancamentoComprovante),
    adiantamentos: (project.adiantamentos || []).map(normalizeLancamentoComprovante),
    despesasGerais: (project.despesasGerais || []).map(normalizeLancamentoComprovante),
  };
};

// ── Error Boundary for debugging
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return (<div style={{ padding: 40, color: "#f87171", background: "#07090f", minHeight: "100vh", fontFamily: "monospace" }}>
        <h2>⚠️ Erro no componente App</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{String(this.state.error)}</pre>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#9aa5bb", marginTop: 20 }}>{this.state.error?.stack}</pre>
        <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: "10px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Recarregar</button>
      </div>);
    }
    return this.props.children;
  }
}

// ── Root — controla login (aceita auth externo via JWT ou login interno)
export default function Root({ authUser = null, onLogout: externalLogout = null }: { authUser?: any; onLogout?: (() => void) | null; authToken?: string | null } = {}) {
  const [user, setUser] = useState<any>(authUser);

  function handleLogout() {
    setUser(null);
    if (externalLogout) externalLogout();
  }

  if (!user) return <LoginScreen onLogin={setUser} />;
  return <ErrorBoundary><App user={user} onLogout={handleLogout} /></ErrorBoundary>;
}

function App({ user, onLogout }) {
  // ── NAV: "orcamento" | "projetos" | "controle" | "fornecedores" | "resumo" | "historico"
  const [mainView, setMainView] = useState("main");
  const [sidePinned, setSidePinned] = useState(false);
  const [sideHovered, setSideHovered] = useState(false);
  const [currentArea, setCurrentArea] = useState(null);
  const [tab, setTab] = useState("orcv2");

  // ── Budget V2 (multi-sharing) ──
  const [activeBudgetV2, setActiveBudgetV2] = useState<Budget | null>(null);
  const handleSaveBudgetV2 = (budget: Budget) => {
    // Sempre recalcula os totais dos blocos antes de salvar (garante valor atualizado no historico)
    const freshTotals = calcBudgetTotals(budget);
    const budgetToSave = { ...budget, ...freshTotals };
    setHistorico(prev => {
      const exists = prev.find((o: any) => o.id === budget.id);
      if (exists) {
        return prev.map((o: any) => o.id === budget.id ? { ...o, ...budgetToSave, projetoId: budget.projetoId ?? o.projetoId } : o);
      }
      return [budgetToSave, ...prev];
    });
    // Sync projeto vinculado: atualiza orcamentoVinculadoId E budgetAprovado
    if ((budget as any).projetoId) {
      const projId = (budget as any).projetoId;
      setProjetos((prev: any[]) => prev.map((p: any) => {
        if (p.id === projId) {
          return { ...p, orcamentoVinculadoId: budget.id, budgetAprovado: freshTotals.totalGeral };
        }
        return p;
      }));
    }
  };

  // ── Helper: carregar dado do localStorage com fallback
  const loadLS = (key, fallback) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  };

  // ── LPU Orçamento state
  const [discount, setDiscount] = useState(() => loadLS("ls_discount", 0));
  const [bdi, setBdi] = useState(() => loadLS("ls_bdi", 25));
  const [lucro, setLucro] = useState(() => loadLS("ls_lucro", 10));
  const [searchTerm, setSearchTerm] = useState("");
  const [catFilter, setCatFilter] = useState("TODOS");
  const [siteInfo, setSiteInfo] = useState(() => loadLS("ls_siteInfo", { siteId: "", sharingNome: "", siteIdSharing: "", operadora: "", uf: "", municipio: "", endereco: "" }));
  const [showSiteModal, setShowSiteModal] = useState(false);
  const setSiteField = React.useCallback((k, v) => setSiteInfo(p => ({ ...p, [k]: v })), []);
  const [historico, setHistorico] = useState(() => (loadLS("ls_historico", []) || []).map(normalizeHistoricBudgetEntry));
  const updateHistoricBudgetStatus = React.useCallback((budgetId, status) => {
    setHistorico(prev => prev.map(entry => entry.id === budgetId ? normalizeHistoricBudgetEntry({ ...entry, status }) : entry));
    setActiveBudgetV2(prev => prev && prev.id === budgetId ? { ...prev, status } : prev);
  }, []);

  // ── Projetos / Controle de Obras state
  const [projetos, setProjetos] = useState(() => {
    const loadedProjects = loadLS("ls_projetos", PROJETOS_INIT);
    const base = Array.isArray(loadedProjects) ? loadedProjects : PROJETOS_INIT;
    return base.map(normalizeProjetoFinanceiro);
  });
  const [projetoSel, setProjetoSel] = useState(null);
  const [obraTab, setObraTab] = useState("resumo"); // resumo|nfs|medicao
  const [showProjModal, setShowProjModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showNFModal, setShowNFModal] = useState(false);
  const [editingDespesaId, setEditingDespesaId] = useState<string | null>(null); // id do lançamento em edição
  // ── States movidos para o nível raiz para evitar re-render em inputs
  const [despesasSubTab, setDespesasSubTab] = useState("materiais");
  const [pagTipoFavorecido, setPagTipoFavorecido] = useState("todos"); // "todos"|"funcionario"|"prestador"
  const [showEtapaModal, setShowEtapaModal] = useState(false);
  const [editingEtapaId, setEditingEtapaId] = useState<string | null>(null);
  const [etapaForm, setEtapaForm] = useState(ETAPA_FORM_INIT);
  const [fornSearch, setFornSearch] = useState("");
  const [fornFilterTipo, setFornFilterTipo] = useState("TODOS");
  const [fornSubTab, setFornSubTab] = useState<"material"|"prestador">("prestador");
  const [cliSearch, setCliSearch] = useState("");
  const [cliFilterTipo, setCliFilterTipo] = useState("TODOS");
  const [funcSearch, setFuncSearch] = useState("");
  const [funcFilterTipo, setFuncFilterTipo] = useState("TODOS");
  // ── Faturamento states
  const [fatPctEdit, setFatPctEdit] = useState({});
  const [fatSelected, setFatSelected] = useState({});
  const [fatExpandido, setFatExpandido] = useState({});
  const [fatFiltroStatus, setFatFiltroStatus] = useState("TODOS");
  const [fatEditProjetoId, setFatEditProjetoId] = useState<string | null>(null);
  const [fatForm, setFatForm] = useState({ status: "nao", data: "", numeroNF: "" });
  // ── Comentários states
  const [comTexto, setComTexto] = useState("");
  const [comAutor, setComAutor] = useState("");
  const [comTipo, setComTipo] = useState("Andamento");
  // ── Status dropdown inline
  const [showStatusDrop, setShowStatusDrop] = useState(false);
  // ── PV Highline / Orçamento
  // pvSiteId sincroniza automaticamente com siteInfo do orçamento
  const [pvSiteIdOverride, setPvSiteIdOverride] = useState("");
  const [pvUFOverride, setPvUFOverride] = useState("");
  const [pvRegiao, setPvRegiao] = useState("NORTE");
  const [pvFornec, setPvFornec] = useState("LS OFFICE");
  // Derivados: usa valor do site se não foi sobrescrito manualmente no PV
  const pvSiteId = pvSiteIdOverride || siteInfo.siteId || "—";
  const pvUF = pvUFOverride || siteInfo.uf || "—";
  const setPvSiteId = setPvSiteIdOverride;
  const setPvUF = setPvUFOverride;
  const [pvManuais, setPvManuais] = useState({});  // itemHL -> {qtde, vlUnit}
  const [pvTabInner, setPvTabInner] = useState("orcamento"); // orcamento | pv | resumo
  const [pvExportando, setPvExportando] = useState(false);
  const [pvExportMsg, setPvExportMsg] = useState("");
  const [nfModalTipo, setNfModalTipo] = useState("nf"); // "nf" | "pagamento" | "despesa"
  const [editProj, setEditProj] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [projForm, setProjForm] = useState({});
  const [showBudgetLinkModal, setShowBudgetLinkModal] = useState(false);
  const [budgetLinkTargetId, setBudgetLinkTargetId] = useState<string | null>(null);
  const [budgetLinkProjectId, setBudgetLinkProjectId] = useState("");
  const [itemForm, setItemForm] = useState({ descricao: "", unid: "Und", qtde: 1, vlUnit: 0, qtdeMed: 0, tipo: "Material" });
  const setItemField = React.useCallback((k, v) => setItemForm(p => ({ ...p, [k]: v })), []);
  const PAGTO_TIPOS = ["PIX", "Transferência Bancária (TED/DOC)", "Boleto", "Cartão Corporativo", "Dinheiro / Espécie"];
  const ADIANT_TIPOS = ["Combustível", "Material de Obra", "Adiantamento de Salário/Funcionário", "Alimentação / Diária", "Reembolso", "Outros"];
  const PIX_TIPOS = ["CPF", "CNPJ", "E-mail", "Telefone", "Aleatória"];
  const DESP_GERAL_TIPOS = ["Combustível", "Alimentação / Diária", "Frete / Transporte", "Estacionamento / Pedágio", "Material de Pequeno Valor", "Taxa / Cartório", "Hospedagem", "Outros"];
  const PAG_STATUS = ["Solicitado", "Aprovado", "Programado", "Pago", "Pendente de Comprovante", "Cancelado"];
  const DESP_STATUS = ["Lançada", "Validada", "Reembolsada", "Cancelada"];
  const despesaFormInit = {
    num: "", serie: "", cnpj: "", fornecedor: "", emissao: "", vencimento: "", vinculo: "",
    desc: "", valor: "", categoria: "Material", status: "Pago",
    // pagamento
    tipoFavorecido: "prestador", // "funcionario"|"prestador"
    statusPagamento: "Solicitado",
    // despesa geral
    despesaTipo: "Combustível", despesaStatusGeral: "Lançada",
    tipoPagto: "PIX", chavePix: "", banco: "", agencia: "", conta: "",
    adtTipo: "Combustível", adtOutroDesc: "", funcionario: "", data: new Date().toLocaleDateString("pt-BR"),
    justificativa: "",
    anexoOrcamento: null, anexoTC: null, anexoComprovante: null,
    emailDestinatario: "om@lsoffice.com.br",
    emailCC: "luan.silva@lsoffice.com.br; rs@lsoffice.com.br; kf@lsoffice.com.br",
  };
  const [despesaForm, setDespesaForm] = useState(despesaFormInit);
  const DF = (k, v) => setDespesaForm(p => ({ ...p, [k]: v }));
  // ── Stable field setter para projForm — evita re-render que trava inputs
  const setProjField = React.useCallback((k, v) => setProjForm(p => ({ ...p, [k]: v })), []);
  const setEtapaField = React.useCallback((k, v) => setEtapaForm(p => ({ ...p, [k]: v })), []);
  const resetEtapaForm = React.useCallback(() => {
    setEtapaForm(ETAPA_FORM_INIT);
    setEditingEtapaId(null);
  }, []);

  // ── Adiantamentos state (compat)
  const [showAdiantModal, setShowAdiantModal] = useState(false);
  const adiantFormInit = { tipo: "Combustível", funcionario: "", valor: "", justificativa: "", data: new Date().toLocaleDateString("pt-BR"), outroDesc: "" };
  const [adiantForm, setAdiantForm] = useState(adiantFormInit);

  // ── Fornecedores (persistidos no localStorage)
  const FORN_DEFAULTS = [
    { id: "ls", nome: "LS Office", cnpj: "19.853.545/0001-79", moduloTipo: "prestador", subtipo: "Equipe", tipo: "Equipe PJ", contato: "", telefone: "(98) 98523-4355", email: "implantacao@lsoffice.com.br", regiao: "Nacional", obs: "", cpf: "", banco: "", agencia: "", conta: "", chavePix: "", especialidade: "", categoriaMaterial: "" },
    { id: "clemar", nome: "Clemar", cnpj: "", moduloTipo: "prestador", subtipo: "Equipe", tipo: "Equipe PJ", contato: "", telefone: "", email: "", regiao: "", obs: "", cpf: "", banco: "", agencia: "", conta: "", chavePix: "", especialidade: "", categoriaMaterial: "" },
    { id: "zopone", nome: "Zopone", cnpj: "", moduloTipo: "prestador", subtipo: "Equipe", tipo: "Equipe PJ", contato: "", telefone: "", email: "", regiao: "", obs: "", cpf: "", banco: "", agencia: "", conta: "", chavePix: "", especialidade: "", categoriaMaterial: "" },
    { id: "metalalfa", nome: "Metalalfa", cnpj: "", moduloTipo: "prestador", subtipo: "PJ", tipo: "PJ Jurídico", contato: "", telefone: "", email: "", regiao: "", obs: "", cpf: "", banco: "", agencia: "", conta: "", chavePix: "", especialidade: "Civil", categoriaMaterial: "" },
    { id: "caw", nome: "CAW", cnpj: "", moduloTipo: "prestador", subtipo: "PJ", tipo: "PJ Jurídico", contato: "", telefone: "", email: "", regiao: "", obs: "", cpf: "", banco: "", agencia: "", conta: "", chavePix: "", especialidade: "RF", categoriaMaterial: "" },
    { id: "brasilsat", nome: "Brasilsat", cnpj: "", moduloTipo: "prestador", subtipo: "PJ", tipo: "PJ Jurídico", contato: "", telefone: "", email: "", regiao: "", obs: "", cpf: "", banco: "", agencia: "", conta: "", chavePix: "", especialidade: "RF", categoriaMaterial: "" },
  ];
  const [fornecedores, setFornecedores] = useState(() => {
    const raw = loadLS("ls_fornecedores_v2", FORN_DEFAULTS);
    // Migrar dados antigos: mapear tipo → moduloTipo+subtipo
    const ST_MAP: Record<string,string> = { "Equipe PJ": "Equipe", "PJ Jurídico": "PJ", "Prestador PF": "PF" };
    return raw.map((f: any) => f.moduloTipo ? f : {
      ...f,
      moduloTipo: "prestador",
      subtipo: ST_MAP[f.tipo] || f.subtipo || "PJ",
      categoriaMaterial: f.categoriaMaterial || "",
    });
  });
  const fornFormInit = { nome: "", cnpj: "", cpf: "", moduloTipo: "prestador", subtipo: "PJ", tipo: "PJ Jurídico", categoriaMaterial: "", contato: "", telefone: "", email: "", regiao: "", obs: "", banco: "", agencia: "", conta: "", chavePix: "", especialidade: "" };
  const [fornForm, setFornForm] = useState(fornFormInit);
  const setFornField = React.useCallback((k, v) => setFornForm(p => ({ ...p, [k]: v })), []);
  const [editForn, setEditForn] = useState(null);
  const [showFornModal, setShowFornModal] = useState(false);
  const [fornSelectOnSave, setFornSelectOnSave] = useState(false);

  // ── Funcionários (persistidos no localStorage)
  const FUNC_DEFAULTS = [
    { id: "func_admin", nome: "Administrador", cargo: "Gestor", tipo: "CLT", telefone: "", email: "", pixTipo: "CPF", pixChave: "", banco: "", agencia: "", conta: "", obs: "" },
  ];
  const [funcionarios, setFuncionarios] = useState(() => loadLS("ls_funcionarios_v2", FUNC_DEFAULTS));
  const funcFormInit = { nome: "", cargo: "", tipo: "CLT", telefone: "", email: "", pixTipo: "CPF", pixChave: "", banco: "", agencia: "", conta: "", obs: "" };
  const [funcForm, setFuncForm] = useState(funcFormInit);
  const setFuncField = React.useCallback((k, v) => setFuncForm(p => ({ ...p, [k]: v })), []);
  const [editFunc, setEditFunc] = useState(null);
  const [showFuncModal, setShowFuncModal] = useState(false);

  // ── Clientes (Sharings / Operadoras / Sharings — persistidos no localStorage)
  const CLI_DEFAULTS = [
    { id: "highline", nome: "Highline do Brasil", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "sba", nome: "SBA Torres do Brasil", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "ihs", nome: "IHS Torres", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "amt", nome: "American Tower do Brasil", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "phoenix", nome: "Phoenix Tower do Brasil", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "torrestel", nome: "Grupo TôrresTelecom", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "telxius", nome: "Telxius Torres Brasil", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "andean", nome: "Andean Tower Partners", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "aptowers", nome: "AP Towers", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "vivo", nome: "Vivo / Telefônica", cnpj: "", tipo: "Operadora", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "claro", nome: "Claro", cnpj: "", tipo: "Operadora", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "tim", nome: "TIM", cnpj: "", tipo: "Operadora", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
    { id: "oi", nome: "Oi", cnpj: "", tipo: "Operadora", contato: "", telefone: "", email: "", regiao: "Nacional", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] },
  ];
  const [clientes, setClientes] = useState(() => loadLS("ls_clientes_v2", CLI_DEFAULTS));
  const clienteFormInit = { nome: "", cnpj: "", tipo: "Sharing", contato: "", telefone: "", email: "", regiao: "", obs: "", contratoNumero: "", contratoVigencia: "", slaGarantia: 30, pos: [] };
  const [clienteForm, setClienteForm] = useState(clienteFormInit);
  const setClienteField = React.useCallback((k, v) => setClienteForm(p => ({ ...p, [k]: v })), []);
  const [editCliente, setEditCliente] = useState(null);
  const [showClienteModal, setShowClienteModal] = useState(false);

  // ── PO (Purchase Order) leitura LOCAL via pdfjs-dist (sem API, sem cloud)
  const [poLoading, setPoLoading] = useState(null);

  // ── Extrai texto de PDF em ordem de leitura (linha a linha) via pdfjs
  const extractPDFText = async (file: File): Promise<string> => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const items: any[] = content.items as any[];
      // Ordena por Y decrescente (topo→baixo) e X crescente (esq→dir)
      items.sort((a, b) => {
        const dy = Math.round(b.transform[5]) - Math.round(a.transform[5]);
        if (Math.abs(dy) > 3) return dy;
        return a.transform[4] - b.transform[4];
      });
      let curY: number | null = null;
      let curLine: string[] = [];
      for (const item of items) {
        const y = Math.round(item.transform[5]);
        if (curY === null || Math.abs(y - curY) > 3) {
          if (curLine.length) fullText += curLine.join(" ") + "\n";
          curLine = [item.str];
          curY = y;
        } else {
          curLine.push(item.str);
        }
      }
      if (curLine.length) fullText += curLine.join(" ") + "\n";
      fullText += "\n---PAGE---\n";
    }
    return fullText;
  };

  // ── Parser de NF (DANFE): extrai campos chave de qualquer NF-e brasileira
  const parseNFFromText = (raw: string) => {
    const parseBRL = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    const first = (patterns: RegExp[]) => {
      for (const p of patterns) { const m = raw.match(p); if (m) return (m[1] || "").trim(); }
      return "";
    };

    // Nº NF — formatos: "000.277.335", "000277335", "Nº 000.277.335", "NF-e Nº 000.277.335"
    const numRaw = first([
      /N[°º\s]?[:\s]*(\d[\d.]{4,})/i,
      /Nota Fiscal.*?N[°º]?\s*([\d.]+)/i,
      /\bNF[- ]?e?\b[:\s#Nº°]*\s*([\d.]{5,})/i,
    ]);
    const num = numRaw.replace(/\./g, "").replace(/^0+/, "") || numRaw;

    // Série
    const serie = first([/S[eé]rie\s*[:\-]?\s*(\w+)/i, /\bS[eé]rie\b\s*(\d+)/i]);

    // CNPJ emitente (primeiro CNPJ que aparece — é o do emitente)
    const cnpjMatch = raw.match(/\b(\d{2}[.\-]?\d{3}[.\-]?\d{3}\/\d{4}[-\u2013]\d{2})\b/);
    const cnpj = cnpjMatch ? cnpjMatch[1] : "";

    // Razão social do emitente — linha antes ou depois do CNPJ, ou header da NF
    // Estratégia: primeira linha com só letras maiúsculas/espaços e >= 5 chars
    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
    let fornecedor = "";
    // Tenta pegar nome imediatamente antes do "DANFE" ou da empresa no cabeçalho
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const l = lines[i];
      if (/DANFE|Documento Auxiliar|NF-e|NOTA FISCAL/i.test(l)) continue;
      if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇÜÑ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇÜÑ\s\d\-&.,/]+$/.test(l) && l.length >= 8 && !/^\d/.test(l) && !/CEP|CNPJ|CPF|TEL|FAX|URL|www/i.test(l)) {
        fornecedor = l; break;
      }
    }
    // Fallback: procurar "Recebemos de XXXX os produtos"
    const recebemosM = raw.match(/Recebemos de\s+(.+?)\s+os produtos/i);
    if (!fornecedor && recebemosM) fornecedor = recebemosM[1].trim();

    // Data emissão — "DD/MM/AAAA" ou "AAAA-MM-DD"
    const emissaoRaw = first([
      /Data.*?[Ee]miss[ãa]o\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /[Ee]miss[ãa]o\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /(\d{2}\/\d{2}\/\d{4})/,
    ]);
    // Formato para o campo: DD/MM/AAAA → AAAA-MM-DD para input[date], mas o form usa texto DD/MM/AAAA
    const emissao = emissaoRaw;

    // Valor total da nota
    const valorRaw = first([
      /Valor Total da Nota\s*[:\-]?\s*((?:\d{1,3}\.)*\d{1,3},\d{2})/i,
      /Valor Total[:\s]+((?:\d{1,3}\.)*\d{1,3},\d{2})/i,
      /Total[:\s]+((?:\d{1,3}\.)*\d{1,3},\d{2})/i,
    ]);
    const valor = valorRaw ? parseBRL(valorRaw) : 0;

    // Chave de acesso (44 dígitos)
    const chaveM = raw.match(/\b(\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4})\b/);
    const chaveAcesso = chaveM ? chaveM[1].replace(/\s/g, "") : "";

    return { num, serie, cnpj, fornecedor, emissao, valor, chaveAcesso };
  };

  // ── Parser de PO: funciona com Winity e outros formatos brasileiros
  const extractPOData = (rawText: string) => {
    const parseBRL = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    const firstMatch = (patterns: RegExp[], src = rawText) => {
      for (const p of patterns) { const m = src.match(p); if (m) return (m[1] || "").trim(); }
      return "";
    };
    const lines = rawText.split(/\n/).map(l => l.trim()).filter(Boolean);

    // ── Nº PO ──────────────────────────────────────────────────────────────
    // Winity: "ORDEM DE COMPRA N°: 66313 / 2026" | Highline: "N° PO: 085724"
    const nrPO = firstMatch([
      /ORDEM\s+DE\s+COMPRA\s+N[°º]?[:\s]+(\d[\d\s\/]+\d{4})/i,  // Winity
      /N[°º][:\s]*PO[:\s]+(\d+)/i,                                // Highline "N° PO: 085724"
      /PURCHASE\s+ORDER[^0-9]*([A-Z0-9][\w\-\/]{2,20})/i,
      /N[°º\.]\s*(?:DA\s+)?(?:PO|OC)[:\s#°º]*([A-Z0-9][\w\-\/]{2,20})/i,
      /\bPO[:\s#°º]+([A-Z0-9][\w\-\/]{2,20})/i,
      /PEDIDO[:\s#°º]+([0-9]{4,12})/i,
    ]).replace(/\s+/g, " ").trim();

    // ── Data de emissão ───────────────────────────────────────────────────
    // Winity: "Data de Emissão:  01/04/2026"
    const dataPO = firstMatch([
      /Data\s+de\s+Emiss[aã]o[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /EMISS[AÃ]O[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /EMITIDO\s+EM[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /(\d{2}\/\d{2}\/\d{4})/,
    ]);

    // ── CNPJs ────────────────────────────────────────────────────────────
    // Primeiro CNPJ = emitente (comprador), segundo = fornecedor
    const cnpjAll = [...rawText.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)].map(m => m[0]);
    const cnpjCliente = cnpjAll[0] || "";  // WINITY
    const cnpjFornecedor = cnpjAll[1] || "";  // LS Office

    // ── Cliente (emitente / comprador) ───────────────────────────────────
    // Winity: aparece como "WINITY S.A." na linha antes ou junto ao primeiro CNPJ
    let cliente = "";
    if (cnpjCliente) {
      const idx = rawText.indexOf(cnpjCliente);
      if (idx > 0) {
        const before = rawText.substring(Math.max(0, idx - 200), idx);
        const bLines = before.split(/\n/).map(l => l.trim()).filter(l => l.length > 3 && !/CEP|FONE|FAX|RUA|AV\.|CNPJ|IE:|^\d/.test(l));
        if (bLines.length) cliente = bLines[bLines.length - 1].substring(0, 60);
      }
    }
    if (!cliente) cliente = firstMatch([/(?:EMITENTE|COMPRADOR|CONTRATANTE)[:\s]+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\n]{3,60})/i]);

    // ── Site / Centro de Custo ────────────────────────────────────────────
    // Winity: "PERCF013" na coluna Centro de Custo (aparece separado no PDF)
    // Padrão geral telecom: 2-4 letras + 3-4 dígitos (PERCF013, SPXXX001, etc.)
    const siteMatch = rawText.match(/\b([A-Z]{2,4}[A-Z0-9]{0,2}[0-9]{3,4})\b/g) || [];
    // Filtra ruídos (CEP, etc.) e pega o mais provável (curto, padrão telecom)
    const siteId = siteMatch.find(s => s.length >= 5 && s.length <= 10 && /[A-Z]{2,}/.test(s) && /\d{3,}/.test(s)) || "";

    // ── Cidade / UF ───────────────────────────────────────────────────────
    // Winity: "BELEM - PA" no local de entrega
    const locMatch = rawText.match(/([A-ZÁÉÍÓÚ][a-záéíóúâêîôûãõç]+(?:\s+[A-Za-záéíóúâêîôûãõç]+){0,3})\s*[-–\/]\s*(SP|RJ|MG|RS|BA|PR|SC|GO|PE|CE|PA|AM|MA|ES|MT|MS|RN|PB|AL|SE|PI|RO|AC|AP|TO|DF|RR)\b/);
    const cidade = locMatch ? locMatch[1].trim() : "";
    const uf = locMatch ? locMatch[2] : firstMatch([/\b(SP|RJ|MG|RS|BA|PR|SC|GO|PE|CE|PA|AM|MA|ES|MT|MS|RN|PB|AL|SE|PI|RO|AC|AP|TO|DF|RR)\b/]);

    // ── Valor Total ───────────────────────────────────────────────────────
    // Winity: "TOTAL GERAL:  11.774,96" | Highline: "Total  3.980,00"
    let valorTotal = 0;
    for (const p of [
      /TOTAL\s+GERAL[:\s]+([\d.]+,\d{2})/i,
      /Total\s+das\s+Mercadorias[:\s]+([\d.]+,\d{2})/i,
      /VALOR\s+TOTAL\s+(?:GERAL\s+)?[:\s]+([\d.]+,\d{2})/i,
      /GRAND\s+TOTAL[:\s]+([\d.]+,\d{2})/i,
      /\bTotal\s+([\d.]+,\d{2})\s*$/im,          // Highline: "Total  3.980,00"
      /Sub-?total[\s\S]{0,60}?Total\s+([\d.]+,\d{2})/i, // Highline sub-total block
    ]) {
      const m = rawText.match(p);
      if (m) { valorTotal = parseBRL(m[1]); break; }
    }
    if (!valorTotal) {
      // fallback: maior valor BRL no documento
      const allVals = [...rawText.matchAll(/([\d]{1,3}(?:\.[\d]{3})+,\d{2})/g)].map(m => parseBRL(m[1]));
      if (allVals.length) valorTotal = Math.max(...allVals);
    }

    // ── Condição de Pagamento ─────────────────────────────────────────────
    // Winity: "PAGAMENTO EM 30 DIAS"
    const condPag = firstMatch([
      /(PAGAMENTO\s+EM\s+\d+\s+DIAS)/i,
      /Cond(?:\.|i[cç][aã]o)?\s+de\s+Pag(?:to|amento)?[:\s]+([^\n]{4,50})/i,
      /(?:PRAZO|FORMA)\s+DE\s+PAGAMENTO[:\s]+([^\n]{4,50})/i,
    ]);

    // ── Itens da tabela ───────────────────────────────────────────────────
    // Winity colunas: Item | Código Material | Descrição | Obs | Centro de Custo | Part Number | UN | Qtde | Vl.Unit | %Desc | Desc.Unit | %Ipi | Vl.Unit.Liq | %Icms | Vl.Total | Entrega | Cond.Pagto
    const itens: any[] = [];
    const unidades = /\b(UN|VB|SV|PC|M2?|KG|HR|DI|M[EÊ]S|CX|RL|MT|KIT|H\/H|HC)\b/i;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];

      // ── Highline format: "0001 UN 1,00 PABLM160 BELEM ROLLOUT 2023 1.280,00 1.280,00"
      // Item number (4 digits) directly followed by UNID (not a long material code)
      const hlItem = l.match(/^(\d{4})\s+(UN|VB|SV|PC|M2?|KG|HR|DI|M[EÊ]S|CX|RL|MT|KIT|H\/H|HC)\s+([\d,]+)\s+(\S+)\s+(.+?)\s+((?:\d{1,3}\.)*\d{1,3},\d{2})\s+((?:\d{1,3}\.)*\d{1,3},\d{2})\s*$/i);
      if (hlItem) {
        const [, num, unid, qtdeStr, site, , vlUnitStr, vlTotalStr] = hlItem;
        const qtde = parseBRL(qtdeStr);
        const vlUnit = parseBRL(vlUnitStr);
        const vlTotal = parseBRL(vlTotalStr);
        // Description is in the PREVIOUS line(s) (description column comes before Item in Highline table)
        let descricao = "";
        if (i > 0) {
          const prevLine = lines[i - 1];
          // Prev line is description if it doesn't look like another item or header
          if (!/^\d{4}\s+(UN|VB|SV)/.test(prevLine) && !/^(Descrição|Item|TOTAL|Sub)/i.test(prevLine)) {
            descricao = prevLine.replace(/\s*-?\s*R\$\s*[\d.,]+\s*$/, "").trim();
          }
        }
        itens.push({
          num: num.padStart(4, "0"),
          codMaterial: site || "",
          descricao,
          centroCusto: site || siteId,
          unid: unid.toUpperCase(),
          qtde,
          valorUnit: vlUnit,
          valorTotal: vlTotal,
          entrega: "",
          condPagto: condPag,
        });
        continue;
      }

      // ── Winity format: "1 000011189 MANUTENÇÕES CORRETIVAS - DIVERSOS - ... SV 1,00 11.774,96 ..."
      // Linha começa com número de item (1, 2, ...) seguido de código material (6-12 dígitos)
      const itemStart = l.match(/^(\d{1,3})\s+(\d{6,12})\s+(.{5,})/);
      if (!itemStart) continue;

      const num = itemStart[1];
      const codMaterial = itemStart[2];
      let resto = itemStart[3];

      // A descrição pode continuar na linha seguinte (PDF quebra células)
      // Acumula linhas até achar a unidade
      let j = i;
      let descAccum = resto;
      while (!unidades.test(descAccum) && j < i + 3 && j + 1 < lines.length) {
        j++;
        descAccum += " " + lines[j];
      }

      const unidMatch = descAccum.match(unidades);
      if (!unidMatch) continue;
      const unid = unidMatch[1].toUpperCase();
      const unidIdx = descAccum.search(unidades);
      const descricao = descAccum.substring(0, unidIdx).replace(/\s+/g, " ").trim();
      const afterUnid = descAccum.substring(unidIdx + unid.length).trim();

      // afterUnid: "1,00  11.774,96  0,00%  0,00  0,00%  11.774,96  0,00%  11.774,96  01/05/2026  PAGAMENTO EM 30 DIAS"
      const nums = [...afterUnid.matchAll(/((?:\d{1,3}\.)*\d{1,3},\d{2})/g)].map(m => parseBRL(m[0]));
      const qtde = nums[0] || 1;
      const vlUnit = nums[1] || 0;
      // Vl.Total é o último valor numérico antes da data de entrega
      const vlTotal = nums.find((n, idx) => idx >= 2 && n > 0) || vlUnit * qtde;

      // Centro de custo (pode estar na próxima linha no PDF Winity)
      let centroCusto = siteId;
      if (j + 1 < lines.length) {
        const nextLine = lines[j + 1];
        const ccMatch = nextLine.match(/^([A-Z]{2,4}[A-Z0-9]{0,2}[0-9]{3,4})$/);
        if (ccMatch) centroCusto = ccMatch[1];
      }

      // Data de entrega
      const entregaMatch = afterUnid.match(/(\d{2}\/\d{2}\/\d{4})/);
      const entrega = entregaMatch ? entregaMatch[1] : "";

      // Cond pagto por item
      const condItemMatch = afterUnid.match(/(PAGAMENTO\s+EM\s+\d+\s+DIAS|[\d]+\s+DIAS?)/i);
      const condItem = condItemMatch ? condItemMatch[1] : "";

      itens.push({
        num: num.padStart(4, "0"),
        codMaterial,
        descricao,
        centroCusto,
        unid,
        qtde,
        valorUnit: vlUnit,
        valorTotal: vlTotal,
        entrega,
        condPagto: condItem || condPag,
      });

      i = j; // avança o loop
    }

    // Fallback: se não achou nenhum item, tenta padrão simples
    if (itens.length === 0) {
      lines.forEach((l, idx) => {
        const vals = [...l.matchAll(/((?:\d{1,3}\.)*\d{1,3},\d{2})/g)].map(m => parseBRL(m[0]));
        const um = l.match(unidades);
        if (vals.length >= 2 && um) {
          const desc = l.substring(0, l.search(unidades)).replace(/^\d+\s+\d+\s+/, "").trim();
          itens.push({
            num: String(itens.length + 1).padStart(4, "0"),
            codMaterial: "",
            descricao: desc || l.substring(0, 50),
            centroCusto: siteId,
            unid: um[1].toUpperCase(),
            qtde: vals[0] || 1,
            valorUnit: vals[1] || 0,
            valorTotal: vals[vals.length - 1] || 0,
            entrega: "",
            condPagto: condPag,
          });
        }
      });
    }

    return { nrPO, dataPO, cliente, cnpjCliente, cnpjFornecedor, siteId, cidade, uf, valorTotal, condicaoPagamento: condPag, itens };
  };

  const parsePO = async (projId, file) => {
    setPoLoading(projId);
    try {
      const fullText = await extractPDFText(file);
      const po = extractPOData(fullText);
      setProjetos(prev => prev.map(p => p.id === projId ? {
        ...p,
        po: { ...po, arquivo: { name: file.name } },
        siteIdSharing: p.siteIdSharing || po.siteId || "",
        municipio: p.municipio || po.cidade || p.municipio,
        uf: p.uf || po.uf || p.uf,
        budgetAprovado: p.orcamentoVinculadoId ? p.budgetAprovado : (po.valorTotal || p.budgetAprovado),
        itensPO: po.itens || [],
      } : p));
    } catch (e) {
      console.error("Erro ao ler PO:", e);
      alert("Erro ao ler o PDF. Verifique se o arquivo não está protegido por senha.");
    }
    setPoLoading(null);
  };


  const [sideControleOpen, setSideControleOpen] = useState(false);

  // ── Área de orçamento ativa: "implantacao" | "operacao"
  const [orcArea, setOrcArea] = useState("implantacao");

  // ── Itens separados por área
  const [orcItemsImpl, setOrcItemsImpl] = useState(() => loadLS("ls_orcImpl", []));
  const [orcItemsOp, setOrcItemsOp] = useState(() => loadLS("ls_orcOp", []));

  // ── Auto-save to localStorage (após todos os estados declarados)
  React.useEffect(() => {
    try {
      localStorage.setItem("ls_projetos", JSON.stringify(projetos));
      localStorage.setItem("ls_historico", JSON.stringify(historico));
      localStorage.setItem("ls_orcImpl", JSON.stringify(orcItemsImpl));
      localStorage.setItem("ls_orcOp", JSON.stringify(orcItemsOp));
      localStorage.setItem("ls_discount", JSON.stringify(discount));
      localStorage.setItem("ls_bdi", JSON.stringify(bdi));
      localStorage.setItem("ls_lucro", JSON.stringify(lucro));
      localStorage.setItem("ls_siteInfo", JSON.stringify(siteInfo));
      localStorage.setItem("ls_fornecedores_v2", JSON.stringify(fornecedores));
      localStorage.setItem("ls_funcionarios_v2", JSON.stringify(funcionarios));
      localStorage.setItem("ls_clientes_v2", JSON.stringify(clientes));
    } catch (e) { console.warn("localStorage save error:", e); }
  }, [projetos, historico, orcItemsImpl, orcItemsOp, discount, bdi, lucro, siteInfo, fornecedores, funcionarios, clientes]);



  // ── Backup helpers
  const exportarBackup = () => {
    const backup = {
      versao: "1.0", data: new Date().toISOString(),
      projetos, historico, orcItemsImpl, orcItemsOp,
      discount, bdi, lucro, siteInfo, fornecedores, funcionarios, clientes,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    a.download = `LS_ERP_Backup_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.json`;
    a.click();
  };
  const importarBackup = (file) => {
    const r = new FileReader();
    r.onload = e => {
      try {
        const d = JSON.parse(e.target.result);
        if (d.projetos) {
          const importedProjects = Array.isArray(d.projetos) ? d.projetos : [];
          setProjetos(importedProjects.map(normalizeProjetoFinanceiro));
        }
        if (d.historico) setHistorico((d.historico || []).map(normalizeHistoricBudgetEntry));
        if (d.orcItemsImpl) setOrcItemsImpl(d.orcItemsImpl);
        if (d.orcItemsOp) setOrcItemsOp(d.orcItemsOp);
        if (d.discount != null) setDiscount(d.discount);
        if (d.bdi != null) setBdi(d.bdi);
        if (d.lucro != null) setLucro(d.lucro);
        if (d.siteInfo) setSiteInfo(d.siteInfo);
        if (d.fornecedores) setFornecedores(d.fornecedores);
        if (d.funcionarios) setFuncionarios(d.funcionarios);
        if (d.clientes) setClientes(d.clientes);
        alert("✅ Backup restaurado com sucesso!");
      } catch { alert("❌ Arquivo inválido."); }
    };
    r.readAsText(file);
  };

  // Alias para a área ativa
  const orcItems = orcArea === "implantacao" ? orcItemsImpl : orcItemsOp;
  const setOrcItems = orcArea === "implantacao" ? setOrcItemsImpl : setOrcItemsOp;
  const activeDB = orcArea === "implantacao" ? DB : DB_OP;
  const activeCats = orcArea === "implantacao" ? CATEGORIAS : CATEGORIAS_OP;

  // ── Computed
  const activeArea = AREAS.find(a => a.id === currentArea);
  const obra = projetos.find(p => p.id === projetoSel);

  const filteredDB = useMemo(() => activeDB.filter(item => {
    const mCat = catFilter === "TODOS" || item.resumo === catFilter;
    const q = searchTerm.toLowerCase();
    return mCat && (!q || item.cod.toLowerCase().includes(q) || item.resumo.toLowerCase().includes(q) || item.solucao.toLowerCase().includes(q) || (item.config || "").toLowerCase().includes(q));
  }), [searchTerm, catFilter, activeDB]);

  const currentBudgetTotals = useMemo(
    () => calcLegacyBudgetTotals({ itens: orcItems, discount, bdi, lucro }),
    [orcItems, discount, bdi, lucro]
  );
  const totalCustom = currentBudgetTotals.totalBruto;
  const totalDesconto = currentBudgetTotals.totalDesconto;
  const totalLiquido = currentBudgetTotals.totalLiquido;
  const totalBdiValor = currentBudgetTotals.totalBdi;
  const totalLucroValor = currentBudgetTotals.totalLucro;
  const totalFinal = currentBudgetTotals.totalFinal;
  const totalMercado = useMemo(() => orcItems.reduce((s, i) => s + (i.vl_medio || 0) * i.qtde, 0), [orcItems]);

  const calcItemFinance = (item) => calcLegacyBudgetItemTotals(item, { discount, bdi, lucro });
  const calcItemFinal = (item) => calcItemFinance(item).totalFinal;

  const calcProjBase = (p) => p.itens.reduce((s, i) => s + i.vlUnit * i.qtde, 0);
  const calcProjTotal = (p) => calcProjBase(p) * (1 + (p.bdi || 0) / 100) * (1 + (p.lucro || 0) / 100);
  const calcProjMed = (p) => p.itens.reduce((s, i) => s + i.vlUnit * (i.qtdeMed || 0), 0);
  const isNFPago = (status) => NF_PAGO_STATUS.has(String(status || "").trim());
  const isNFAtrasada = (status) => NF_ATRASO_STATUS.has(String(status || "").trim());
  const isPagamentoServicoPago = (status) => PAGAMENTO_PAGO_STATUS.has(String(status || "").trim());
  const isDespesaConfirmada = (status) => DESPESA_CONFIRMADA_STATUS.has(String(status || "").trim());
  const getBudgetTotalFromRecord = (orc) => {
    if (!orc) return 0;
    if (isLegacyBudget(orc)) {
      // Sempre recalcula do zero a partir dos itens. Retorna totalLiquido (sem BDI/Lucro)
      const legacyBudget = hydrateLegacyBudget(orc);
      return legacyBudget.totalLiquido > 0 ? legacyBudget.totalLiquido : (legacyBudget.totalFinal || 0);
    }
    // V2: sempre recalcula dos blocos (nunca usa totalGeral em cache que pode estar desatualizado)
    if (orc.blocos) return calcBudgetTotals(orc).totalGeral || 0;
    return 0;
  };
  const getLinkedBudgetForProject = (project, budgetList = historico) => {
    if (!project) return null;
    const directMatch = project.orcamentoVinculadoId
      ? budgetList.find(o => o.id === project.orcamentoVinculadoId)
      : null;
    if (directMatch) return directMatch;
    return budgetList.find((o: any) => o.projetoId === project.id) || null;
  };
  const calcNFTotal = (p) => roundCurrency((p.nfs || []).reduce((s, n) => s + (Number(n.valor) || 0), 0));
  const calcNFPago = (p) => roundCurrency((p.nfs || []).filter(n => isNFPago(n.status)).reduce((s, n) => s + (Number(n.valor) || 0), 0));
  const calcPagamentosServicoTotal = (p) => roundCurrency((p.adiantamentos || []).reduce((s, a) => s + (Number(a.valor) || 0), 0));
  const calcPagamentosServicoPago = (p) => roundCurrency((p.adiantamentos || []).filter(a => isPagamentoServicoPago(a.status)).reduce((s, a) => s + (Number(a.valor) || 0), 0));
  const calcDespesasGeraisTotal = (p) => roundCurrency((p.despesasGerais || []).reduce((s, d) => s + (Number(d.valor) || 0), 0));
  const calcDespesasGeraisConfirmadas = (p) => roundCurrency((p.despesasGerais || []).filter(d => isDespesaConfirmada(d.status)).reduce((s, d) => s + (Number(d.valor) || 0), 0));

  // Budget efetivo: prioriza orçamento vinculado, depois budgetAprovado manual, depois itens
  const calcBudgetEfetivo = (p) => {
    const orc = getLinkedBudgetForProject(p);
    if (orc) return roundCurrency(getBudgetTotalFromRecord(orc));
    return roundCurrency(p.budgetAprovado || calcProjBase(p));
  };

  const calcCustoPagoEfetivo = (p) => roundCurrency(
    calcNFPago(p) +
    calcPagamentosServicoPago(p) +
    calcDespesasGeraisConfirmadas(p)
  );
  const calcSaldoProjeto = (p) => roundCurrency(calcBudgetEfetivo(p) - calcCustoPagoEfetivo(p));
  const calcAvancoFisicoFallback = (obra: any) => {
    if (parseProjectDate(obra?.dataFimAtividade) || obra?.status === "Concluído") return 100;
    if (parseProjectDate(obra?.dataInicioAtividade) && !["Prospectando", "Planejado", "Cancelado"].includes(obra?.status)) return 50;
    return 0;
  };

  // All NFs across all projects for dashboard
  const todasNFs = useMemo(() => projetos.flatMap(p => (p.nfs || []).map(n => ({ ...n, siteId: p.siteIdSharing || "", projId: p.id }))), [projetos]);
  const nfsAtraso = todasNFs.filter(n => isNFAtrasada(n.status));

  // ── LPU actions
  const addItem = (item) => setOrcItems(prev => {
    const ex = prev.find(i => i.cod === item.cod);
    if (ex) return prev.map(i => i.cod === item.cod ? { ...i, qtde: i.qtde + 1 } : i);
    return [...prev, { ...item, qtde: 1, vl_custom: item.vl_medio || 0 }];
  });
  const removeItem = (cod) => setOrcItems(prev => prev.filter(i => i.cod !== cod));
  const updateQtde = (cod, v) => { const q = Math.max(0, Number(v)); if (q === 0) removeItem(cod); else setOrcItems(prev => prev.map(i => i.cod === cod ? { ...i, qtde: q } : i)); };
  const updateVl = (cod, v) => setOrcItems(prev => prev.map(i => i.cod === cod ? { ...i, vl_custom: Number(v) || 0 } : i));
  const updateParam = (cod, f, v) => setOrcItems(prev => prev.map(i => i.cod === cod ? { ...i, [f]: v === "" ? undefined : Number(v) } : i));

  const [salvoMsg, setSalvoMsg] = React.useState("");
  const [orcSel, setOrcSel] = React.useState(null); // orçamento aberto no detalhe

  // ── Limpa orcSel se orçamento foi deletado
  React.useEffect(() => {
    if (orcSel && !historico.find(o => o.id === orcSel)) {
      setOrcSel(null);
    }
  }, [orcSel, historico]);
  const [orcFiltroStatus, setOrcFiltroStatus] = React.useState("Todos");
  const [orcEditMsg, setOrcEditMsg] = React.useState("");
  const [dashMes, setDashMes] = React.useState(() => {
    const n = new Date(); return `${String(n.getMonth()+1).padStart(2,'0')}/${n.getFullYear()}`;
  });
  const [orcPOLoading, setOrcPOLoading] = React.useState<string | null>(null);

  // ── Importar PO diretamente em um orçamento salvo (local, sem cloud)
  const importPOToOrc = async (orcId: string, file: File) => {
    setOrcPOLoading(orcId);
    try {
      const fullText = await extractPDFText(file);
      const po = extractPOData(fullText);
      const fmtVal = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const confirm = window.confirm(
        `PO lida com sucesso!\n\n` +
        `Nº PO: ${po.nrPO || "—"}\n` +
        `Data: ${po.dataPO || "—"}\n` +
        `Cliente: ${po.cliente || "—"}\n` +
        `Valor Total: ${fmtVal(po.valorTotal)}\n` +
        `Itens: ${po.itens.length}\n\n` +
        `Deseja vincular esta PO ao orçamento e marcar como Aprovado?`
      );
      if (!confirm) { setOrcPOLoading(null); return; }

      setHistorico(prev => prev.map((o: any) => o.id === orcId ? {
        ...o,
        status: "Aprovado",
        poVinculada: { ...po, arquivo: file.name, importadoEm: new Date().toLocaleDateString("pt-BR") },
        obs: [o.obs, `PO ${po.nrPO || file.name} · ${fmtVal(po.valorTotal)} · importada em ${new Date().toLocaleDateString("pt-BR")}`].filter(Boolean).join("\n"),
      } : o));

      // Sincronizar também com o projeto vinculado (se houver)
      const orc = historico.find((o: any) => o.id === orcId) as any;
      if (orc?.projetoId) {
        setProjetos(prev => prev.map(p => p.id === orc.projetoId ? {
          ...p,
          po: { ...po, arquivo: { name: file.name } },
          budgetAprovado: p.orcamentoVinculadoId ? p.budgetAprovado : (po.valorTotal || p.budgetAprovado),
          itensPO: po.itens || [],
        } : p));
      }
    } catch (e) {
      console.error("Erro ao importar PO no orçamento:", e);
      alert("Erro ao ler o PDF. Verifique se o arquivo não está protegido por senha.");
    }
    setOrcPOLoading(null);
  };

  const salvarOrc = (orcExistente) => {
    // Se for atualização de um orçamento já existente
    if (orcExistente) {
      const normalized = hydrateLegacyBudget(orcExistente);
      setHistorico(prev => prev.map(o => o.id === orcExistente.id ? normalized : o));
      setSalvoMsg("✅ Orçamento atualizado!");
      setTimeout(() => setSalvoMsg(""), 3000);
      return;
    }
    if (!orcItems.length) {
      setSalvoMsg("⚠️ Adicione itens antes de salvar.");
      setTimeout(() => setSalvoMsg(""), 3000);
      return;
    }
    const areaLabel = orcArea === "implantacao" ? "Implantação" : "Operação";
    const o = hydrateLegacyBudget({
      id: `ORC-${Date.now()}`,
      data: new Date().toLocaleDateString("pt-BR"),
      area: areaLabel,
      status: "Rascunho", // Rascunho | Validado | Enviado | Aprovado | Rejeitado
      siteInfo: { ...siteInfo },
      itens: [...orcItems],
      discount, bdi, lucro,
      totalCustom: totalCustom,
      totalFinal,
      fornecedor: "LS Office",
      obs: "",
    });
    setHistorico(prev => [o, ...prev]);
    setSalvoMsg(`✅ Orçamento ${o.id} salvo! Veja em "Orçamentos Salvos".`);
    setTimeout(() => setSalvoMsg(""), 5000);
  };

  // Converte orçamento aprovado em projeto de obra
  const aprovarOrcamento = (orc) => {
    const newId = `proj_${Date.now()}`;
    const si = orc.siteInfo || {};
    const tp = si.tipoProjeto || "adequacao_infra";
    
    setProjetos(prev => [...prev, {
      id: newId,
      siteIdSharing: si.siteIdSharing || si.siteId || orc.id,
      siteIdOperadora: si.siteIdOperadora || "",
      sharing: si.sharingNome || "Highline",
      operadora: si.operadora || "Vivo",
      municipio: si.municipio || "",
      uf: si.uf || "",
      endereco: si.endereco || "",
      descricao: si.objeto || `Obra originada do Orçamento ${orc.id}`,
      fornecedor: orc.fornecedor || "LS Office",
      contato: "",
      dataOrcamento: orc.data,
      dataInicioAtividade: orc.data || new Date().toLocaleDateString("pt-BR"),
      dataFimAtividade: "",
      proposta: orc.id,
      status: "Planejado",
      bdi: orc.bdi || 0,
      lucro: orc.lucro || 0,
      budgetAprovado: getSavedBudgetTotal(orc),
      notas: `Orçamento aprovado em ${new Date().toLocaleDateString("pt-BR")}.`,
      segmento: si.categoriaProjeto || "Implantação",
      categoriaProjeto: si.categoriaProjeto || "implantacao",
      tipoProjeto: tp,
      itens: [], nfs: [], adiantamentos: [],
      etapas: makeEtapasPorTipo(tp),
      avancoFisico: 0,
      orcamentoOrigem: orc.id,
      orcamentoVinculadoId: orc.id,
    }]);
    // Marca orçamento como aprovado
    setHistorico(prev => prev.map(o => o.id === orc.id ? { ...o, status: "Aprovado", projetoId: newId } : o));
    setOrcSel(null);
    setProjetoSel(newId);
    setObraTab("resumo");
    setTab("controle");
  };

  // ── Despesas unificadas (NF Material + Pagamento Serviço + Despesa Geral)
  const addDespesa = async () => {
    const isNF = nfModalTipo === "nf";
    const isPag = nfModalTipo === "pagamento";
    const isDesp = nfModalTipo === "despesa";
    if (isNF && (!despesaForm.num || !despesaForm.fornecedor || !despesaForm.valor)) return;
    if (isPag) {
      if (!despesaForm.funcionario || !despesaForm.valor || !despesaForm.data || !despesaForm.adtTipo) {
        window.alert("Preencha prestador/funcionário, data do pagamento, tipo de serviço/motivo e valor total.");
        return;
      }
      if (despesaForm.adtTipo === "Outros" && !String(despesaForm.adtOutroDesc || "").trim()) {
        window.alert("Descreva o tipo de serviço/motivo quando selecionar 'Outros'.");
        return;
      }
    }
    if (isDesp && (!despesaForm.desc || !despesaForm.valor)) return;

    const obraRef = projetos.find(p => p.id === projetoSel);
    const pagtoInfo = despesaForm.tipoPagto === "PIX"
      ? `PIX: ${despesaForm.chavePix || "—"}`
      : despesaForm.tipoPagto === "Transferência Bancária (TED/DOC)"
        ? `TED/DOC — Banco: ${despesaForm.banco || "—"} / Ag: ${despesaForm.agencia || "—"} / CC: ${despesaForm.conta || "—"}`
        : despesaForm.tipoPagto;

    const anexoComprovanteValido = isComprovanteValido(despesaForm.anexoComprovante) ? despesaForm.anexoComprovante : null;
    const anexoTCValido = isComprovanteValido(despesaForm.anexoTC) ? despesaForm.anexoTC : null;
    const comprovanteValido = isComprovanteValido(despesaForm.comprovante) ? despesaForm.comprovante : null;
    const comprovanteSelecionado = anexoComprovanteValido || anexoTCValido || comprovanteValido;
    const despesa = normalizeLancamentoComprovante({
      ...despesaForm,
      id: editingDespesaId || `${nfModalTipo}_${Date.now()}`,
      valor: Number(despesaForm.valor),
      status: isNF ? normalizeNFStatus(despesaForm.status) : isPag ? (despesaForm.statusPagamento || "Solicitado") : (despesaForm.despesaStatusGeral || "Lançada"),
      _tipo: nfModalTipo,
      _pagtoInfo: pagtoInfo,
      comprovante: comprovanteSelecionado || null,
      anexoComprovante: anexoComprovanteValido || comprovanteSelecionado || null,
      anexoTC: anexoTCValido || comprovanteSelecionado || null,
    });

    // Salvar na lista correta (update se editando, append se novo)
    if (isNF) {
      setProjetos(prev => prev.map(p => p.id === projetoSel ? {
        ...p,
        nfs: editingDespesaId
          ? (p.nfs || []).map(n => n.id === editingDespesaId ? despesa : n)
          : [...(p.nfs || []), despesa]
      } : p));
    } else if (isPag) {
      setProjetos(prev => prev.map(p => p.id === projetoSel ? {
        ...p,
        adiantamentos: editingDespesaId
          ? (p.adiantamentos || []).map(a => a.id === editingDespesaId ? despesa : a)
          : [...(p.adiantamentos || []), despesa]
      } : p));
    } else {
      setProjetos(prev => prev.map(p => p.id === projetoSel ? {
        ...p,
        despesasGerais: editingDespesaId
          ? (p.despesasGerais || []).map(d => d.id === editingDespesaId ? despesa : d)
          : [...(p.despesasGerais || []), despesa]
      } : p));
    }

    // ── Geração de e-mail como arquivo .msg com HTML colorido e anexos reais
    const fmtV = (v) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    const site = obraRef?.siteIdSharing || "";
    const loc = `${obraRef?.municipio || ""}/${obraRef?.uf || ""}`;
    const RED = "#dc2626"; const LABEL = "#111827";

    const row = (label: string, value: string) =>
      `<p style="margin:4px 0">• <strong style="color:${LABEL}">${label}:</strong> <span style="color:${RED}">${value}</span></p>`;

    let htmlBody = "";
    if (isNF) {
      htmlBody = `
<p style="margin:0 0 8px 0">Odi,</p>
<p style="margin:0 0 16px 0">&nbsp;&nbsp;&nbsp;&nbsp;Segue Programação de Pagamento.</p>
<p style="margin:0 0 12px 0"><strong>Lançamento de NF de Material:</strong></p>
${row("Obra", `${site} (${loc})`)}
${row("NF Nº", `${despesaForm.num}${despesaForm.serie ? ` / Série: ${despesaForm.serie}` : ""}`)}
${row("Fornecedor", despesaForm.fornecedor || "—")}
${row("CNPJ", despesaForm.cnpj || "—")}
${row("Categoria", despesaForm.categoria || "—")}
${row("Descrição", despesaForm.desc || "—")}
${row("Valor", fmtV(despesaForm.valor))}
${row("Emissão", `${despesaForm.emissao || "—"} / Vencimento: ${despesaForm.vencimento || "—"}`)}
${row("Forma Pgto", pagtoInfo)}`;
    } else if (isPag) {
      htmlBody = `
<p style="margin:0 0 8px 0">Odi,</p>
<p style="margin:0 0 16px 0">&nbsp;&nbsp;&nbsp;&nbsp;Segue Solicitação de Pagamento de Serviço.</p>
<p style="margin:0 0 12px 0"><strong>Pagamento de Serviço:</strong></p>
${row("Obra", `${site} (${loc})`)}
${row("Favorecido", `${despesaForm.funcionario || "—"} (${despesaForm.tipoFavorecido || "—"})`)}
${row("Serviço", despesaForm.adtTipo === "Outros" ? (despesaForm.adtOutroDesc || "—") : (despesaForm.adtTipo || "—"))}
${row("Descrição", despesaForm.justificativa || "—")}
${row("Valor", fmtV(despesaForm.valor))}
${row("Data", despesaForm.data || "—")}
${row("Forma Pgto", pagtoInfo)}`;
    } else {
      htmlBody = `
<p style="margin:0 0 8px 0">Odi,</p>
<p style="margin:0 0 16px 0">&nbsp;&nbsp;&nbsp;&nbsp;Segue Lançamento de Despesa.</p>
<p style="margin:0 0 12px 0"><strong>Despesa Geral:</strong></p>
${row("Obra", `${site} (${loc})`)}
${row("Tipo", despesaForm.despesaTipo || "—")}
${row("Descrição", despesaForm.desc || "—")}
${row("Valor", fmtV(despesaForm.valor))}
${row("Data", despesaForm.data || "—")}
${row("Forma Pgto", pagtoInfo)}`;
    }

    const anexosArr = [despesaForm.anexoOrcamento, despesaForm.anexoTC].filter(Boolean);
    if (anexosArr.length > 0) {
      htmlBody += `<br><p style="margin:8px 0 4px 0"><strong>Anexos:</strong></p>`;
      anexosArr.forEach(a => { htmlBody += `<p style="margin:2px 0">• ${a.name}</p>`; });
    }
    htmlBody += `<br><p style="margin:8px 0 0 0">Atenciosamente,<br><strong>LS Office ERP</strong></p>`;

    const fullHtml = `<!DOCTYPE html><html><body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#111">${htmlBody}</body></html>`;

    const subject = isNF
      ? `[PROGRAMAÇÃO DE PAGAMENTO] - NF Material - ${site} — ${despesaForm.fornecedor} — ${fmtV(despesaForm.valor)}`
      : isPag
      ? `[PROGRAMAÇÃO DE PAGAMENTO] - Pagamento Serviço - ${site} — ${despesaForm.funcionario} — ${fmtV(despesaForm.valor)}`
      : `[PROGRAMAÇÃO DE PAGAMENTO] - Despesa - ${site} — ${despesaForm.despesaTipo} — ${fmtV(despesaForm.valor)}`;

    const toLine = despesaForm.emailDestinatario || "om@lsoffice.com.br";
    const ccLine = (despesaForm as any).emailCC || "";
    const plainText = htmlBody
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const msgFileName = `email_${site || "obra"}_${Date.now()}.msg`;

    try {
      const response = await fetch("/api/generate-msg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          bodyHtml: fullHtml,
          bodyText: plainText,
          to: toLine,
          cc: ccLine,
          fileName: msgFileName,
          attachments: anexosArr
            .filter(att => att?.name && att?.data)
            .map(att => ({
              name: att.name,
              base64: String(att.data).includes(",") ? String(att.data).split(",")[1] : String(att.data)
            }))
        })
      });

      if (!response.ok) {
        throw new Error(await response.text().catch(() => "Falha ao gerar arquivo .msg"));
      }

      const msgBlob = await response.blob();
      const msgUrl = URL.createObjectURL(msgBlob);
      const msgLink = document.createElement("a");
      msgLink.href = msgUrl;
      msgLink.download = msgFileName;
      msgLink.click();
      setTimeout(() => URL.revokeObjectURL(msgUrl), 5000);
    } catch (error) {
      console.error("Erro ao gerar .msg:", error);
      window.alert("O lançamento foi salvo, mas não foi possível gerar o arquivo .msg.");
    } finally {
      setShowNFModal(false);
      setDespesaForm(despesaFormInit);
      setEditingDespesaId(null);
    }
  };

  const openEditDespesa = (entry: any, tipo: "nf" | "pagamento" | "despesa") => {
    const comprovanteAtual = getComprovanteArquivo(entry);
    const anexoComprovanteAtual = isComprovanteValido(entry.anexoComprovante) ? entry.anexoComprovante : comprovanteAtual;
    const anexoTCAtual = isComprovanteValido(entry.anexoTC) ? entry.anexoTC : comprovanteAtual;
    setEditingDespesaId(entry.id);
    setNfModalTipo(tipo);
    setDespesaForm({
      ...despesaFormInit,
      ...entry,
      comprovante: comprovanteAtual,
      anexoComprovante: anexoComprovanteAtual || null,
      anexoTC: anexoTCAtual || null,
      status: tipo === "nf" ? normalizeNFStatus(entry.status) : (entry.status || "Pago"),
      // normalize fields that may differ
      statusPagamento: entry.statusPagamento || entry.status || "Solicitado",
      despesaStatusGeral: entry.despesaStatusGeral || entry.status || "Lançada",
    });
    setShowNFModal(true);
  };

  const pagarNF = (projId, nfId) => setProjetos(prev => prev.map(p => p.id === projId ? { ...p, nfs: (p.nfs || []).map(n => n.id === nfId ? { ...n, status: "Pago" } : n) } : p));
  const anexarComprovanteNF = (projId, nfId, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const comprovante = { name: file.name, data: e.target.result };
      setProjetos(prev => prev.map(p => p.id === projId ? {
        ...p,
        nfs: (p.nfs || []).map(n => n.id === nfId ? { ...n, status: "Pago", comprovante, anexoComprovante: comprovante, anexoTC: comprovante } : n)
      } : p));
    };
    reader.readAsDataURL(file);
  };
  const addNF = addDespesa; // alias de compat

  const addAdiantamento = () => { }; // substituído por addDespesa
  const aprovarAdiantamento = (projId, adtId) => setProjetos(prev => prev.map(p => p.id === projId ? { ...p, adiantamentos: (p.adiantamentos || []).map(a => a.id === adtId ? { ...a, status: "Aprovado" } : a) } : p));
  const pagarAdiantamento = (projId, adtId) => setProjetos(prev => prev.map(p => p.id === projId ? { ...p, adiantamentos: (p.adiantamentos || []).map(a => a.id === adtId ? { ...a, status: "Pago" } : a) } : p));
  const deletarAdiantamento = (projId, adtId) => setProjetos(prev => prev.map(p => p.id === projId ? { ...p, adiantamentos: (p.adiantamentos || []).filter(a => a.id !== adtId) } : p));
  const updateAvancoFisico = (projId, val) => updateProjectRecord(projId, project => ({
    ...project,
    avancoFisico: Math.max(0, Math.min(100, Number(val) || 0)),
    avancoFisicoManual: true
  }));

  // Calcula avanço físico ponderado pelas etapas (quando não manual)
  const calcAvancoFisicoEtapas = (etapas: any[]) => {
    if (!etapas || etapas.length === 0) return 0;
    const totalPeso = etapas.reduce((s, e) => s + (e.peso || 1), 0);
    const realizado = etapas.reduce((s, e) => s + (e.progresso || 0) * (e.peso || 1) / 100, 0);
    return Math.round((realizado / totalPeso) * 100);
  };

  // Retorna o avanço efetivo (calculado pelas etapas, ou manual se sobrescrito)
  const getAvancoEfetivo = (obra: any) => {
    if (obra.avancoFisicoManual) return Math.max(0, Math.min(100, Number(obra.avancoFisico) || 0));
    const fromEtapas = calcAvancoFisicoEtapas(obra.etapas || []);
    return fromEtapas > 0 ? fromEtapas : calcAvancoFisicoFallback(obra);
  };
  const updateMedicao = (projId, itemId, val) => setProjetos(prev => prev.map(p => p.id === projId ? { ...p, itens: p.itens.map(i => i.id === itemId ? { ...i, qtdeMed: Math.min(Number(val), i.qtde) } : i) } : p));

  // ── Styles
  const S = {
    card: { background: T.bg2, borderRadius: 12, border: `1px solid ${T.brSub}`, padding: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" },
    input: { padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.brBase}`, background: T.bg3, color: T.txPri, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" },
    label: { fontSize: 11, color: T.txSec, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 },
    btn: { background: `linear-gradient(135deg, ${T.blueD}, ${T.blue})`, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 700, fontSize: 14, boxShadow: `0 2px 10px ${T.blue}35`, transition: "all 0.15s" },
    ghost: { background: "transparent", border: `1px solid ${T.brBase}`, color: T.txSec, borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 14, transition: "all 0.15s" },
  };

  const cardTint = (c: string) => ({
    background: `linear-gradient(135deg, ${c}10, ${T.bg2} 100%)`,
    border: `1px solid ${c}25`,
    boxShadow: `0 8px 24px ${c}08, 0 2px 8px rgba(15,23,42,0.04)`,
  });

  const iconBox = (c: string, active = false) => ({
    width: 28,
    height: 28,
    borderRadius: 8,
    background: active ? `${c}15` : T.bg1,
    border: `1px solid ${active ? `${c}40` : T.brBase}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: active ? c : T.txSec,
    transition: "all 0.2s",
  });

  // Badge de status premium: pill shape + dot indicator
  const StatusBadge = ({ status, color = null }) => {
    const c = color || ST_COLOR[status] || T.txMut;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c + "12", color: c, border: `1px solid ${c}25`, padding: "4px 12px 4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.02em" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0, boxShadow: `0 0 8px ${c}40` }} />
        {status}
      </span>
    );
  };

  // Header de seção premium: accent bar lateral + título + subtítulo
  const SectionHeader = ({ icon, title, subtitle, color = T.blue, action = null }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 3, height: 36, borderRadius: 2, background: `linear-gradient(180deg, ${color}, ${color}60)`, flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: T.txPri, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8 }}>
            <span>{icon}</span> {title}
          </div>
          {subtitle && <div style={{ fontSize: 12, color: T.txSec, marginTop: 4 }}>{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  );

  const ProgBar = ({ v, max, color, h = 8 }) => {
    const fill = color || T.gradBlue;
    const shadowColor = typeof fill === "string" && fill.startsWith("linear-gradient") ? T.blue : (fill || T.blue);
    return (
      <div style={{ height: h, borderRadius: h, background: T.bg4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, max > 0 ? (v / max) * 100 : 0)}%`, background: fill, borderRadius: h, transition: "width 0.5s ease", boxShadow: `0 0 10px ${shadowColor}30` }} />
      </div>
    );
  };

  const TAB_LABELS = {
    dashboard: "Dashboard Financeiro",
    orcv2: "Orçamento",
    orcamento: "Orçamento (LPU)",
    historico: "Orçamentos Salvos",
    projetos: "Projetos",
    controle: "Controle de Obras",
    fornecedores: "Fornecedores",
    funcionarios: "Funcionários",
    relatorios: "Relatórios",
    faturamento: "Faturamento",
    clientes: "Clientes",
    secretaria: "Secretária",
    resumo: "Resumo",
    pvhighline: "PV Highline",
    tabela: "Tabela",
    faturas: "Faturas",
  };

  const TopBar = () => {
    const tabLabel = TAB_LABELS[tab] || "Painel";
    const pills: { icon: string; label: string; color?: string }[] = [
      { icon: "▣", label: tabLabel, color: T.txPri },
    ];

    if (tab === "controle" && obra) {
      pills.push({ icon: "🏗️", label: obra.siteIdSharing || obra.siteIdOperadora || "Obra", color: T.blue });
    }
    if (tab === "orcv2" && activeBudgetV2?.siteInfo?.siteId) {
      pills.push({ icon: "📍", label: activeBudgetV2.siteInfo.siteId, color: T.blue });
    }
    if (tab === "orcamento") {
      pills.push({ icon: "⚙️", label: orcArea === "implantacao" ? "Implantação" : "Operação", color: T.green });
    }

    const IconButton = ({ title, icon }) => (
      <button
        title={title}
        style={{
          width: 32, height: 32, borderRadius: 10,
          background: T.bg2, border: `1px solid ${T.brBase}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: T.txMut, cursor: "pointer", transition: "all 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = T.blue)}
        onMouseLeave={e => (e.currentTarget.style.borderColor = T.brBase)}
      >
        <span style={{ fontSize: 13, filter: "grayscale(1)" }}>{icon}</span>
      </button>
    );

    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, marginBottom: 12, padding: "6px 6px 4px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {pills.map((p, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: T.bg2, border: `1px solid ${T.brBase}`,
              padding: "6px 14px", borderRadius: 10,
              fontSize: 12, fontWeight: 700, color: p.color || T.txPri,
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
            }}>
              <span style={{ fontSize: 13, opacity: 0.8, filter: "grayscale(1)" }}>{p.icon}</span>
              <span style={{ whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{p.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconButton title="Buscar" icon="🔍" />
          <IconButton title="Alertas" icon="🔔" />
          <IconButton title="Atualizar" icon="⟳" />
          <div title={user?.nome || "Usuário"} style={{
            width: 34, height: 34, borderRadius: "50%",
            background: `linear-gradient(135deg, ${T.blueD}, ${T.blue})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 12,
            border: `1px solid ${T.blue}66`, boxShadow: `0 4px 12px ${T.blue}40`,
          }}>
            {(user?.nome || "U").charAt(0)}
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // AREA SELECT SCREEN
  // ════════════════════════════════════════════════════════════════════
  if (mainView === "area_select") return (
    <div style={{ fontFamily: "'Inter','DM Sans',system-ui,sans-serif", minHeight: "100vh", background: T.bg0, color: T.txPri, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <img src={LOGO_B64} alt="LS Office" style={{ width: 90, height: 90, objectFit: "contain", borderRadius: 12, marginBottom: 16 }} />
        <div style={{ fontSize: 28, fontWeight: 900, color: T.txPri, letterSpacing: "-0.03em" }}>LS Office · Sistema</div>
        <div style={{ fontSize: 14, color: T.txMut, marginTop: 4 }}>Selecione a área para iniciar um orçamento</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,320px)", gap: 18, maxWidth: 680 }}>
        {AREAS.map(area => (
          <button key={area.id} onClick={() => { setCurrentArea(area.id); setOrcItemsImpl([]); setOrcItemsOp([]); setTab("orcamento"); setMainView("main"); }}
            style={{ background: T.bg2, border: `1px solid ${area.color}20`, borderRadius: 14, padding: "24px 20px", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 10, outline: "none", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = T.bg3; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 32px ${area.color}15`; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.bg2; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 10, background: area.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{area.icon}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: area.color }}>{area.label}</div>
                <span style={{ background: T.bg3, color: area.hasLPU ? T.blue : T.amber, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{area.hasLPU ? area.lpu : "EM BREVE"}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.txSec, lineHeight: 1.6 }}>{area.desc}</div>
          </button>
        ))}
      </div>
      <button onClick={() => setMainView("main")} style={{ marginTop: 24, background: "transparent", border: `1px solid ${T.brBase}`, color: T.txMut, borderRadius: 8, padding: "10px 28px", cursor: "pointer", fontSize: 13 }}>
        Entrar sem área → Controle de Obras
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  // NAV items
  // ════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════
  // SIDEBAR — nova estrutura reorganizada
  // ════════════════════════════════════════════════════════════════════
  const Sidebar = () => {
    const isExpanded = sidePinned || sideHovered;
    const NAV_COLORS = {
      orcv2: T.blue,
      historico: T.purple,
      novo_orcamento: T.blue,
      projetos: T.blue,
      controle: T.blue,
      fornecedores: T.purple,
      funcionarios: T.green,
      relatorios: T.cyan,
      faturamento: T.green,
      clientes: T.cyan,
      secretaria: T.amber,
      tabela: T.blue,
      faturas: T.green,
      lpus: T.amber,
    };

    const NavItem = ({ id, icon, label, badge, indent = false, onClick, activeOverride = undefined, color = null }) => {
      const active = typeof activeOverride === "boolean" ? activeOverride : (tab === id && !onClick);
      const handleClick = onClick || (() => setTab(id));
      const accent = color || NAV_COLORS[id] || T.blue;
      return (
        <button onClick={handleClick} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: indent ? (isExpanded ? "7px 12px 7px 28px" : "7px 0") : "10px 14px",
          borderRadius: 10, border: "none", cursor: "pointer", marginBottom: 3,
          textAlign: "left",
          background: active
            ? `linear-gradient(90deg, ${accent}22, ${accent}08)`
            : "transparent",
          color: active ? T.txPri : indent ? T.txSec : T.txMut,
          fontWeight: active ? 600 : indent ? 500 : 500,
          fontSize: (indent ? 12 : 13),
          borderLeft: active ? `3px solid ${accent}` : "3px solid transparent",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          justifyContent: isExpanded ? "flex-start" : "center",
          minHeight: 40,
        }}
          onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = T.bgHover; }}
          onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          {indent
            ? (isExpanded ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? accent : (badge || T.txMut), flexShrink: 0, boxShadow: active ? `0 0 6px ${accent}` : "none" }} /> : null)
            : (
              <span style={iconBox(accent, active)}>
                <span style={{ fontSize: 14, opacity: active ? 1 : 0.85, filter: "grayscale(1)" }}>{icon}</span>
              </span>
            )
          }
          {isExpanded && <span style={{ flex: 1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
          {isExpanded && badge && !indent && <span style={{ background: T.red, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 9, fontWeight: 700, boxShadow: `0 0 8px ${T.red}60` }}>{badge}</span>}
        </button>
      );
    };

    const obrasAtivas = projetos.filter(p => p.status !== "Concluído");
    const controleColor = NAV_COLORS.controle || T.blue;

    return (
      <aside 
        className="scroll-min"
        onMouseEnter={() => setSideHovered(true)}
        onMouseLeave={() => setSideHovered(false)}
        style={{ 
          width: isExpanded ? 260 : 64, 
          minHeight: "100vh", 
          background: isExpanded ? T.bg2 : T.bgSidebar,
          borderRight: `1px solid ${T.brBase}`, 
          boxShadow: isExpanded ? "4px 0 32px rgba(15, 23, 42, 0.08)" : "0 0 16px rgba(15, 23, 42, 0.05)", 
          display: "flex", 
          flexDirection: "column", 
          flexShrink: 0, 
          position: "fixed", 
          left: 0,
          top: 0, 
          height: "100vh", 
          overflow: "hidden",
          zIndex: 1000,
          transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s"
        }}>

        {/* Toggle Pinned Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); setSidePinned(!sidePinned); }}
          style={{
            position: "absolute", right: 10, top: 12, width: 28, height: 28,
            borderRadius: 8, background: sidePinned ? T.blue + "33" : "transparent",
            border: sidePinned ? `1px solid ${T.blue}66` : "1px solid transparent", 
            cursor: "pointer", display: isExpanded ? "flex" : "none",
            alignItems: "center", justifyContent: "center", fontSize: 12,
            color: sidePinned ? T.blue : T.txMut,
            transition: "all 0.2s", zIndex: 1010
          }}
          title={sidePinned ? "Desafixar menu" : "Fixar menu"}
        >
          {sidePinned ? "📌" : "📍"}
        </button>

        <div className="scroll-min" style={{ height: "100%", overflowY: "auto", paddingRight: 12, marginRight: -12, position: "relative", zIndex: 1 }}>
        {/* Logo — escala maior */}
        <div style={{
          padding: isExpanded ? "20px 12px 16px" : "16px 0", borderBottom: `1px solid ${T.brSub}`,
          textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center",
          background: isExpanded ? `linear-gradient(180deg, ${T.bg2} 0%, ${T.bg1} 100%)` : "transparent",
          transition: "padding 0.25s"
        }}>
          <div style={{
            position: "relative", width: isExpanded ? 64 : 40, height: isExpanded ? 64 : 40, marginBottom: isExpanded ? 12 : 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.25s"
          }}>
            <div style={{
              position: "relative", zIndex: 2, width: "100%", height: "100%", borderRadius: 12,
              background: "#fff",
              border: `1px solid ${T.brBase}`,
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              <img src={LOGO_B64} alt="LS Office" style={{ width: isExpanded ? 50 : 30, height: isExpanded ? 50 : 30, objectFit: "contain", transition: "all 0.25s" }} />
            </div>
          </div>
          {isExpanded && (
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", color: T.txSec,
              background: T.bg1,
              borderRadius: 6, padding: "4px 12px",
              border: `1px solid ${T.brBase}`,
              display: "inline-flex", alignItems: "center", gap: 6,
              animation: "fadeIn 0.3s ease"
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.blue, flexShrink: 0, boxShadow: `0 0 8px ${T.blue}40` }} />
              LS OFFICE ERP
            </div>
          )}
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
        </div>

        <nav style={{ padding: isExpanded ? "8px 6px" : "8px 4px", flex: 1, overflowX: "hidden" }}>

          {/* ── Seção DASHBOARD ── */}
          {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>DASHBOARD</div>}
          <NavItem id="dashboard" icon="📈" label="Dashboard Financeiro" />

          {/* ── Divisor ── */}
          {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

          {/* ── Seção ORÇAMENTO ── */}
          {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>ORÇAMENTO</div>}

          <NavItem id="historico" icon="📁" label="Orçamentos" badge={historico.length > 0 ? historico.length.toString() : null} />
          <NavItem
            id="novo_orcamento"
            icon="＋"
            label="Novo Orçamento"
            onClick={() => { setActiveBudgetV2(null); setTab("orcv2"); }}
          />
          <NavItem id="lpus" icon="📚" label="Bases (LPUs)" />

          {/* ── Divisor ── */}
          {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "10px 4px" }} />}

          {/* ── Seção OBRAS ── */}
          {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>OBRAS</div>}

          <NavItem id="projetos" icon="🗂️" label="Kanban" />

          {/* Controle de Obras — expansível */}
          <div>
            <button
              onClick={() => {
                setSideControleOpen(o => !o);
                setTab("controle");
                setProjetoSel(null);
              }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                marginBottom: 3, textAlign: "left",
                background: tab === "controle" ? `linear-gradient(90deg, ${controleColor}22, ${controleColor}08)` : "transparent",
                color: tab === "controle" ? T.txPri : T.txMut,
                fontWeight: tab === "controle" ? 600 : 500, fontSize: 13,
                borderLeft: tab === "controle" ? `3px solid ${controleColor}` : "3px solid transparent",
                transition: "all 0.2s",
                justifyContent: isExpanded ? "flex-start" : "center"
              }}>
              <span style={iconBox(controleColor, tab === "controle")}>
                <span style={{ fontSize: 14, opacity: tab === "controle" ? 1 : 0.85, filter: "grayscale(1)" }}>📊</span>
              </span>
              {isExpanded && <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Controle de Obras</span>}
              {isExpanded && nfsAtraso.length > 0 && (
                <span style={{ background: T.red, color: "#fff", borderRadius: 8, padding: "0px 5px", fontSize: 8, fontWeight: 700 }}>
                  {nfsAtraso.length}
                </span>
              )}
              {isExpanded && <span style={{
                fontSize: 9, color: T.txMut, transition: "transform 0.2s",
                transform: sideControleOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}>›</span>}
            </button>

            {/* Leque de obras */}
            {isExpanded && sideControleOpen && (
              <div style={{ marginBottom: 4, marginTop: 2 }}>
                {obrasAtivas.length === 0
                  ? <div style={{ padding: "4px 8px 4px 16px", fontSize: 9, color: T.txDis }}>Nenhuma obra ativa</div>
                  : obrasAtivas.map(p => {
                    const sc = ST_COLOR[p.status] || T.txMut;
                    const isActive = projetoSel === p.id && tab === "controle";
                    return (
                      <button key={p.id}
                        onClick={() => { setProjetoSel(p.id); setObraTab("resumo"); setTab("controle"); }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "6px 12px 6px 24px",
                          borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2,
                          textAlign: "left",
                          background: isActive ? T.bg3 : "transparent",
                          borderLeft: isActive ? `3px solid ${T.blue}` : `3px solid transparent`,
                          transition: "all 0.2s"
                        }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: sc, flexShrink: 0,
                          boxShadow: isActive ? `0 0 6px ${sc}` : "none",
                        }} />
                        <div style={{ flex: 1, textAlign: "left", overflow: "hidden" }}>
                          <div style={{
                            fontSize: 10, fontWeight: isActive ? 700 : 500,
                            color: isActive ? T.txPri : T.txSec,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {p.siteIdSharing || "—"}
                          </div>
                          <div style={{ fontSize: 8, color: T.txMut, marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ color: OP_COLOR[p.operadora] || T.txMut, fontWeight: 600 }}>
                              {p.operadora}
                            </span>
                            {" · "}{getAvancoEfetivo(p)}%
                          </div>
                        </div>
                      </button>
                    )
                  })
                }
              </div>
            )}
          </div>

          <NavItem id="fornecedores" icon="🏢" label="Fornecedores" />
          <NavItem id="funcionarios" icon="👥" label="Funcionários" />
          <NavItem id="relatorios" icon="📊" label="Relatórios" />
          <NavItem id="faturamento" icon="🧾" label="Faturamento" />
          <NavItem id="clientes" icon="🤝" label="Clientes" />

          {/* ── Divisor ── */}
          {isExpanded && <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${T.brBase}, transparent)`, margin: "14px 4px" }} />}

          {/* ── Seção ADMINISTRAÇÃO ── */}
          {isExpanded && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: T.txDis, marginBottom: 8, paddingLeft: 14, paddingTop: 10, display: "flex", alignItems: "center", gap: 8 }}>ADMINISTRAÇÃO</div>}
          <NavItem id="secretaria" icon="🧑‍💼" label="Secretária LS" />

        </nav>

        {/* Atalhos inferiores */}
        <div style={{ padding: "6px 6px 8px", borderTop: `1px solid ${T.brStrong}` }}>
          <NavItem id="tabela" icon="▦" label="Tabela" />
          <NavItem id="faturas" icon="🧾" label="Faturas" />
        </div>

        {/* Usuário logado + logout */}
        <div style={{ borderTop: `1px solid ${T.brStrong}`, background: T.bg1 }}>
          {/* Backup buttons */}
          <div style={{ padding: "8px 10px 4px", display: "flex", gap: 6 }}>
            <button onClick={exportarBackup}
              title="Exportar backup JSON"
              style={{
                flex: 1, background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 6,
                padding: "6px 4px", cursor: "pointer", color: T.txSec, fontSize: 10, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                transition: "all 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.blue}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.brBase}
            >
              ⬇ Backup
            </button>
            <label title="Restaurar dados de um backup JSON"
              style={{
                flex: 1, background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 6,
                padding: "6px 4px", cursor: "pointer", color: T.txSec, fontSize: 10, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                transition: "all 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget as HTMLLabelElement).style.borderColor = T.blue}
              onMouseLeave={e => (e.currentTarget as HTMLLabelElement).style.borderColor = T.brBase}
            >
              ⬆ Restaurar
              <input type="file" accept=".json" style={{ display: "none" }}
                onChange={e => e.target.files[0] && importarBackup(e.target.files[0])} />
            </label>
          </div>
          {/* Auto-save indicator */}
          <div style={{ padding: "2px 14px 6px", display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
            <span style={{ fontSize: 10, color: T.txDis, fontWeight: 500 }}>Auto-save ativo</span>
          </div>
          <div style={{ padding: "6px 12px 12px", display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${T.brStrong}40` }}>
            <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: `linear-gradient(135deg, ${T.blueD}, ${T.blue})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "#fff",
                boxShadow: `0 4px 12px ${T.blue}40`,
                border: `1px solid ${T.blue}55`
              }}>
                {user?.nome?.charAt(0) || "U"}
              </div>
              <span style={{
                position: "absolute", right: -1, bottom: -1,
                width: 9, height: 9, borderRadius: "50%",
                background: T.green, border: `2px solid ${T.bg1}`,
                boxShadow: `0 0 6px ${T.green}`
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.nome || "Usuário"}</div>
              <div style={{ fontSize: 10, color: T.txMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8 }}>{user?.email || ""}</div>
            </div>
            <button onClick={onLogout}
              title="Sair"
              style={{
                background: "transparent", border: `1px solid ${T.brBase}`, borderRadius: 8,
                padding: "6px", cursor: "pointer", color: T.txMut, fontSize: 14, flexShrink: 0,
                transition: "all 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.red}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = T.brBase}
            >
              ⏻
            </button>
          </div>
          <div style={{ padding: "1px 8px 6px", fontSize: 8, color: T.txDis, textAlign: "center", opacity: 0.5 }}>
            v3.5 · LS Office ERP
          </div>
        </div>
        </div>
      </aside>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: ORÇAMENTO
  // ════════════════════════════════════════════════════════════════════
  const TabOrcamento = () => {
    const areaInfo = orcArea === "implantacao"
      ? { label: "Implantação", icon: "🔧", color: T.blue, lpu: "LPU ADEQUAÇÃO" }
      : { label: "Operação", icon: "⚙️", color: T.green, lpu: "LPU OPERAÇÃO" };
    const totalComDesc = totalCustom * (1 - discount / 100);
    return (
      <div>
        {/* Área ativa badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ background: areaInfo.color + "18", border: `1px solid ${areaInfo.color}40`, borderRadius: 8, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>{areaInfo.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: areaInfo.color }}>{areaInfo.label}</span>
            <span style={{ fontSize: 9, color: T.txMut, background: T.bg3, borderRadius: 4, padding: "1px 6px", border: `1px solid ${T.brBase}` }}>{areaInfo.lpu}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ id: "implantacao", icon: "🔧", label: "Implantação", c: T.blue }, { id: "operacao", icon: "⚙️", label: "Operação", c: T.green }].map(a => (
              <button key={a.id} onClick={() => { setOrcArea(a.id); setCatFilter("TODOS"); setSearchTerm(""); }}
                style={{ background: orcArea === a.id ? a.c + "22" : "transparent", border: `1px solid ${orcArea === a.id ? a.c + "60" : T.brBase}`, color: orcArea === a.id ? a.c : T.txMut, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 10, fontWeight: orcArea === a.id ? 700 : 400 }}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Site info banner */}
        <div style={{
          ...S.card, marginBottom: 8, padding: "8px 10px",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          borderLeft: siteInfo.siteId && orcItems.length > 0 ? `3px solid ${T.blue}` : `3px solid ${T.brBase}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>Informações do Site</div>
            {siteInfo.siteId && orcItems.length > 0 ? (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {[{ l: "Site", v: siteInfo.siteId }, { l: "Sharing", v: siteInfo.sharingNome }, { l: "Operadora", v: siteInfo.operadora }, { l: "UF", v: siteInfo.uf }, { l: "Município", v: siteInfo.municipio }, { l: "Endereço", v: siteInfo.endereco }].filter(x => x.v).map(({ l, v }) => (
                  <span key={l} style={{ fontSize: 14 }}><span style={{ color: T.txMut }}>{l}: </span><span style={{ color: T.txPri, fontWeight: 600 }}>{v}</span></span>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, opacity: 0.3 }}>📍</span>
                <div>
                  <div style={{ fontSize: 12, color: T.txDis, fontStyle: "italic" }}>Nenhum orçamento ativo</div>
                  <div style={{ fontSize: 11, color: T.txDis, marginTop: 1 }}>Clique em <strong style={{ color: T.txMut }}>➕ Novo Orçamento</strong> para começar</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {/* Novo Orçamento: zera tudo e abre modal do site */}
              <button
                onClick={() => {
                  if (orcItems.length > 0) {
                    if (!window.confirm("Iniciar um novo orçamento?\n\nOs itens atuais serão descartados (salve primeiro se necessário).")) return;
                  }
                  setOrcItemsImpl([]);
                  setOrcItemsOp([]);
                  setSiteInfo({ siteId: "", sharingNome: "", siteIdSharing: "", operadora: "", uf: "", municipio: "", endereco: "" });
                  setDiscount(0);
                  setBdi(25);
                  setLucro(10);
                  setShowSiteModal(true);
                }}
                style={{ ...S.ghost, fontSize: 12, padding: "4px 10px" }}>
                ➕ Novo Orçamento
              </button>
              {/* Editar Site: apenas abre modal sem apagar itens */}
              {orcItems.length > 0 && (
                <button onClick={() => setShowSiteModal(true)} style={{ ...S.ghost, fontSize: 12, padding: "4px 10px" }}>✏️ Editar Site</button>
              )}
              <button onClick={() => {
                salvarOrc();
                // Após salvar: zera o orçamento atual e navega para a lista
                if (orcItems.length > 0) setTimeout(() => {
                  setOrcItemsImpl([]);
                  setOrcItemsOp([]);
                  setSiteInfo({ siteId: "", sharingNome: "", siteIdSharing: "", operadora: "", uf: "", municipio: "", endereco: "" });
                  setTab("historico");
                  setOrcSel(null);
                }, 150);
              }}
                style={{
                  ...S.btn,
                  background: orcItems.length > 0 ? "linear-gradient(135deg,#065f46,#34d399)" : T.bg4,
                  color: orcItems.length > 0 ? "#fff" : T.txDis,
                  border: `1px solid ${orcItems.length > 0 ? T.green + "40" : T.brBase}`,
                  cursor: orcItems.length > 0 ? "pointer" : "not-allowed",
                  fontSize: 12, padding: "5px 12px",
                }}>💾 Salvar Orçamento</button>
            </div>
            {salvoMsg && (
              <div style={{
                fontSize: 13, padding: "5px 12px", borderRadius: 7,
                background: salvoMsg.startsWith("✅") ? T.green + "18" : T.amber + "18",
                color: salvoMsg.startsWith("✅") ? T.green : T.amber,
                border: `1px solid ${salvoMsg.startsWith("✅") ? T.green + "40" : T.amber + "40"}`,
                fontWeight: 600,
              }}>{salvoMsg}</div>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8 }}>
          {[
            { icon: "📦", label: "Itens na Base", val: activeDB.length.toString(), sub: `${activeCats.length} categorias`, color: areaInfo.color },
            { icon: "🛒", label: "Itens Selecionados", val: orcItems.length.toString(), sub: orcItems.length > 0 ? `${orcItems.reduce((s, i) => s + i.qtde, 0)} unid.` : "nenhum item", color: T.purple },
            { icon: "💼", label: "Custo Base", val: fmt(totalCustom), sub: `Desc ${discount}% · ${fmt(totalDesconto)}`, color: T.green },
            { icon: "💰", label: "Total Final", val: fmt(totalFinal), sub: `BDI ${bdi}% · Lucro ${lucro}%`, color: T.amber },
          ].map(({ icon, label, val, sub, color }) => (
            <div key={label} style={{ ...S.card, borderLeft: `3px solid ${color}`, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><span style={{ fontSize: 14 }}>{icon}</span><span style={{ fontSize: 11, color: T.txMut, fontWeight: 700 }}>{label}</span></div>
              <div style={{ fontSize: 16, fontWeight: 900, color, letterSpacing: "-0.02em" }}>{val}</div>
              <div style={{ fontSize: 11, color: T.txDis, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Params */}
        <div style={{ ...S.card, marginBottom: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.amber }}>⚙️ Parâmetros Globais</span>
          {[{ l: "Desconto (%)", v: discount, set: setDiscount, c: T.red }, { l: "BDI (%)", v: bdi, set: setBdi, c: T.purple }, { l: "Lucro (%)", v: lucro, set: setLucro, c: T.green }].map(({ l, v, set, c }) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 12, color: T.txMut }}>{l}</span>
              <input type="number" value={v} onChange={e => set(Number(e.target.value))} min={0} max={100} step={0.5}
                style={{ ...S.input, width: 56, color: c, fontWeight: 700, textAlign: "center", padding: "4px 6px", fontSize: 13 }} />
              <span style={{ color: c, fontSize: 12 }}>%</span>
            </div>
          ))}
          {totalFinal > 0 && <div style={{ marginLeft: "auto", background: T.bg3, borderRadius: 6, padding: "4px 10px", border: `1px solid ${T.amber}30` }}>
            <span style={{ fontSize: 11, color: T.txMut }}>{`Desc ${fmt(totalDesconto)} · Total: `}</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: T.amber }}>{fmt(totalFinal)}</span>
          </div>}
        </div>

        {/* Catalog + Selected */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 8 }}>
          {/* Catalog */}
          <div style={{ ...S.card, padding: "8px 10px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: areaInfo.color }}>📦 {areaInfo.lpu} — {activeDB.length} itens</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input placeholder="Buscar código, solução ou configuração..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ ...S.input, flex: 1, padding: "4px 8px", fontSize: 12 }} />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...S.input, width: 140, padding: "4px 6px", fontSize: 12 }}>
                <option value="TODOS">Todas Categorias</option>
                {activeCats.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: T.txMut, marginBottom: 4 }}>{filteredDB.length} itens encontrados</div>
            <div style={{ maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                  {["Código", "Cat.", "Solução", "Config.", "Unid", "VL Médio", ""].map(h => (
                    <th key={h} style={{ padding: "4px 6px", textAlign: "left", color: T.txMut, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredDB.map((item, i) => (
                    <tr key={item.cod} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 === 0 ? "transparent" : T.bg1 + "50" }}>
                      <td style={{ padding: "3px 6px", color: T.blue, fontWeight: 700, fontSize: 12 }}>{item.cod}</td>
                      <td style={{ padding: "3px 6px" }}><span style={{ background: T.bg4, color: T.txSec, padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>{item.resumo}</span></td>
                      <td style={{ padding: "3px 6px", color: T.txSec, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }} title={item.solucao}>{item.solucao}</td>
                      <td style={{ padding: "3px 6px", color: T.txMut, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{item.config || "—"}</td>
                      <td style={{ padding: "3px 6px", color: T.txMut, fontSize: 12 }}>{item.unid}</td>
                      <td style={{ padding: "3px 6px", color: T.green, whiteSpace: "nowrap", fontWeight: 700, fontSize: 12 }}>{fmt(item.vl_medio)}</td>
                      <td style={{ padding: "3px 6px" }}><button onClick={() => addItem(item)} style={{ ...S.btn, padding: "2px 8px", fontSize: 11 }}>+ Add</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ ...S.card, flex: 1, padding: "8px 10px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: T.blue }}>🛒 Selecionados ({orcItems.length})</div>
              {orcItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 10px", color: T.txDis }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>📋</div>
                  <div style={{ fontSize: 12 }}>Adicione itens do catálogo</div>
                </div>
              ) : (
                <div style={{ maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
                  {orcItems.map(item => {
                    const itemTotals = calcItemFinance(item);
                    return (
                    <div key={item.cod} style={{ background: T.bg0, borderRadius: 6, padding: "6px 8px", marginBottom: 4, border: `1px solid ${T.brBase}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <div><span style={{ color: T.blue, fontWeight: 700, fontSize: 12 }}>{item.cod}</span><span style={{ color: T.txMut, fontSize: 11, marginLeft: 4 }}>{item.resumo}</span></div>
                        <button onClick={() => removeItem(item.cod)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14 }}>✕</button>
                      </div>
                      <div style={{ fontSize: 12, color: T.txMut, marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.solucao}</div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <div style={{ flex: 1 }}><div style={S.label}>Qtde</div>
                          <input type="number" value={item.qtde} onChange={e => updateQtde(item.cod, e.target.value)} min={0} style={{ ...S.input, padding: "5px 8px" }} />
                        </div>
                        <div style={{ flex: 2 }}><div style={S.label}>VL Unit Orig. (R$)</div>
                          <input type="number" value={item.vl_custom} onChange={e => updateVl(item.cod, e.target.value)} style={{ ...S.input, padding: "5px 8px", color: T.green }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, paddingTop: 6, borderTop: `1px solid ${T.brSub}` }}>
                        {[{ l: "Desc%", f: "descItem", c: T.red, ph: discount }, { l: "BDI%", f: "bdiItem", c: T.purple, ph: bdi }, { l: "Lucro%", f: "lucroItem", c: T.green, ph: lucro }].map(({ l, f, c, ph }) => (
                          <div key={f} style={{ flex: 1 }}>
                            <div style={{ ...S.label, color: c + "99" }}>{l}</div>
                            <input type="number" min={0} max={100} step={0.5} placeholder={ph}
                              value={item[f] !== undefined ? item[f] : ""}
                              onChange={e => updateParam(item.cod, f, e.target.value)}
                              style={{ ...S.input, padding: "4px 6px", color: c, fontSize: 13 }} />
                          </div>
                        ))}
                        <div style={{ flex: 1.5, textAlign: "right" }}>
                          <div style={S.label}>Proposta</div>
                          <div style={{ color: T.amber, fontWeight: 800, fontSize: 14, paddingTop: 4 }}>{fmt(itemTotals.totalFinal)}</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                        <div style={{ background: T.bg1, borderRadius: 6, padding: "5px 6px", border: `1px solid ${T.brSub}` }}>
                          <div style={{ ...S.label, color: T.red + "aa" }}>Desc. Aplicado</div>
                          <div style={{ color: T.red, fontWeight: 700, fontSize: 12 }}>{fmt(itemTotals.discountUnit)}</div>
                        </div>
                        <div style={{ background: T.bg1, borderRadius: 6, padding: "5px 6px", border: `1px solid ${T.brSub}` }}>
                          <div style={{ ...S.label, color: T.green + "aa" }}>VL Unit. C/Desc</div>
                          <div style={{ color: T.green, fontWeight: 700, fontSize: 12 }}>{fmt(itemTotals.unitNet)}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: 11 }}>
                        <span style={{ color: T.txMut }}>{`Bruto: ${fmt(itemTotals.totalBruto)}`}</span>
                        <span style={{ color: T.amber, fontWeight: 700 }}>{`Líquido: ${fmt(itemTotals.totalLiquido)}`}</span>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
            {orcItems.length > 0 && (
              <div style={{ ...S.card, borderTop: `2px solid ${T.blue}30` }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, color: T.blue }}>📊 Composição</div>
                {[
                  { l: "TOTAL BRUTO", v: totalCustom, c: T.txSec },
                  { l: `(-) DESCONTO ${discount}%`, v: -totalDesconto, c: T.red },
                  { l: "TOTAL LÍQUIDO FINAL", v: totalLiquido, c: T.cyan, bold: true },
                  { l: `BDI ${bdi}%`, v: totalBdiValor, c: T.purple },
                  { l: `Lucro ${lucro}%`, v: totalLucroValor, c: T.green },
                  { l: "TOTAL FINAL", v: totalFinal, c: T.amber, bold: true },
                ].map(({ l, v, c, bold }) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.brSub}` }}>
                    <span style={{ fontSize: 11, color: T.txMut }}>{l}</span>
                    <span style={{ fontSize: bold ? 14 : 12, fontWeight: bold ? 900 : 600, color: c }}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Banner PV Highline */}
            {orcItems.length > 0 && (
              <div style={{
                ...S.card, marginTop: 4,
                background: `linear-gradient(135deg, ${T.bg3}, ${T.bg2})`,
                border: `1px solid ${T.cyan}40`,
                borderLeft: `4px solid ${T.cyan}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.cyan, marginBottom: 4 }}>
                      📑 Gerar PV Highline
                    </div>
                    <div style={{ fontSize: 11, color: T.txSec, lineHeight: 1.6 }}>
                      Você tem <strong style={{ color: T.amber }}>{orcItems.length} itens</strong> selecionados.
                      O sistema irá mapear automaticamente para o formato PV Highline
                      e gerar o arquivo <strong>.xlsx</strong> pronto para envio.
                    </div>
                    <div style={{ fontSize: 10, color: T.txMut, marginTop: 4 }}>
                      ⚡ Mapeamento automático · Preços Highline · Resumo por categoria
                    </div>
                  </div>
                  <button
                    onClick={() => { setTab("pvhighline"); setPvTabInner("resumo"); }}
                    style={{
                      background: `linear-gradient(135deg,#0e7490,${T.cyan})`,
                      color: "#fff", border: "none", borderRadius: 10,
                      padding: "12px 24px", cursor: "pointer",
                      fontSize: 13, fontWeight: 800,
                      boxShadow: `0 4px 20px ${T.cyan}40`,
                      whiteSpace: "nowrap", flexShrink: 0,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                    📊 Abrir PV Highline
                    <span style={{ fontSize: 16 }}>→</span>
                  </button>
                </div>
                {/* Prévia dos itens mapeados */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.cyan}20` }}>
                  <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 6 }}>
                    PRÉVIA DO MAPEAMENTO ({orcItems.filter(i => {
                      const { mapeamento: M } = DB_PV_HIGHLINE;
                      return M.some(m => m.codsLS.includes(i.cod));
                    }).length} de {orcItems.length} itens mapeados automaticamente)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {orcItems.slice(0, 8).map(item => {
                      const { mapeamento: M } = DB_PV_HIGHLINE;
                      const maps = M.filter(m => m.codsLS.includes(item.cod));
                      const mapped = maps.length > 0;
                      return (
                        <div key={item.cod} style={{
                          background: mapped ? T.green + "18" : T.bg4,
                          border: `1px solid ${mapped ? T.green + "40" : T.brBase}`,
                          borderRadius: 5, padding: "2px 7px",
                          fontSize: 11, color: mapped ? T.green : T.txDis,
                          fontWeight: 600,
                        }}>
                          {item.cod}
                          {mapped && <span style={{ marginLeft: 4, fontSize: 8 }}>→ {maps[0].itemHL}</span>}
                        </div>
                      );
                    })}
                    {orcItems.length > 8 && (
                      <div style={{ background: T.bg4, borderRadius: 5, padding: "2px 7px", fontSize: 11, color: T.txMut }}>
                        +{orcItems.length - 8} mais
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: PROJETOS DE OBRA (list + create)
  // ════════════════════════════════════════════════════════════════════
  const nextPropostaId = () => {
    try {
      const year = new Date().getFullYear();
      const key = `ls_proposta_seq_${year}`;
      const seq = Number(localStorage.getItem(key) || "0") + 1;
      localStorage.setItem(key, String(seq));
      return `PROP-LSI-${year}-${String(seq).padStart(6, "0")}`;
    } catch {
      const year = new Date().getFullYear();
      return `PROP-LSI-${year}-${String(Date.now()).slice(-6)}`;
    }
  };

  const openLinkedProject = (projectId) => {
    if (!projectId) return;
    setProjetoSel(projectId);
    setObraTab("resumo");
    setTab("controle");
  };

  const getBudgetSiteContext = (orc) => orc?.siteInfo || {};

  const getBudgetContractorName = (orc) => {
    const si = getBudgetSiteContext(orc);
    return orc?.contratante || si.sharingNome || si.operadora || "—";
  };

  const getBudgetModeLabel = (orc) => (orc?.projetoId ? "Vinculado à atividade" : "Orçamento simples");

  const getSavedBudgetTotal = (orc) => roundCurrency(getBudgetTotalFromRecord(orc));

  const buildProjectDraftFromBudget = (orc) => {
    const si = getBudgetSiteContext(orc);
    const legacy = isLegacyBudget(orc) ? hydrateLegacyBudget(orc) : null;
    const categoriaProjeto = si.categoriaProjeto || (legacy && String(legacy.area || "").toLowerCase().includes("opera") ? "manutencao" : "implantacao");
    const tipoProjeto = si.tipoProjeto || (categoriaProjeto === "manutencao" ? "manutencao_geral" : "adequacao_infra");
    const sharing = getBudgetContractorName(orc);
    const descricao = legacy
      ? (legacy.objeto || legacy.obs || `Atividade originada do orçamento ${legacy.id}`)
      : (orc.objeto || orc.obs || `Atividade originada do orçamento ${orc.id}`);

    return {
      siteId: si.siteId || si.siteIdSharing || si.siteIdOperadora || orc.id,
      siteIdSharing: si.siteIdSharing || si.siteId || "",
      siteIdOperadora: si.siteIdOperadora || "",
      sharing,
      operadora: si.operadora || "Vivo",
      Sharing: sharing,
      municipio: si.municipio || "",
      uf: si.uf || "",
      endereco: si.endereco || "",
      descricao,
      fornecedor: orc.fornecedor || "LS Office",
      contato: "",
      dataOrcamento: orc.data || new Date().toLocaleDateString("pt-BR"),
      dataInicioAtividade: orc.data || new Date().toLocaleDateString("pt-BR"),
      dataFimAtividade: "",
      proposta: nextPropostaId(),
      status: "Planejado",
      bdi: legacy?.bdi || 0,
      lucro: legacy?.lucro || 0,
      budgetAprovado: getSavedBudgetTotal(orc),
      notas: orc.obs || "",
      segmento: categoriaProjeto === "manutencao" ? "Manutenção" : "Implantação",
      categoriaProjeto,
      gestor: "",
      tipoProjeto,
      orcamentoOrigem: orc.id,
      orcamentoVinculadoId: orc.id,
    };
  };

  const calcProjectAutomaticAvanco = (project) => {
    const fromEtapas = calcAvancoFisicoEtapas(project?.etapas || []);
    if (fromEtapas > 0) return fromEtapas;
    return calcAvancoFisicoFallback(project);
  };

  const syncProjectDerivedFields = (project) => {
    if (!project) return project;
    const next = { ...project };
    if (Array.isArray(next.nfs) && next.nfs.length > 0) {
      let nfChanged = false;
      const normalizedNfs = next.nfs.map(nf => {
        if (!nf) return nf;
        const normalizedStatus = normalizeNFStatus(nf.status);
        if (normalizedStatus === String(nf.status || "").trim()) return nf;
        nfChanged = true;
        return { ...nf, status: normalizedStatus };
      });
      if (nfChanged) next.nfs = normalizedNfs;
    }
    const linkedBudget = getLinkedBudgetForProject(next);
    if (linkedBudget) {
      const linkedBudgetTotal = getSavedBudgetTotal(linkedBudget);
      if (Math.abs((Number(next.budgetAprovado) || 0) - linkedBudgetTotal) > 0.009) {
        next.budgetAprovado = linkedBudgetTotal;
      }
      if (!next.orcamentoOrigem) next.orcamentoOrigem = linkedBudget.id;
      if (!next.orcamentoVinculadoId) next.orcamentoVinculadoId = linkedBudget.id;
    }

    if (next.avancoFisicoManual) {
      next.avancoFisico = Math.max(0, Math.min(100, Number(next.avancoFisico) || 0));
    } else {
      next.avancoFisico = calcProjectAutomaticAvanco(next);
    }

    return next;
  };

  const updateProjectRecord = (projectId, updater) => {
    setProjetos(prev => prev.map(project => {
      if (project.id !== projectId) return project;
      const draft = typeof updater === "function"
        ? updater(project)
        : { ...project, ...updater };
      return syncProjectDerivedFields(draft);
    }));
  };

  const updateProjectStatus = (projectId, status) => {
    updateProjectRecord(projectId, project => {
      const today = new Date().toLocaleDateString("pt-BR");
      const next = { ...project, status };
      if (status === "Em Andamento" && !next.dataInicioAtividade) {
        next.dataInicioAtividade = today;
      }
      if (status === "Concluído") {
        if (!next.dataInicioAtividade) next.dataInicioAtividade = today;
        if (!next.dataFimAtividade) next.dataFimAtividade = today;
        next.avancoFisicoManual = false;
      }
      return next;
    });
  };

  React.useEffect(() => {
    setProjetos(prev => {
      let changed = false;
      const normalized = prev.map(project => {
        let draft = project;
        const linkedBudget = getLinkedBudgetForProject(project);
        if (linkedBudget && project.orcamentoVinculadoId !== linkedBudget.id) {
          draft = { ...draft, orcamentoVinculadoId: linkedBudget.id, orcamentoOrigem: draft.orcamentoOrigem || linkedBudget.id };
        }
        const synced = syncProjectDerivedFields(draft);
        if (JSON.stringify(synced) !== JSON.stringify(project)) changed = true;
        return synced;
      });
      return changed ? normalized : prev;
    });
  }, [historico]);

  const syncBudgetProjectLink = (projectId, budgetId = "") => {
    setHistorico(prev => prev.map(entry => {
      if (budgetId && entry.id === budgetId) {
        return normalizeHistoricBudgetEntry({ ...entry, projetoId: projectId });
      }
      if (entry.projetoId === projectId && entry.id !== budgetId) {
        return normalizeHistoricBudgetEntry({ ...entry, projetoId: undefined });
      }
      return entry;
    }));

    setActiveBudgetV2(prev => {
      if (!prev) return prev;
      if (budgetId && prev.id === budgetId) return { ...prev, projetoId: projectId };
      if (prev.projetoId === projectId && prev.id !== budgetId) return { ...prev, projetoId: undefined };
      return prev;
    });
  };

  const openCreateActivityFromBudget = (orc) => {
    setEditProj(null);
    setProjForm(buildProjectDraftFromBudget(orc));
    setShowBudgetLinkModal(false);
    setBudgetLinkTargetId(null);
    setBudgetLinkProjectId("");
    setShowProjModal(true);
  };

  const openBudgetLinkModal = (orc) => {
    setBudgetLinkTargetId(orc.id);
    setBudgetLinkProjectId(orc.projetoId || "");
    setShowBudgetLinkModal(true);
  };

  const confirmBudgetLink = () => {
    if (!budgetLinkTargetId || !budgetLinkProjectId) return;
    const orc = historico.find(o => o.id === budgetLinkTargetId);
    const proj = projetos.find(p => p.id === budgetLinkProjectId);
    if (!orc || !proj) return;

    if (proj.orcamentoVinculadoId && proj.orcamentoVinculadoId !== budgetLinkTargetId) {
      const ok = window.confirm(
        `A atividade ${proj.siteIdSharing || proj.id} já possui um orçamento vinculado (${proj.orcamentoVinculadoId}). Deseja substituir pelo orçamento ${budgetLinkTargetId}?`
      );
      if (!ok) return;
    }

    const draft = buildProjectDraftFromBudget(orc);

    setProjetos(prev => prev.map(p => p.id !== budgetLinkProjectId ? p : syncProjectDerivedFields({
      ...p,
      siteId: p.siteId || draft.siteId || draft.siteIdSharing,
      siteIdSharing: p.siteIdSharing || draft.siteIdSharing,
      siteIdOperadora: p.siteIdOperadora || draft.siteIdOperadora,
      sharing: p.sharing || draft.sharing,
      Sharing: p.Sharing || draft.Sharing,
      operadora: p.operadora || draft.operadora,
      municipio: p.municipio || draft.municipio,
      uf: p.uf || draft.uf,
      endereco: p.endereco || draft.endereco,
      descricao: p.descricao || draft.descricao,
      fornecedor: p.fornecedor || draft.fornecedor,
      dataOrcamento: p.dataOrcamento || draft.dataOrcamento,
      dataInicioAtividade: p.dataInicioAtividade || draft.dataInicioAtividade,
      dataFimAtividade: p.dataFimAtividade || draft.dataFimAtividade || "",
      budgetAprovado: draft.budgetAprovado || p.budgetAprovado || 0,
      notas: p.notas || draft.notas,
      segmento: p.segmento || draft.segmento,
      categoriaProjeto: p.categoriaProjeto || draft.categoriaProjeto,
      tipoProjeto: p.tipoProjeto || draft.tipoProjeto,
      orcamentoOrigem: budgetLinkTargetId,
      orcamentoVinculadoId: budgetLinkTargetId,
    })));

    syncBudgetProjectLink(budgetLinkProjectId, budgetLinkTargetId);
    setShowBudgetLinkModal(false);
    setBudgetLinkTargetId(null);
    setBudgetLinkProjectId("");
    openLinkedProject(budgetLinkProjectId);
  };

  const openProj = (proj) => {
    const syncedProj = syncProjectDerivedFields(proj);
    setEditProj(proj);
    setProjForm({
      siteIdSharing: syncedProj.siteIdSharing || syncedProj.siteId || "",
      siteIdOperadora: syncedProj.siteIdOperadora || "",
      sharing: syncedProj.sharing || syncedProj.Sharing || "",
      operadora: syncedProj.operadora,
      Sharing: syncedProj.Sharing || "",
      municipio: syncedProj.municipio || "",
      uf: syncedProj.uf || "",
      endereco: syncedProj.endereco || "",
      descricao: syncedProj.descricao,
      fornecedor: syncedProj.fornecedor,
      contato: syncedProj.contato,
      dataOrcamento: syncedProj.dataOrcamento,
      dataInicioAtividade: syncedProj.dataInicioAtividade || getProjectStartDate(syncedProj),
      dataFimAtividade: syncedProj.dataFimAtividade || getProjectEndDate(syncedProj),
      proposta: syncedProj.proposta,
      status: syncedProj.status,
      bdi: syncedProj.bdi,
      lucro: syncedProj.lucro,
      budgetAprovado: calcBudgetEfetivo(syncedProj),
      notas: syncedProj.notas || "",
      segmento: syncedProj.segmento || "Implantação",
      gestor: syncedProj.gestor || "",
      tipoProjeto: syncedProj.tipoProjeto || "adequacao_infra",
      categoriaProjeto: syncedProj.categoriaProjeto || "implantacao",
      orcamentoVinculadoId: syncedProj.orcamentoVinculadoId || ""
    });
    setShowProjModal(true);
  };

  const newProj = () => {
    setEditProj(null);
    setProjForm({
      siteId: "",
      siteIdSharing: "",
      siteIdOperadora: "",
      sharing: "",
      operadora: "Vivo",
      Sharing: "",
      municipio: "",
      uf: "",
      endereco: "",
      descricao: "",
      fornecedor: "",
      contato: "",
      dataOrcamento: new Date().toLocaleDateString("pt-BR"),
      dataInicioAtividade: new Date().toLocaleDateString("pt-BR"),
      dataFimAtividade: "",
      proposta: nextPropostaId(),
      status: "Em Andamento",
      bdi: 0,
      lucro: 0,
      budgetAprovado: 0,
      notas: "",
      segmento: "Implantação",
      gestor: "",
      tipoProjeto: "adequacao_infra",
      categoriaProjeto: "implantacao",
      orcamentoVinculadoId: ""
    });
    setShowProjModal(true);
  };

  const saveProj = () => {
    if (!projForm.siteIdSharing) return;
    const targetProjectId = editProj?.id || `proj_${Date.now()}`;
    const payload = {
      ...projForm,
      proposta: projForm.proposta || nextPropostaId(),
      sharing: projForm.Sharing || projForm.sharing || "",
      orcamentoOrigem: projForm.orcamentoVinculadoId || projForm.orcamentoOrigem || ""
    };

    if (payload.orcamentoVinculadoId) {
      const linkedBudget = historico.find(o => o.id === payload.orcamentoVinculadoId);
      if (linkedBudget?.projetoId && linkedBudget.projetoId !== targetProjectId) {
        const ok = window.confirm(
          `O orçamento ${payload.orcamentoVinculadoId} já está vinculado à atividade ${linkedBudget.projetoId}. Deseja transferir o vínculo para esta atividade?`
        );
        if (!ok) return;
      }
    }

    if (editProj) {
      setProjetos(prev => prev.map(p => p.id === editProj.id ? syncProjectDerivedFields({ ...p, ...payload }) : p));
      syncBudgetProjectLink(editProj.id, payload.orcamentoVinculadoId || "");
      setShowProjModal(false);
    } else {
      setProjetos(prev => [...prev, syncProjectDerivedFields({
        id: targetProjectId, ...payload,
        siteId: payload.siteIdSharing,
        itens: [], nfs: [], adiantamentos: [], despesasGerais: [],
        etapas: makeEtapasPorTipo(payload.tipoProjeto || "adequacao_infra"),
        avancoFisico: 0
      })]);
      syncBudgetProjectLink(targetProjectId, payload.orcamentoVinculadoId || "");
      setShowProjModal(false);
      setProjetoSel(targetProjectId);
      setObraTab("resumo");
      setTab("controle");
    }
  };

  const TabProjetos = () => {
    const totalObras = projetos.length;
    const emAndamento = projetos.filter(p => p.status === "Em Andamento").length;
    const totalGasto = projetos.reduce((s, p) => s + calcCustoPagoEfetivo(p), 0);

    return (
      <div>
        <SectionHeader icon="🗂️" title="Kanban de Obras" subtitle="Gestão de projetos por status · visão board" color={T.blue} />

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { icon: "🏗️", l: "Total de Obras", v: totalObras.toString(), c: T.blue },
            { icon: "⚙️", l: "Em Andamento", v: emAndamento.toString(), c: T.amber },
            { icon: "✅", l: "Concluídas", v: projetos.filter(p => p.status === "Concluído").length.toString(), c: T.green },
            { icon: "💰", l: "Custo Pago", v: fmt(totalGasto), c: T.purple },
          ].map(({ icon, l, v, c }) => (
            <div key={l} style={{ ...S.card, ...cardTint(c), borderTop: `2px solid ${c}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" }}>{l}</span>
                <span style={{ ...iconBox(c, true), width: 28, height: 28, borderRadius: 8 }}>
                  <span style={{ fontSize: 14, filter: "grayscale(1)" }}>{icon}</span>
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: c, letterSpacing: "-0.03em", textShadow: `0 0 20px ${c}40` }}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── KANBAN BOARD ── */}
        {(() => {
          const COLS = [
            { status: "Prospectando", color: T.purple, icon: "🔍" },
            { status: "Planejado", color: T.txMut, icon: "📅" },
            { status: "Em Andamento", color: T.blue, icon: "⚙️" },
            { status: "Pausado", color: T.amber, icon: "⏸️" },
            { status: "Concluído", color: T.green, icon: "✅" },
            { status: "Cancelado", color: T.red, icon: "🚫" },
          ].filter(col => projetos.some(p => p.status === col.status) || col.status === "Em Andamento" || col.status === "Prospectando");

          const KanbanCard = ({ proj }) => {
            const budget = calcBudgetEfetivo(proj);
            const custoPago = calcCustoPagoEfetivo(proj);
            const medido = calcProjMed(proj);
            const oc = OP_COLOR[proj.operadora] || T.txMut;
            return (
              <div style={{ background: T.bg3, borderRadius: 10, border: `1px solid ${T.brBase}`, padding: "12px 14px", marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.blue + "70"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 4px 16px #0006`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.brBase; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.05em" }}>SHARING</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: T.purple, letterSpacing: "-0.01em" }}>{proj.siteIdSharing || "—"}</div>
                      {proj.siteIdOperadora && (
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginTop: 1 }}>Op: {proj.siteIdOperadora}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ background: oc + "20", color: oc, padding: "1px 7px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{proj.operadora}</span>
                      <span style={{ background: T.bg4, color: T.txMut, padding: "1px 7px", borderRadius: 4, fontSize: 12 }}>🏢 {proj.sharing}</span>
                      {proj.segmento && (
                        <span style={{
                          background: proj.segmento === "Implantação" ? T.blue + "20" : T.green + "20",
                          color: proj.segmento === "Implantação" ? T.blue : T.green,
                          padding: "1px 7px", borderRadius: 4, fontSize: 12, fontWeight: 700,
                        }}>{proj.segmento === "Implantação" ? "🔧" : "⚙️"} {proj.segmento}</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Info */}
                {proj.municipio && <div style={{ fontSize: 12, color: T.txMut, marginBottom: 6 }}>📍 {proj.municipio}/{proj.uf}</div>}
                <div style={{ fontSize: 12, color: T.txSec, marginBottom: 8 }}>{proj.fornecedor} · {proj.proposta}</div>
                {/* Mini financeiro */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <div style={{ background: T.bg4, borderRadius: 6, padding: "5px 8px" }}>
                    <div style={{ fontSize: 8, color: T.txMut, fontWeight: 700, letterSpacing: "0.05em" }}>BUDGET</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri }}>{fmt(budget)}</div>
                  </div>
                  <div style={{ background: T.bg4, borderRadius: 6, padding: "5px 8px" }}>
                    <div style={{ fontSize: 8, color: T.txMut, fontWeight: 700, letterSpacing: "0.05em" }}>CUSTO PAGO</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.amber }}>{fmt(custoPago)}</div>
                  </div>
                </div>
                {/* Progresso */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: T.txMut }}>Avanço Físico</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: getAvancoEfetivo(proj) >= 80 ? T.green : T.txPri }}>{getAvancoEfetivo(proj)}%</span>
                  </div>
                  <ProgBar v={getAvancoEfetivo(proj)} max={100} color={getAvancoEfetivo(proj) >= 80 ? T.green : getAvancoEfetivo(proj) >= 40 ? T.blue : T.amber} h={7} />
                </div>
                {/* Ações */}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setProjetoSel(proj.id); setObraTab("resumo"); setTab("controle"); setSideControleOpen(true); }}
                    style={{ ...S.btn, flex: 1, fontSize: 12, padding: "5px 8px" }}>📊 Controle</button>
                  <button onClick={e => { e.stopPropagation(); openProj(proj); }}
                    style={{ ...S.ghost, padding: "5px 9px", fontSize: 13 }}>✏️</button>
                  <button onClick={e => { e.stopPropagation(); setProjetos(prev => prev.filter(p => p.id !== proj.id)); }}
                    style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "5px 9px", fontSize: 13 }}>🗑️</button>
                </div>
              </div>
            );
          };

          return (
            <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
              {COLS.map(col => {
                const colProjetos = projetos.filter(p => p.status === col.status);
                const colTotal = colProjetos.reduce((s, p) => s + calcBudgetEfetivo(p), 0);
                return (
                  <div key={col.status} style={{ minWidth: 280, maxWidth: 320, flex: "0 0 290px" }}>
                    {/* Column header */}
                    <div style={{
                      background: `linear-gradient(135deg, ${col.color}18, ${T.bg2} 70%)`,
                      borderRadius: 10, padding: "10px 14px", marginBottom: 10,
                      border: `1px solid ${col.color}30`, borderTop: `3px solid ${col.color}`,
                      display: "flex", alignItems: "center", gap: 8,
                      boxShadow: `0 8px 18px ${col.color}14`,
                    }}>
                      <span style={{ ...iconBox(col.color, true), width: 26, height: 26 }}>
                        <span style={{ fontSize: 13, filter: "grayscale(1)" }}>{col.icon}</span>
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: col.color }}>{col.status}</div>
                        <div style={{ fontSize: 12, color: T.txMut }}>{colProjetos.length} obra(s) · {fmt(colTotal)}</div>
                      </div>
                      <span style={{
                        background: col.color + "22", color: col.color,
                        border: `1px solid ${col.color}50`,
                        borderRadius: "50%", width: 22, height: 22,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800,
                      }}>{colProjetos.length}</span>
                    </div>
                    {/* Cards */}
                    <div>
                      {colProjetos.length === 0
                        ? <div style={{ background: T.bg2, borderRadius: 10, border: `1px dashed ${T.brBase}`, padding: "20px 14px", textAlign: "center", color: T.txDis, fontSize: 11 }}>Nenhuma obra</div>
                        : colProjetos.map(proj => <KanbanCard key={proj.id} proj={proj} />)
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}


      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: CONTROLE DE OBRAS (detail)
  // ════════════════════════════════════════════════════════════════════
  const TabControle = () => {
    if (!obra) return (
      <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
        <div style={{ color: T.txMut, fontSize: 14 }}>Selecione uma obra no menu lateral ou na aba Projetos</div>
        <button onClick={() => setTab("projetos")} style={{ ...S.btn, marginTop: 16 }}>Ver Kanban →</button>
      </div>
    );

    const nfPago = calcNFPago(obra);
    const servicoPago = calcPagamentosServicoPago(obra);
    const despesasConfirmadas = calcDespesasGeraisConfirmadas(obra);
    const custoPago = calcCustoPagoEfetivo(obra);
    const budget = calcBudgetEfetivo(obra);
    const saldo = calcSaldoProjeto(obra);
    const orcVinculado = obra.orcamentoVinculadoId
      ? historico.find(o => o.id === obra.orcamentoVinculadoId)
      : (historico.find((o: any) => o.projetoId === obra.id) || null);
    const sc = ST_COLOR[obra.status] || T.txMut;
    const dataAcionamento = obra.dataOrcamento || "";
    const dataInicioAtividade = getProjectStartDate(obra);
    const dataFimAtividade = getProjectEndDate(obra);

    const saveItem = () => {
      if (!itemForm.descricao) return;
      if (editItem) setProjetos(prev => prev.map(p => p.id === projetoSel ? { ...p, itens: p.itens.map(i => i.id === editItem.id ? { ...i, ...itemForm } : i) } : p));
      else { const nid = Date.now(); setProjetos(prev => prev.map(p => p.id === projetoSel ? { ...p, itens: [...p.itens, { id: nid, ...itemForm, qtdeMed: 0 }] } : p)); }
      setShowItemModal(false); setEditItem(null);
    };

    return (
      <div>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button onClick={() => setTab("projetos")} style={{ ...S.ghost, fontSize: 13, padding: "5px 12px" }}>← Projetos</button>
          <span style={{ color: T.txMut }}>›</span>
          <span style={{ color: T.purple, fontWeight: 700, fontSize: 14 }}>{obra.siteIdSharing || ""}</span>
          {obra.siteIdOperadora && (
            <span style={{ color: T.blue, fontWeight: 500, fontSize: 13 }}>/ Op: {obra.siteIdOperadora}</span>
          )}
          {/* Status — dropdown clicável */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowStatusDrop(v => !v)}
              style={{
                background: sc + "18", color: sc,
                border: `1px solid ${sc}40`,
                padding: "3px 10px 3px 10px", borderRadius: 6,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}>
              {obra.status}
              <span style={{ fontSize: 8, opacity: 0.7 }}>▼</span>
            </button>
            {showStatusDrop && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 899 }} onClick={() => setShowStatusDrop(false)} />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 900,
                  background: T.bg2, border: `1px solid ${T.brBase}`,
                  borderRadius: 10, padding: 6, minWidth: 170,
                  boxShadow: "0 8px 32px #00000080",
                }}>
                  <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", padding: "4px 8px 6px" }}>ALTERAR STATUS</div>
                  {STATUS_OPTS.map(s => {
                    const c2 = ST_COLOR[s] || T.txMut;
                    const isAtual = obra.status === s;
                    return (
                      <button key={s}
                        onClick={() => {
                          updateProjectStatus(obra.id, s);
                          setShowStatusDrop(false);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "7px 10px", borderRadius: 7,
                          border: "none", cursor: "pointer", textAlign: "left",
                          background: isAtual ? c2 + "20" : "transparent",
                          color: isAtual ? c2 : T.txSec,
                          fontWeight: isAtual ? 700 : 400, fontSize: 14,
                          marginBottom: 2,
                        }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c2, flexShrink: 0 }} />
                        {s}
                        {isAtual && <span style={{ marginLeft: "auto", fontSize: 12 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {obra.segmento && (
            <span style={{
              background: obra.segmento === "Implantação" ? T.blue + "20" : T.green + "20",
              color: obra.segmento === "Implantação" ? T.blue : T.green,
              border: `1px solid ${obra.segmento === "Implantação" ? T.blue : T.green}40`,
              padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 800,
            }}>
              {obra.segmento === "Implantação" ? "🔧" : "⚙️"} {obra.segmento}
            </span>
          )}
          {obra.tipoProjeto && (() => {
            const tp = TIPOS_PROJETO.find(t => t.id === obra.tipoProjeto);
            return tp ? (
              <span style={{ background: T.purple + "18", color: T.purple, border: `1px solid ${T.purple}40`, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                {tp.icon} {tp.label}
              </span>
            ) : null;
          })()}
        </div>

        {/* Obra header */}
        <div style={{ ...S.card, marginBottom: 18, borderLeft: `4px solid ${T.blue}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.txSec, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 2 }}>SITE ID SHARING</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: T.txPri, letterSpacing: "-0.01em" }}>{obra.siteIdSharing || "—"}</div>
                </div>
                {obra.siteIdOperadora && (
                  <div>
                    <div style={{ fontSize: 10, color: T.txSec, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 2 }}>SITE ID OPERADORA</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.blue, letterSpacing: "-0.01em" }}>{obra.siteIdOperadora}</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
                {[{ l: "Cliente", v: obra.sharing || obra.Sharing || "—" }, { l: "Operadora", v: obra.operadora }, { l: "UF", v: obra.uf }, { l: "Município", v: obra.municipio }, { l: "Fornecedor", v: obra.fornecedor }, { l: "Proposta", v: obra.proposta }, { l: "Acionada em", v: dataAcionamento }, { l: "Início", v: dataInicioAtividade }, { l: "Fim", v: dataFimAtividade }].filter(x => x.v && x.v !== "—").map(({ l, v }) => (
                  <span key={l} style={{ fontSize: 12 }}><span style={{ color: T.txSec }}>{l}: </span><span style={{ color: T.txPri, fontWeight: 500 }}>{v}</span></span>
                ))}
              </div>
              {obra.endereco && <div style={{ fontSize: 12, color: T.txMut }}>📍 {obra.endereco}</div>}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {(() => {
                const avanco = getAvancoEfetivo(obra);
                const totalGasto = custoPago;
                // EAC só faz sentido com dados reais de avanço e custo
                const temDados = avanco > 0 && totalGasto > 0;
                const va = budget * avanco / 100;
                const cpi = temDados ? (va / totalGasto) : 1;
                const eac = temDados && cpi > 0 ? budget / cpi : budget;
                const eacDiff = eac - budget;
                const eacLabel = temDados
                  ? (eac > budget ? "⚠️ Projeção de Custo" : "✅ Projeção de Custo")
                  : "Valor Orçado";
                return (
                  <>
                    <div style={{ fontSize: 11, color: T.txSec, marginBottom: 2, fontWeight: 600, letterSpacing: "0.04em" }}>{eacLabel.toUpperCase()}</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: temDados ? (eac > budget ? T.red : T.green) : T.blue, letterSpacing: "-0.01em" }}>{fmt(eac)}</div>
                    {temDados && (
                      <div style={{ fontSize: 11, color: eacDiff > 0 ? T.red : T.green, marginTop: 2 }}>
                        {eacDiff > 0 ? `+${fmt(eacDiff)} acima do orçado` : `${fmt(Math.abs(eacDiff))} abaixo do orçado`}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: T.txMut, marginTop: 4 }}>
                      Budget: <span style={{ color: T.txSec, fontWeight: 700 }}>{fmt(budget)}</span>
                    </div>
                    {orcVinculado && <div style={{ fontSize: 11, color: T.green, marginTop: 2 }}>🔗 {orcVinculado.id}</div>}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Financial bars */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 14 }}>
            {[
              { l: "Custo", v: custoPago, c: T.amber },
              { l: "Saldo Atividade", v: saldo, c: saldo < 0 ? T.red : T.cyan },
            ].map(({ l, v, c }) => (
              <div key={l}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: T.txMut }}>{l}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{fmt(v)}</span>
                </div>
                <ProgBar v={Math.abs(v)} max={budget} color={c} />
                <div style={{ fontSize: 12, color: T.txMut, marginTop: 2 }}>{`${pct(Math.abs(v), budget)}% do budget`}</div>
              </div>
            ))}
          </div>

          {/* Avanço físico */}
          <div style={{ background: T.bg3, borderRadius: 9, padding: "11px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: T.txSec, fontWeight: 600 }}>Avanço Físico</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {(() => {
                  const fromEtapas = calcAvancoFisicoEtapas(obra.etapas || []);
                  const efetivo = getAvancoEfetivo(obra);
                  return <>
                    {fromEtapas > 0 && !obra.avancoFisicoManual && (
                      <span style={{ fontSize: 11, color: T.green, background: T.green + "18", padding: "2px 6px", borderRadius: 4 }}>auto (etapas)</span>
                    )}
                    {fromEtapas === 0 && !obra.avancoFisicoManual && (
                      <span style={{ fontSize: 11, color: T.blue, background: T.blue + "18", padding: "2px 6px", borderRadius: 4 }}>auto (datas)</span>
                    )}
                    <input type="range" min={0} max={100} value={efetivo} onChange={e => updateAvancoFisico(obra.id, e.target.value)} style={{ width: 100 }} />
                    {obra.avancoFisicoManual && (
                      <button title="Recalcular automaticamente" onClick={() => updateProjectRecord(obra.id, project => ({ ...project, avancoFisicoManual: false }))}
                        style={{ fontSize: 11, color: T.amber, background: "none", border: `1px solid ${T.amber}40`, borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>↺ auto</button>
                    )}
                    <span style={{ fontSize: 18, fontWeight: 900, color: efetivo === 100 ? T.green : T.blue, minWidth: 40, textAlign: "right" }}>{efetivo}%</span>
                  </>;
                })()}
              </div>
            </div>
            <ProgBar v={getAvancoEfetivo(obra)} max={100} color={getAvancoEfetivo(obra) === 100 ? T.green : T.blue} />
          </div>
        </div>

        {/* Inner tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 16, background: T.bg3, padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
          {[
            { id: "resumo", l: "📋 Resumo" },
            { id: "orcamento", l: "📦 Orçamento" },
            { id: "financeiro", l: "💰 Financeiro", badge: (obra.nfs?.length || 0) + (obra.adiantamentos?.length || 0) + (obra.despesasGerais?.length || 0) },
            { id: "cronograma", l: "📅 Cronograma" },
            { id: "medicao", l: "📏 Medição" },
            { id: "comentarios", l: "💬 Histórico" },
          ].map(({ id, l, badge }) => (
            <button key={id} onClick={() => setObraTab(id)}
              style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: obraTab === id ? 700 : 400, background: obraTab === id ? T.bg0 : "transparent", color: obraTab === id ? T.blue : T.txMut, display: "flex", alignItems: "center", gap: 5 }}>
              {l}
              {badge > 0 && <span style={{ background: T.amber, color: "#000", borderRadius: 8, padding: "0 5px", fontSize: 11, fontWeight: 800 }}>{badge}</span>}
            </button>
          ))}
        </div>

        {/* RESUMO */}
        {obraTab === "resumo" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri }}>📦 Itens do Orçamento</div>
                {orcVinculado && <span style={{ fontSize: 11, background: T.blue + "18", color: T.blue, border: `1px solid ${T.blue}40`, padding: "2px 8px", borderRadius: 5, fontWeight: 700 }}>
                  ORC: {orcVinculado.id}
                </span>}
              </div>
              {/* Mostra itens do orçamento vinculado se existir, senão itens manuais da medição */}
              {orcVinculado?.blocos?.length > 0 ? (() => {
                const todosItens = orcVinculado.blocos.flatMap(b => b.itens.map(it => ({ ...it, blocoNome: b.sharingNome || b.tipo, bloco: b, _fin: calcItemFinancials(it) })));
                return todosItens.length === 0
                  ? <div style={{ color: T.txMut, fontSize: 14, textAlign: "center", padding: 20 }}>Orçamento vinculado sem itens.</div>
                  : todosItens.map((item, idx) => {
                    const f = item._fin;
                    const hasDisc = f.discountPct > 0;
                    return (
                    <div key={item.id || idx} style={{ background: T.bg3, borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: `1px solid ${T.brSub}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, marginRight: 6 }}>{item.categoria || item.cod}</span>
                          <span style={{ fontSize: 13, color: T.txSec }}>{item.descricao}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginLeft: 8, whiteSpace: "nowrap" }}>{fmt(f.totalNet)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.txMut, display: "flex", gap: 8, alignItems: "center" }}>
                        <span>{item.qtde} {item.unid} × {fmt(f.unitNet)}</span>
                        {hasDisc && <span style={{ color: T.red, fontSize: 11 }}>(-{f.discountPct.toFixed(1)}% desc.)</span>}
                        {hasDisc && <span style={{ color: T.txDis, textDecoration: "line-through", fontSize: 11 }}>{fmt(f.unitBase)}</span>}
                      </div>
                    </div>
                    );
                  });
              })() : obra.itens?.length > 0 ? obra.itens.map(item => {
                  const p = pct(item.qtdeMed || 0, item.qtde);
                  return (
                    <div key={item.id} style={{ background: T.bg3, borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: `1px solid ${T.brSub}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: (CAT_COLOR[item.tipo] || T.blue) }}>{item.tipo} </span>
                          <span style={{ fontSize: 13, color: T.txSec }}>{item.descricao}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginLeft: 8, whiteSpace: "nowrap" }}>{fmt(item.vlUnit * item.qtde)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ProgBar v={item.qtdeMed || 0} max={item.qtde} color={p >= 100 ? T.green : p >= 50 ? T.blue : T.amber} h={4} />
                        <span style={{ fontSize: 12, color: T.txMut, whiteSpace: "nowrap" }}>{item.qtdeMed || 0}/{item.qtde} {item.unid}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: p >= 100 ? T.green : T.amber, minWidth: 30 }}>{p}%</span>
                      </div>
                    </div>
                  );
                }) : (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
                  <div style={{ color: T.txMut, fontSize: 13 }}>Nenhum orçamento vinculado.</div>
                  <div style={{ color: T.txDis, fontSize: 12, marginTop: 4 }}>Vincule um orçamento ou adicione itens na aba Medição.</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri }}>💳 Últimas NFs</div>
                  <button onClick={() => setObraTab("nfs")} style={{ fontSize: 13, color: T.blue, background: "none", border: "none", cursor: "pointer" }}>ver todas →</button>
                </div>
                {(obra.nfs || []).length === 0 ? <div style={{ color: T.txMut, fontSize: 14, textAlign: "center", padding: 20 }}>Nenhuma NF lançada</div> :
                  (obra.nfs || []).slice(-5).reverse().map(nf => {
                    const c = NF_COLOR[nf.status] || T.txMut;
                    return (
                      <div key={nf.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.brSub}` }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri }}>NF {nf.num}</div>
                          <div style={{ fontSize: 12, color: T.txMut }}>{nf.fornecedor} · {nf.emissao}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>{fmt(nf.valor)}</div>
                          <span style={{ fontSize: 12, background: c + "18", color: c, border: `1px solid ${c}40`, padding: "1px 7px", borderRadius: 4 }}>{nf.status}</span>
                        </div>
                      </div>
                    );
                  })
                }
                <div style={{ marginTop: 12, background: T.bg3, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, color: T.txMut }}>Total Pago</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: T.green }}>{fmt(nfPago)}</span>
                </div>
              </div>

              {/* Preview últimos comentários */}
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri }}>💬 Últimas Atualizações</div>
                  <button onClick={() => setObraTab("comentarios")} style={{ fontSize: 13, color: T.blue, background: "none", border: "none", cursor: "pointer" }}>ver todas →</button>
                </div>
                {(obra.comentarios || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 0" }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>💬</div>
                    <div style={{ fontSize: 13, color: T.txMut }}>Nenhuma atualização ainda</div>
                    <button onClick={() => setObraTab("comentarios")}
                      style={{ ...S.ghost, marginTop: 8, padding: "5px 14px", fontSize: 13 }}>+ Registrar</button>
                  </div>
                ) : (
                  <div>
                    {(obra.comentarios || []).slice(0, 3).map(c => {
                      const TIPOS_COM = [{ id: "Andamento", icon: "📝", color: T.blue }, { id: "Alerta", icon: "⚠️", color: T.amber }, { id: "Concluído", icon: "✅", color: T.green }, { id: "Bloqueio", icon: "🔒", color: T.red }];
                      const t = TIPOS_COM.find(x => x.id === c.tipo) || TIPOS_COM[0];
                      return (
                        <div key={c.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.brSub}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span>{t.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{c.tipo}</span>
                            <span style={{ fontSize: 12, color: T.txMut, marginLeft: "auto" }}>{c.dataHora}</span>
                          </div>
                          <div style={{ fontSize: 13, color: T.txSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.texto}>
                            {c.texto}
                          </div>
                          <div style={{ fontSize: 12, color: T.txMut, marginTop: 2 }}>— {c.autor}</div>
                        </div>
                      );
                    })}
                    {(obra.comentarios || []).length > 3 && (
                      <button onClick={() => setObraTab("comentarios")}
                        style={{ ...S.ghost, width: "100%", marginTop: 8, padding: "5px", fontSize: 13, textAlign: "center" }}>
                        +{(obra.comentarios || []).length - 3} comentário(s) →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ORÇAMENTO TAB */}
        {obraTab === "orcamento" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: T.txPri }}>📦 Itens do Orçamento Vinculado</div>
                <div style={{ fontSize: 13, color: T.txMut, marginTop: 2 }}>
                  {orcVinculado ? `Orçamento: ${orcVinculado.id}` : "Nenhum orçamento vinculado"}
                </div>
              </div>
              {!orcVinculado && (
                <button onClick={() => { setBudgetLinkTargetId(null); setBudgetLinkProjectId(obra.id); setShowBudgetLinkModal(true); }}
                  style={{ ...S.btn, background: T.blueD }}>🔗 Vincular Orçamento</button>
              )}
            </div>

            {!orcVinculado ? (
              <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.txSec, marginBottom: 6 }}>Nenhum orçamento vinculado a esta atividade</div>
                <div style={{ fontSize: 13, color: T.txMut, marginBottom: 20 }}>Vincule um orçamento aprovado para visualizar os itens, controlar gastos por item e comparar planejado × executado.</div>
                <button onClick={() => { setBudgetLinkTargetId(null); setBudgetLinkProjectId(obra.id); setShowBudgetLinkModal(true); }}
                  style={{ ...S.btn, background: T.blueD }}>🔗 Vincular Orçamento</button>
              </div>
            ) : (() => {
              const todosItens = orcVinculado.blocos?.flatMap(b => b.itens.map(it => ({ ...it, blocoNome: b.sharingNome || b.tipo, bloco: b, _fin: calcItemFinancials(it) }))) || [];
              const totalOrc = todosItens.reduce((s, it) => s + it._fin.totalNet, 0);
              const totalGasto = (obra.nfs || []).reduce((s, n) => s + n.valor, 0) + (obra.adiantamentos || []).reduce((s, a) => s + a.valor, 0) + (obra.despesasGerais || []).reduce((s, d) => s + d.valor, 0);
              const saldo = totalOrc - totalGasto;

              return (
                <div>
                  {/* KPIs */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
                    {[
                      { l: "Valor Orçado", v: fmt(totalOrc), c: T.blue },
                      { l: "Total Gasto", v: fmt(totalGasto), c: T.amber },
                      { l: "Saldo Disponível", v: fmt(saldo), c: saldo >= 0 ? T.green : T.red },
                    ].map(({ l, v, c }) => (
                      <div key={l} style={{ ...cardTint(c), borderRadius: 9, padding: "10px 16px", borderLeft: `3px solid ${c}` }}>
                        <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 4 }}>{l.toUpperCase()}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {todosItens.length === 0 ? (
                    <div style={{ ...S.card, textAlign: "center", padding: 30, color: T.txMut }}>Orçamento vinculado não contém itens.</div>
                  ) : (
                    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: T.bg3, borderBottom: `1px solid ${T.brBase}` }}>
                            {["CÓDIGO", "CATEGORIA", "DESCRIÇÃO", "UNID", "QTD", "VL UNIT.", "DESCONTO", "VL LÍQUIDO", "TOTAL", "BLOCO"].map(h => (
                              <th key={h} style={{ padding: "9px 12px", textAlign: h === "DESCRIÇÃO" || h === "CATEGORIA" ? "left" : "right", fontSize: 11, fontWeight: 700, color: T.amber, letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {todosItens.map((it, idx) => {
                            const f = it._fin;
                            const hasDisc = f.discountPct > 0;
                            return (
                              <tr key={it.id || idx} style={{ borderBottom: `1px solid ${T.brSub}`, background: idx % 2 === 0 ? "transparent" : T.bg3 + "50" }}>
                                <td style={{ padding: "8px 12px", color: T.blue, fontWeight: 700, whiteSpace: "nowrap" }}>{it.cod}</td>
                                <td style={{ padding: "8px 12px" }}><span style={{ background: T.amber + "18", color: T.amber, borderRadius: 4, padding: "1px 7px", fontSize: 12 }}>{it.categoria}</span></td>
                                <td style={{ padding: "8px 12px", color: T.txSec, maxWidth: 260 }}>
                                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.descricao}>{it.descricao}</div>
                                </td>
                                <td style={{ padding: "8px 12px", color: T.txMut, textAlign: "right" }}>{it.unid}</td>
                                <td style={{ padding: "8px 12px", color: T.txSec, textAlign: "right" }}>{it.qtde}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                                  {hasDisc
                                    ? <span style={{ color: T.txMut, textDecoration: "line-through", fontSize: 12 }}>{fmt(f.unitBase)}</span>
                                    : <span style={{ color: T.txSec }}>{fmt(f.unitBase)}</span>}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                                  {hasDisc
                                    ? <span style={{ color: T.red, fontSize: 12 }}>-{fmt(f.discountUnit)} <span style={{ color: T.red + "90", fontSize: 11 }}>({f.discountPct.toFixed(1)}%)</span></span>
                                    : <span style={{ color: T.txDis, fontSize: 12 }}>—</span>}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap", color: hasDisc ? T.green : T.txSec, fontWeight: hasDisc ? 700 : 400 }}>{fmt(f.unitNet)}</td>
                                <td style={{ padding: "8px 12px", fontWeight: 700, color: T.txPri, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(f.totalNet)}</td>
                                <td style={{ padding: "8px 12px" }}><span style={{ fontSize: 11, color: T.txMut }}>{it.blocoNome}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: `2px solid ${T.brBase}`, background: T.bg3 }}>
                            <td colSpan={8} style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: T.txMut }}>TOTAL GERAL</td>
                            <td style={{ padding: "10px 12px", fontSize: 15, fontWeight: 900, color: T.blue, textAlign: "right", whiteSpace: "nowrap" }}>{fmt(totalOrc)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* FINANCEIRO TAB */}
        {obraTab === "financeiro" && (() => {
          const adts = obra.adiantamentos || [];
          const despGs = obra.despesasGerais || [];
          const totalAdts = adts.reduce((s, a) => s + a.valor, 0);
          const totalDespGs = despGs.reduce((s, d) => s + d.valor, 0);
          const adtPagoTotal = calcPagamentosServicoPago(obra);
          const despesaConfirmadaTotal = calcDespesasGeraisConfirmadas(obra);
          const pendentes = adts.filter(a => a.status === "Solicitado" || a.status === "Pendente Aprovação").length;
          const PAG_COLOR = { "Solicitado": T.amber, "Aprovado": T.blue, "Programado": T.cyan, "Pago": T.green, "Pendente de Comprovante": T.orange, "Cancelado": T.red, "Pendente Aprovação": T.amber };
          const DESP_G_ICON = { "Combustível": "⛽", "Alimentação / Diária": "🍽️", "Frete / Transporte": "🚚", "Estacionamento / Pedágio": "🅿️", "Material de Pequeno Valor": "🧰", "Taxa / Cartório": "📋", "Hospedagem": "🏨", "Outros": "📎" };
          const subTab = despesasSubTab;
          const setSubTab = setDespesasSubTab;
          const totalGeral = calcCustoPagoEfetivo(obra);
          const budget = calcBudgetEfetivo(obra);
          const saldo = calcSaldoProjeto(obra);
          return (
            <div>
              {/* KPIs topo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { l: "NFs Pagas", v: fmt(nfPago), c: T.blue, n: (obra.nfs || []).length, sub: "materiais" },
                  { l: "Serviços Pagos", v: fmt(adtPagoTotal), c: T.amber, n: adts.length, sub: "servicos" },
                  { l: "Despesas Confirmadas", v: fmt(despesaConfirmadaTotal), c: T.orange, n: despGs.length, sub: "despesas" },
                  { l: "Saldo da Atividade", v: fmt(saldo), c: saldo >= 0 ? T.green : T.red, n: null, sub: null },
                ].map(({ l, v, c, n, sub }) => (
                  <div key={l} onClick={() => sub && setSubTab(sub)}
                    style={{ ...cardTint(c), borderRadius: 9, padding: "10px 14px", borderLeft: `3px solid ${c}`, cursor: sub ? "pointer" : "default" }}>
                    <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                      <span>{l.toUpperCase()}</span>
                      {n != null && <span style={{ background: c + "20", color: c, borderRadius: 8, padding: "0 6px" }}>{n}</span>}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Subtabs */}
              <div style={{ display: "flex", gap: 2, marginBottom: 14, background: T.bg3, padding: 3, borderRadius: 8, width: "fit-content" }}>
                {[
                  { id: "materiais", l: "📄 NF de Material", badge: (obra.nfs || []).length, cor: T.blue },
                  { id: "servicos", l: "💸 Pagamentos", badge: pendentes, cor: T.amber },
                  { id: "despesas", l: "🧾 Despesas Gerais", badge: despGs.length, cor: T.orange },
                ].map(({ id, l, badge, cor }) => (
                  <button key={id} onClick={() => setSubTab(id)}
                    style={{
                      padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13,
                      fontWeight: subTab === id ? 700 : 400,
                      background: subTab === id ? T.bg0 : "transparent",
                      color: subTab === id ? cor : T.txMut,
                      display: "flex", alignItems: "center", gap: 5
                    }}>
                    {l}
                    {badge > 0 && <span style={{ background: cor, color: "#000", borderRadius: 8, padding: "0 5px", fontSize: 11, fontWeight: 800 }}>{badge}</span>}
                  </button>
                ))}
              </div>

              {/* ── SUB: NF de Material ── */}
              {subTab === "materiais" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 14, color: T.txSec }}>{(obra.nfs || []).length} documento(s) · <span style={{ color: T.green, fontWeight: 700 }}>{fmt(nfPago)} pago</span></span>
                    <button onClick={() => { setDespesaForm(despesaFormInit); setNfModalTipo("nf"); setShowNFModal(true); }} style={S.btn}>+ Registrar NF Paga / Recibo</button>
                  </div>
                  {(obra.nfs || []).length === 0 ? (
                    <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                      <div style={{ color: T.txMut, fontSize: 14 }}>Nenhuma NF paga registrada.</div>
                    </div>
                  ) : (obra.nfs || []).map(nf => {
                    const c = NF_COLOR[nf.status] || T.txMut;
                    const cc = CAT_COLOR[nf.categoria] || T.blue;
                    const comprovanteNF = getComprovanteArquivo(nf);
                    const hasComprovanteNF = hasComprovanteArquivo(nf);
                    return (
                      <div key={nf.id} style={{ ...S.card, borderLeft: `3px solid ${c}`, marginBottom: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16 }}>
                          <div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: T.txPri }}>NF {nf.num}</span>
                              <span style={{ background: c + "18", color: c, border: `1px solid ${c}40`, padding: "2px 9px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{nf.status}</span>
                              <span style={{ background: cc + "18", color: cc, padding: "2px 9px", borderRadius: 5, fontSize: 12 }}>{nf.categoria}</span>
                            </div>
                            <div style={{ fontSize: 14, color: T.txSec, marginBottom: 6 }}>{nf.desc}</div>
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                              {[{ l: "Fornecedor", v: nf.fornecedor }, { l: "CNPJ", v: nf.cnpj }, { l: "Emissão", v: nf.emissao }, { l: "Vencimento", v: nf.vencimento }].filter(x => x.v).map(({ l, v }) => (
                                <span key={l} style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>{l}: </span><span style={{ color: nf.status === "Em Atraso" && l === "Vencimento" ? T.red : T.txSec }}>{v}</span></span>
                              ))}
                              {nf.vinculo && <span style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Vínculo: </span><span style={{ color: T.blue }}>{nf.vinculo}</span></span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: c, letterSpacing: "-0.02em" }}>{fmt(nf.valor)}</div>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
                              {["Aguardando Pagamento", "Lançada", "A Pagar", "Pendente"].includes(nf.status) && (
                                <button onClick={() => pagarNF(obra.id, nf.id)} style={{ ...S.btn, padding: "5px 12px", fontSize: 13, background: T.greenD }}>✓ Pagar</button>
                              )}
                              {nf.status === "Pago" && !hasComprovanteNF && (
                                <label style={{ ...S.btn, padding: "5px 12px", fontSize: 13, background: T.bg4, cursor: "pointer" }}>
                                  📎 Comprovante
                                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }}
                                    onChange={e => e.target.files[0] && anexarComprovanteNF(obra.id, nf.id, e.target.files[0])} />
                                </label>
                              )}
                              {hasComprovanteNF && comprovanteNF && (
                                <a href={comprovanteNF.data} download={comprovanteNF.name}
                                  style={{ ...S.btn, padding: "5px 12px", fontSize: 13, background: T.green + "30", color: T.green, textDecoration: "none" }}>
                                  ✅ {comprovanteNF.name.substring(0, 15)}{comprovanteNF.name.length > 15 ? "…" : ""}
                                </a>
                              )}
                              <button onClick={() => openEditDespesa(nf, "nf")}
                                style={{ ...S.ghost, padding: "5px 10px", fontSize: 13 }}>✏️</button>
                              <button onClick={() => setProjetos(prev => prev.map(p => p.id === obra.id ? { ...p, nfs: p.nfs.filter(n => n.id !== nf.id) } : p))}
                                style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "5px 10px", fontSize: 13 }}>🗑️</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── SUB: Pagamentos de Serviço ── */}
              {subTab === "servicos" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 14, color: T.txSec }}>{adts.length} pagamento(s) · <span style={{ color: T.amber, fontWeight: 700 }}>{fmt(totalAdts)}</span></span>
                      {pendentes > 0 && <span style={{ background: T.amber + "20", color: T.amber, border: `1px solid ${T.amber}40`, borderRadius: 7, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>⏳ {pendentes} pendente(s)</span>}
                      {/* Filtro tipo favorecido */}
                      <div style={{ display: "flex", gap: 3 }}>
                        {[["todos", "Todos"], ["funcionario", "👷 Funcionários"], ["prestador", "🏢 Prestadores"]].map(([k, l]) => (
                          <button key={k} onClick={() => setPagTipoFavorecido(k)}
                            style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${pagTipoFavorecido === k ? T.amber : T.brBase}`, background: pagTipoFavorecido === k ? T.amber + "18" : "transparent", color: pagTipoFavorecido === k ? T.amber : T.txMut, fontSize: 12, cursor: "pointer", fontWeight: pagTipoFavorecido === k ? 700 : 400 }}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => { setDespesaForm(despesaFormInit); setNfModalTipo("pagamento"); setShowNFModal(true); }}
                      style={{ ...S.btn, background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
                      💸 Registrar Pagamento
                    </button>
                  </div>
                  {(() => {
                    const adtsFiltrados = pagTipoFavorecido === "todos" ? adts
                      : adts.filter(a => {
                        const isFuncCad = funcionarios.some(f => f.nome === a.funcionario);
                        return pagTipoFavorecido === "funcionario" ? isFuncCad : !isFuncCad;
                      });
                    return adtsFiltrados.length === 0 ? (
                      <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>💸</div>
                        <div style={{ fontSize: 13, color: T.txSec, marginBottom: 4 }}>Nenhum pagamento registrado</div>
                        <div style={{ fontSize: 13, color: T.txMut, marginBottom: 16 }}>Prestador, funcionário, mão de obra, diárias e reembolsos</div>
                        <button onClick={() => { setDespesaForm(despesaFormInit); setNfModalTipo("pagamento"); setShowNFModal(true); }}
                          style={{ ...S.btn, background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>💸 Registrar Primeiro Pagamento</button>
                      </div>
                    ) : adtsFiltrados.map(adt => {
                      const sc = PAG_COLOR[adt.status] || T.txMut;
                      const tipoLabel = adt.adtTipo === "Outros" ? (adt.adtOutroDesc || "Outros") : (adt.adtTipo || adt.tipo || "Serviço");
                      const isFuncCad = funcionarios.some(f => f.nome === adt.funcionario);
                      const comprovanteAdt = getComprovanteArquivo(adt);
                      const hasComprovanteAdt = hasComprovanteArquivo(adt);
                      return (
                        <div key={adt.id} style={{ ...S.card, borderLeft: `3px solid ${sc}`, marginBottom: 10 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
                            <div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 13, fontWeight: 800, color: T.txPri }}>{adt.funcionario}</span>
                                <span style={{ background: (isFuncCad ? T.blue : T.purple) + "18", color: isFuncCad ? T.blue : T.purple, border: `1px solid ${isFuncCad ? T.blue : T.purple}40`, padding: "1px 7px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{isFuncCad ? "👷 Funcionário" : "🏢 Prestador"}</span>
                                <span style={{ background: sc + "18", color: sc, border: `1px solid ${sc}40`, padding: "2px 9px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{adt.status}</span>
                                <span style={{ fontSize: 12, color: T.txMut, background: T.bg3, borderRadius: 4, padding: "1px 7px" }}>{tipoLabel}</span>
                              </div>
                              <div style={{ fontSize: 13, color: T.txSec, marginBottom: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
                                <span><span style={{ color: T.txMut }}>Data: </span>{adt.data}</span>
                                {adt._pagtoInfo && <span><span style={{ color: T.txMut }}>Pgto: </span>{adt._pagtoInfo}</span>}
                              </div>
                              {adt.justificativa && <div style={{ fontSize: 13, color: T.txMut, background: T.bg3, borderRadius: 6, padding: "6px 10px" }}>💬 {adt.justificativa}</div>}
                              {adt.status === "Pago" && !hasComprovanteAdt && (
                                <div style={{ marginTop: 6, fontSize: 12, color: T.orange, background: T.orange + "15", borderRadius: 5, padding: "4px 10px", display: "inline-block" }}>
                                  ⚠️ Pago sem comprovante anexado
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 20, fontWeight: 900, color: sc, marginBottom: 8 }}>{fmt(adt.valor)}</div>
                              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                {["Solicitado", "Pendente Aprovação"].includes(adt.status) && <button onClick={() => aprovarAdiantamento(obra.id, adt.id)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12, background: T.blueD }}>✓ Aprovar</button>}
                                {adt.status === "Aprovado" && <button onClick={() => pagarAdiantamento(obra.id, adt.id)} style={{ ...S.btn, padding: "5px 10px", fontSize: 12, background: T.greenD }}>💰 Pagar</button>}
                                {(adt.status === "Pago" || adt.status === "Pendente de Comprovante") && !hasComprovanteAdt && (
                                  <label style={{ ...S.btn, padding: "5px 10px", fontSize: 12, background: T.orange + "30", color: T.orange, cursor: "pointer" }}>
                                    📎 Comprovante
                                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={e => {
                                      const file = e.target.files[0]; if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = ev => {
                                        const comprovante = { name: file.name, data: ev.target.result };
                                        setProjetos(prev => prev.map(p => p.id === obra.id ? {
                                          ...p,
                                          adiantamentos: (p.adiantamentos || []).map(a => a.id === adt.id ? {
                                            ...a,
                                            status: "Pago",
                                            comprovante,
                                            anexoComprovante: comprovante,
                                            anexoTC: comprovante
                                          } : a)
                                        } : p));
                                      };
                                      reader.readAsDataURL(file);
                                    }} />
                                  </label>
                                )}
                                {hasComprovanteAdt && comprovanteAdt && (
                                  <a href={comprovanteAdt.data} download={comprovanteAdt.name}
                                    style={{ ...S.btn, padding: "5px 10px", fontSize: 12, background: T.green + "30", color: T.green, textDecoration: "none" }}>
                                    ✅ {comprovanteAdt.name.substring(0, 12)}{comprovanteAdt.name.length > 12 ? "…" : ""}
                                  </a>
                                )}
                                <button onClick={() => openEditDespesa(adt, "pagamento")}
                                  style={{ ...S.ghost, padding: "5px 9px", fontSize: 13 }}>✏️</button>
                                <button onClick={() => deletarAdiantamento(obra.id, adt.id)} style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "5px 9px", fontSize: 13 }}>🗑️</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* ── SUB: Despesas Gerais ── */}
              {subTab === "despesas" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 14, color: T.txSec }}>{despGs.length} despesa(s) · <span style={{ color: T.orange, fontWeight: 700 }}>{fmt(totalDespGs)}</span></span>
                    <button onClick={() => { setDespesaForm(despesaFormInit); setNfModalTipo("despesa"); setShowNFModal(true); }}
                      style={{ ...S.btn, background: "linear-gradient(135deg,#b45309,#f59e0b)" }}>
                      🧾 Lançar Despesa
                    </button>
                  </div>
                  {despGs.length === 0 ? (
                    <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
                      <div style={{ fontSize: 13, color: T.txSec, marginBottom: 4 }}>Nenhuma despesa geral lançada</div>
                      <div style={{ fontSize: 13, color: T.txMut, marginBottom: 16 }}>Combustível, alimentação, frete, estacionamento, taxas e outros</div>
                      <button onClick={() => { setDespesaForm(despesaFormInit); setNfModalTipo("despesa"); setShowNFModal(true); }}
                        style={{ ...S.btn, background: "linear-gradient(135deg,#b45309,#f59e0b)" }}>🧾 Lançar Primeira Despesa</button>
                    </div>
                  ) : despGs.map(dg => {
                    const DSTC = { "Lançada": T.blue, "Validada": T.green, "Reembolsada": T.purple, "Cancelada": T.red };
                    const sc = DSTC[dg.status] || T.txMut;
                    const ic = DESP_G_ICON[dg.despesaTipo] || "📎";
                    return (
                      <div key={dg.id} style={{ ...S.card, borderLeft: `3px solid ${sc}`, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 16 }}>{ic}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: T.txPri }}>{dg.despesaTipo}</span>
                              <span style={{ background: sc + "18", color: sc, border: `1px solid ${sc}40`, padding: "2px 8px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{dg.status}</span>
                            </div>
                            <div style={{ fontSize: 13, color: T.txSec, marginBottom: 3 }}>{dg.desc}</div>
                            <div style={{ fontSize: 12, color: T.txMut, display: "flex", gap: 12 }}>
                              <span>📅 {dg.data}</span>
                              {dg._pagtoInfo && <span>💳 {dg._pagtoInfo}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: sc, marginBottom: 6 }}>{fmt(dg.valor)}</div>
                            <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                              {dg.status === "Lançada" && <button onClick={() => setProjetos(prev => prev.map(p => p.id === obra.id ? { ...p, despesasGerais: (p.despesasGerais || []).map(d => d.id === dg.id ? { ...d, status: "Validada" } : d) } : p))}
                                style={{ ...S.btn, padding: "4px 10px", fontSize: 12, background: T.greenD }}>✓ Validar</button>}
                              {!dg.comprovante && (
                                <label style={{ ...S.btn, padding: "4px 10px", fontSize: 12, background: T.bg4, cursor: "pointer" }}>
                                  📎
                                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={e => {
                                    const file = e.target.files[0]; if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = ev => setProjetos(prev => prev.map(p => p.id === obra.id ? { ...p, despesasGerais: (p.despesasGerais || []).map(d => d.id === dg.id ? { ...d, comprovante: { name: file.name, data: ev.target.result } } : d) } : p));
                                    reader.readAsDataURL(file);
                                  }} />
                                </label>
                              )}
                              {dg.comprovante && (
                                <a href={dg.comprovante.data} download={dg.comprovante.name}
                                  style={{ ...S.btn, padding: "4px 10px", fontSize: 12, background: T.green + "30", color: T.green, textDecoration: "none" }}>
                                  ✅
                                </a>
                              )}
                              <button onClick={() => openEditDespesa(dg, "despesa")}
                                style={{ ...S.ghost, padding: "4px 9px", fontSize: 13 }}>✏️</button>
                              <button onClick={() => setProjetos(prev => prev.map(p => p.id === obra.id ? { ...p, despesasGerais: (p.despesasGerais || []).filter(d => d.id !== dg.id) } : p))}
                                style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "4px 9px", fontSize: 13 }}>🗑️</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* CRONOGRAMA TAB */}
        {obraTab === "cronograma" && (() => {
          const etapas = obra.etapas || [];
          // Estados de cronograma já declarados no nível raiz
          const ETAPA_CORES = [T.blue, T.green, T.amber, T.purple, T.orange, T.cyan, T.red];
          const inicioAtividade = getProjectStartDate(obra);
          const fimAtividade = getProjectEndDate(obra);

          // Calcular range do projeto para o Gantt
          const toDate = value => parseProjectDate(value);
          const allDates: Date[] = [];
          [inicioAtividade, fimAtividade].forEach(value => {
            const parsed = toDate(value);
            if (parsed) allDates.push(parsed);
          });
          etapas.forEach(etapa => {
            [etapa.inicio, etapa.fim].forEach(value => {
              const parsed = toDate(value);
              if (parsed) allDates.push(parsed);
            });
          });
          const minDate = allDates.length ? new Date(Math.min(...allDates.map(date => date.getTime()))) : new Date();
          const maxDate = allDates.length ? new Date(Math.max(...allDates.map(date => date.getTime()))) : new Date(Date.now() + 30 * 86400000);
          const totalDays = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / 86400000)) + 7;

          const dayPct = (dateStr) => {
            const d = toDate(dateStr);
            if (!d) return 0;
            return Math.max(0, Math.min(100, Math.round((d.getTime() - minDate.getTime()) / 86400000 / totalDays * 100)));
          };
          const widthPct = (ini, fim) => {
            const d1 = toDate(ini), d2 = toDate(fim);
            if (!d1 || !d2) return 5;
            return Math.max(2, Math.round((d2.getTime() - d1.getTime()) / 86400000 / totalDays * 100));
          };
          const fmtD = d => d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";
          const updateTimelineField = (field, rawValue) => {
            const nextValue = isoDateToBr(rawValue);
            updateProjectRecord(projetoSel, project => {
              const next = { ...project, [field]: nextValue, avancoFisicoManual: false };
              if (field === "dataFimAtividade" && nextValue) {
                next.avancoFisico = 100;
              }
              return next;
            });
          };
          const openNewEtapa = () => {
            resetEtapaForm();
            setShowEtapaModal(true);
          };
          const openEditEtapa = (etapa) => {
            setEditingEtapaId(etapa.id);
            setEtapaForm({
              nome: etapa.nome || "",
              grupo: etapa.grupo || "",
              responsavel: etapa.responsavel || "",
              inicio: etapa.inicio || "",
              fim: etapa.fim || "",
              progresso: Number(etapa.progresso || 0),
              cor: etapa.cor || T.blue
            });
            setShowEtapaModal(true);
          };
          const closeEtapaModal = () => {
            setShowEtapaModal(false);
            resetEtapaForm();
          };

          const saveEtapa = () => {
            if (!String(etapaForm.nome || "").trim()) return;
            const etapaPayload = {
              ...etapaForm,
              nome: String(etapaForm.nome || "").trim(),
              grupo: String(etapaForm.grupo || "").trim(),
              responsavel: String(etapaForm.responsavel || "").trim(),
              inicio: isoDateToBr(etapaForm.inicio),
              fim: isoDateToBr(etapaForm.fim),
              progresso: Math.max(0, Math.min(100, Number(etapaForm.progresso) || 0)),
              cor: etapaForm.cor || T.blue
            };
            updateProjectRecord(projetoSel, project => {
              const etapasAtualizadas = editingEtapaId
                ? (project.etapas || []).map(etapa => etapa.id === editingEtapaId ? { ...etapa, ...etapaPayload } : etapa)
                : [...(project.etapas || []), { id: `et_${Date.now()}`, ...etapaPayload }];
              return { ...project, etapas: etapasAtualizadas, avancoFisicoManual: false };
            });
            closeEtapaModal();
          };
          const deleteEtapa = id => updateProjectRecord(projetoSel, project => ({
            ...project,
            etapas: (project.etapas || []).filter(e => e.id !== id),
            avancoFisicoManual: false,
          }));
          const updateEtapaProgress = (id, val) => updateProjectRecord(projetoSel, project => ({
            ...project,
            etapas: (project.etapas || []).map(e => e.id === id ? { ...e, progresso: Number(val) } : e),
            avancoFisicoManual: false,
          }));

          return (
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>📅 Cronograma da Obra</div>
                  <div style={{ fontSize: 13, color: T.txMut, marginTop: 2 }}>{etapas.length} etapa(s) cadastrada(s)</div>
                </div>
                <button onClick={openNewEtapa} style={S.btn}>+ Nova Etapa</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ ...S.card, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>DATA DE ACIONAMENTO</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.txPri }}>{dataAcionamento || "—"}</div>
                  <div style={{ fontSize: 12, color: T.txMut, marginTop: 6 }}>Registrada na criação da atividade</div>
                </div>
                <div style={{ ...S.card, padding: "12px 14px" }}>
                  <label style={S.label}>Início da Atividade</label>
                  <input
                    type="date"
                    value={brDateToIso(inicioAtividade)}
                    onChange={e => updateTimelineField("dataInicioAtividade", e.target.value)}
                    style={{ ...S.input, marginTop: 6 }}
                  />
                </div>
                <div style={{ ...S.card, padding: "12px 14px" }}>
                  <label style={S.label}>Data Final</label>
                  <input
                    type="date"
                    value={brDateToIso(fimAtividade)}
                    onChange={e => updateTimelineField("dataFimAtividade", e.target.value)}
                    style={{ ...S.input, marginTop: 6 }}
                  />
                </div>
              </div>

              {etapas.length === 0 ? (
                <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
                  <div style={{ fontSize: 13, color: T.txSec, marginBottom: 6 }}>Nenhuma etapa cadastrada</div>
                  <div style={{ fontSize: 13, color: T.txMut, marginBottom: 18 }}>Adicione as etapas do cronograma para visualizar o Gantt</div>
                  <button onClick={openNewEtapa} style={S.btn}>+ Adicionar Primeira Etapa</button>
                </div>
              ) : (
                <>
                  {/* ── Lista de etapas ── */}
                  <div style={{ ...S.card, marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.txMut, marginBottom: 12, letterSpacing: "0.05em" }}>LISTA DE ETAPAS</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                        {["Etapa", "Grupo", "Responsável", "Início", "Fim", "Progresso", ""].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: T.txMut, fontWeight: 700, fontSize: 12, letterSpacing: "0.05em" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {etapas.map((e, i) => (
                          <tr key={e.id} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 === 0 ? "transparent" : T.bg1 + "40" }}>
                            <td style={{ padding: "8px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 3, background: e.cor || T.blue, flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, color: T.txPri }}>{e.nome}</span>
                              </div>
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {e.grupo && <span style={{ background: (e.cor || T.blue) + "22", color: e.cor || T.blue, border: `1px solid ${e.cor || T.blue}40`, borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{e.grupo}</span>}
                            </td>
                            <td style={{ padding: "8px 10px", color: T.txSec }}>{e.responsavel || "—"}</td>
                            <td style={{ padding: "8px 10px", color: T.txSec, whiteSpace: "nowrap" }}>{e.inicio || "—"}</td>
                            <td style={{ padding: "8px 10px", color: T.txSec, whiteSpace: "nowrap" }}>{e.fim || "—"}</td>
                            <td style={{ padding: "8px 10px", minWidth: 140 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <ProgBar v={e.progresso || 0} max={100} color={e.cor || T.blue} h={6} />
                                </div>
                                <input type="number" min={0} max={100} value={e.progresso || 0}
                                  onChange={ev => updateEtapaProgress(e.id, ev.target.value)}
                                  style={{ ...S.input, width: 52, padding: "3px 6px", fontSize: 13, color: e.cor || T.blue, fontWeight: 700, textAlign: "center" }} />
                                <span style={{ fontSize: 12, color: T.txMut }}>%</span>
                              </div>
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => openEditEtapa(e)} style={{ ...S.ghost, padding: "3px 8px", fontSize: 13 }}>✏️</button>
                                <button onClick={() => deleteEtapa(e.id)} style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "3px 8px", fontSize: 13 }}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Gantt ── */}
                  <div style={{ ...S.card, overflowX: "auto" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.txMut, marginBottom: 14, letterSpacing: "0.05em" }}>GRÁFICO DE GANTT</div>
                    {/* Cabeçalho de datas */}
                    {(() => {
                      const labels = [];
                      const step = Math.max(1, Math.floor(totalDays / 8));
                      for (let i = 0; i <= totalDays; i += step) {
                        const d = new Date(minDate.getTime() + i * 86400000);
                        labels.push({ pct: Math.round(i / totalDays * 100), label: fmtD(d) });
                      }
                      return (
                        <div style={{ minWidth: 600 }}>
                          {/* Date ruler */}
                          <div style={{ position: "relative", height: 22, marginLeft: 180, marginBottom: 8, borderBottom: `1px solid ${T.brBase}` }}>
                            {labels.map(({ pct: lp, label }, i) => (
                              <div key={i} style={{ position: "absolute", left: `${lp}%`, transform: "translateX(-50%)", fontSize: 11, color: T.txDis, whiteSpace: "nowrap" }}>{label}</div>
                            ))}
                          </div>
                          {/* Today line */}
                          {(() => {
                            const todayPct = Math.round((Date.now() - minDate.getTime()) / 86400000 / totalDays * 100);
                            if (todayPct < 0 || todayPct > 100) return null;
                            return null; // position will be relative to row
                          })()}
                          {/* Rows */}
                          {etapas.map((e, i) => {
                            const left = dayPct(e.inicio);
                            const w = widthPct(e.inicio, e.fim);
                            const cor = e.cor || T.blue;
                            const prog = e.progresso || 0;
                            return (
                              <div key={e.id} style={{ display: "flex", alignItems: "center", marginBottom: 8, minHeight: 32 }}>
                                {/* Label */}
                                <div style={{ width: 180, flexShrink: 0, fontSize: 13, fontWeight: 600, color: T.txSec, paddingRight: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: cor, marginRight: 6, verticalAlign: "middle" }} />
                                  {e.nome}
                                </div>
                                {/* Track */}
                                <div style={{ flex: 1, position: "relative", height: 24, background: T.bg3, borderRadius: 4, overflow: "hidden" }}>
                                  {/* Today marker */}
                                  {(() => {
                                    const tp = Math.round((Date.now() - minDate.getTime()) / 86400000 / totalDays * 100);
                                    if (tp < 0 || tp > 100) return null;
                                    return <div style={{ position: "absolute", left: `${tp}%`, top: 0, bottom: 0, width: 2, background: T.red, zIndex: 3, opacity: 0.7 }} />;
                                  })()}
                                  {/* Bar background (planned) */}
                                  <div style={{
                                    position: "absolute", left: `${left}%`, width: `${w}%`,
                                    height: "100%", background: cor + "30",
                                    borderRadius: 4, border: `1px solid ${cor}50`,
                                  }} />
                                  {/* Bar fill (progress) */}
                                  <div style={{
                                    position: "absolute", left: `${left}%`, width: `${w * prog / 100}%`,
                                    height: "100%", background: cor + "90",
                                    borderRadius: 4,
                                  }} />
                                  {/* Label inside bar */}
                                  {w > 8 && <div style={{
                                    position: "absolute", left: `${left + 0.5}%`, top: 0, bottom: 0,
                                    display: "flex", alignItems: "center",
                                    fontSize: 11, color: "#fff", fontWeight: 700, pointerEvents: "none",
                                  }}>{prog}%</div>}
                                </div>
                              </div>
                            );
                          })}
                          {/* Legenda hoje */}
                          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.txMut }}>
                            <div style={{ width: 12, height: 3, background: T.red, borderRadius: 2 }} />
                            <span>Hoje</span>
                            <div style={{ width: 20, height: 10, background: T.blue + "30", border: `1px solid ${T.blue}50`, borderRadius: 2, marginLeft: 10 }} />
                            <span>Planejado</span>
                            <div style={{ width: 20, height: 10, background: T.blue + "90", borderRadius: 2 }} />
                            <span>Realizado</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* Modal nova etapa */}
              {showEtapaModal && (
                <div style={{ position: "fixed", inset: 0, background: "#000000c0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700, padding: 16 }}>
                  <div style={{ background: T.bg2, borderRadius: 14, border: `1px solid ${T.brBase}`, padding: 26, width: 480, maxWidth: "100%" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.blue, marginBottom: 18 }}>
                      {editingEtapaId ? "✏️ Editar Etapa do Cronograma" : "📅 Nova Etapa do Cronograma"}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Nome da Etapa</label>
                        <input value={etapaForm.nome} onChange={e => setEtapaField("nome", e.target.value)} style={S.input} placeholder="Ex: Fundação, Estrutura Metálica, Cabeamento..." /></div>
                      <div><label style={S.label}>Grupo / Fase</label>
                        <input value={etapaForm.grupo} onChange={e => setEtapaField("grupo", e.target.value)} style={S.input} placeholder="Ex: Civil, Energia, Aceite..." /></div>
                      <div><label style={S.label}>Responsável</label>
                        <input value={etapaForm.responsavel} onChange={e => setEtapaField("responsavel", e.target.value)} style={S.input} placeholder="Nome" /></div>
                      <div><label style={S.label}>Progresso (%)</label>
                        <input type="number" min={0} max={100} value={etapaForm.progresso} onChange={e => setEtapaField("progresso", e.target.value)} style={S.input} /></div>
                      <div><label style={S.label}>Data de Início</label>
                        <input type="date" value={brDateToIso(etapaForm.inicio)} onChange={e => setEtapaField("inicio", isoDateToBr(e.target.value))} style={S.input} /></div>
                      <div><label style={S.label}>Data de Fim</label>
                        <input type="date" value={brDateToIso(etapaForm.fim)} onChange={e => setEtapaField("fim", isoDateToBr(e.target.value))} style={S.input} /></div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={S.label}>Cor da Etapa</label>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {ETAPA_CORES.map(c => (
                          <button key={c} onClick={() => setEtapaForm(p => ({ ...p, cor: c }))}
                            style={{ width: 28, height: 28, borderRadius: 6, background: c, border: etapaForm.cor === c ? `3px solid #fff` : `2px solid transparent`, cursor: "pointer", flexShrink: 0 }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={closeEtapaModal} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
                      <button onClick={saveEtapa} style={{ ...S.btn, flex: 2, padding: 10 }}>{editingEtapaId ? "✓ Atualizar Etapa" : "✓ Salvar Etapa"}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* MEDIÇÃO TAB */}
        {obraTab === "medicao" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: T.txSec }}>Boletim de Medição · Avanço físico-financeiro por item</div>
              <button onClick={() => { setEditItem(null); setItemForm({ descricao: "", unid: "Und", qtde: 1, vlUnit: 0, qtdeMed: 0, tipo: "Material" }); setShowItemModal(true); }} style={S.btn}>+ Adicionar Item</button>
            </div>
            {obra.itens.length === 0 ? (
              <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📏</div>
                <div style={{ color: T.txMut }}>Adicione itens do orçamento para iniciar a medição</div>
              </div>
            ) : (
              <div style={S.card}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                      {["Descrição", "Tipo", "Unid", "Orc.", "Medido", "Saldo", "% Físico", "VL Orc.", "VL Med.", "VL Saldo", "Ação"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.txMut, fontWeight: 700, fontSize: 12, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {obra.itens.map((item, i) => {
                        const p = pct(item.qtdeMed || 0, item.qtde);
                        const vlOrc = item.qtde * item.vlUnit;
                        const vlMed = (item.qtdeMed || 0) * item.vlUnit;
                        const cc = CAT_COLOR[item.tipo] || T.blue;
                        return (
                          <tr key={item.id} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 === 0 ? "transparent" : T.bg1 + "50" }}>
                            <td style={{ padding: "9px 10px", color: T.txSec, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.descricao}>{item.descricao}</td>
                            <td style={{ padding: "9px 10px" }}><span style={{ background: cc + "20", color: cc, padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{item.tipo}</span></td>
                            <td style={{ padding: "9px 10px", color: T.txMut }}>{item.unid}</td>
                            <td style={{ padding: "9px 10px", color: T.txPri, fontWeight: 600 }}>{item.qtde}</td>
                            <td style={{ padding: "9px 10px" }}>
                              <input type="number" min={0} max={item.qtde} step={0.01} value={item.qtdeMed || 0}
                                onChange={e => updateMedicao(obra.id, item.id, e.target.value)}
                                style={{ ...S.input, width: 70, padding: "4px 8px", color: T.green, fontWeight: 700 }} />
                            </td>
                            <td style={{ padding: "9px 10px", color: item.qtde - (item.qtdeMed || 0) === 0 ? T.green : T.amber, fontWeight: 600 }}>{(item.qtde - (item.qtdeMed || 0)).toFixed(2)}</td>
                            <td style={{ padding: "9px 10px", minWidth: 110 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.bg4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${p}%`, background: p >= 100 ? T.green : p >= 50 ? T.blue : T.amber, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: p >= 100 ? T.green : T.amber, minWidth: 28 }}>{p}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "9px 10px", color: T.txPri, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(vlOrc)}</td>
                            <td style={{ padding: "9px 10px", color: T.green, fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(vlMed)}</td>
                            <td style={{ padding: "9px 10px", color: vlOrc - vlMed === 0 ? T.green : T.amber, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(vlOrc - vlMed)}</td>
                            <td style={{ padding: "9px 10px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => { setEditItem(item); setItemForm({ ...item }); setShowItemModal(true); }} style={{ ...S.ghost, padding: "3px 8px", fontSize: 13 }}>✏️</button>
                                <button onClick={() => setProjetos(prev => prev.map(p => p.id === obra.id ? { ...p, itens: p.itens.filter(i => i.id !== item.id) } : p))} style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "3px 8px", fontSize: 13 }}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${T.brStrong}`, background: T.bg3 }}>
                        <td colSpan={7} style={{ padding: "10px", fontWeight: 800, color: T.txPri, fontSize: 14 }}>TOTAIS</td>
                        <td style={{ padding: "10px", fontWeight: 800, color: T.txPri, whiteSpace: "nowrap" }}>{fmt(obra.itens.reduce((s, i) => s + i.qtde * i.vlUnit, 0))}</td>
                        <td style={{ padding: "10px", fontWeight: 800, color: T.green, whiteSpace: "nowrap" }}>{fmt(obra.itens.reduce((s, i) => s + (i.qtdeMed || 0) * i.vlUnit, 0))}</td>
                        <td style={{ padding: "10px", fontWeight: 800, color: T.amber, whiteSpace: "nowrap" }}>{fmt(obra.itens.reduce((s, i) => s + (i.qtde - (i.qtdeMed || 0)) * i.vlUnit, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Item Modal */}
            {showItemModal && (
              <div style={{ position: "fixed", inset: 0, background: "#000000b0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 }}>
                <div style={{ background: T.bg2, borderRadius: 14, border: `1px solid ${T.brBase}`, padding: 26, width: 480, maxWidth: "95vw" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.blue, marginBottom: 18 }}>{editItem ? "✏️ Editar Item" : "➕ Novo Item de Medição"}</div>
                  <div style={{ marginBottom: 12 }}><label style={S.label}>Descrição</label>
                    <input value={itemForm.descricao} onChange={e => setItemField("descricao", e.target.value)} style={S.input} placeholder="Ex: Esteira Metálica L=400mm" /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
                    {[{ l: "Unid.", k: "unid", ph: "Und" }, { l: "Qtde Orc.", k: "qtde", t: "number" }, { l: "VL Unit (R$)", k: "vlUnit", t: "number" }, { l: "Qtde Medida", k: "qtdeMed", t: "number" }].map(({ l, k, ph, t }) => (
                      <div key={k}><label style={S.label}>{l}</label>
                        <input type={t || "text"} value={itemForm[k] || ""} onChange={e => setItemField(k, t === "number" ? Number(e.target.value) : e.target.value)} style={S.input} placeholder={ph} /></div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 18 }}><label style={S.label}>Tipo</label>
                    <select value={itemForm.tipo} onChange={e => setItemField("tipo", e.target.value)} style={S.input}>
                      {CATEG_TIPO.map(c => <option key={c}>{c}</option>)}</select></div>
                  {itemForm.qtde > 0 && itemForm.vlUnit > 0 && <div style={{ background: T.bg3, borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", border: `1px solid ${T.amber}30` }}>
                    <span style={{ fontSize: 14, color: T.txMut }}>Total do Item</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.amber }}>{fmt(itemForm.qtde * itemForm.vlUnit)}</span>
                  </div>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => { setShowItemModal(false); setEditItem(null); }} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
                    <button onClick={saveItem} style={{ ...S.btn, flex: 2, padding: 10, fontSize: 13 }}>{editItem ? "Salvar" : "Adicionar"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COMENTÁRIOS TAB ── */}
        {obraTab === "comentarios" && (() => {
          const comentarios = obra.comentarios || [];
          const texto = comTexto; const setTexto = setComTexto;
          const autor = comAutor; const setAutor = setComAutor;
          const tipo = comTipo; const setTipo = setComTipo;
          const TIPOS_COM = [
            { id: "Andamento", icon: "📝", color: T.blue },
            { id: "Alerta", icon: "⚠️", color: T.amber },
            { id: "Concluído", icon: "✅", color: T.green },
            { id: "Bloqueio", icon: "🔒", color: T.red },
          ];
          const addComentario = () => {
            if (!texto.trim()) return;
            const now = new Date();
            const dataHora = now.toLocaleDateString("pt-BR") + " " +
              now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            const novo = { id: `com_${Date.now()}`, texto, autor: autor || "LS Office", tipo, dataHora };
            setProjetos(prev => prev.map(p => p.id === projetoSel
              ? { ...p, comentarios: [novo, ...(p.comentarios || [])] }
              : p
            ));
            setTexto("");
          };
          const delComentario = (id) => setProjetos(prev => prev.map(p => p.id === projetoSel
            ? { ...p, comentarios: (p.comentarios || []).filter(c => c.id !== id) }
            : p
          ));
          const tipoAtual = TIPOS_COM.find(t => t.id === tipo) || TIPOS_COM[0];

          return (
            <div>
              {/* Input área */}
              <div style={{ ...S.card, marginBottom: 20, border: `1px solid ${tipoAtual.color}30` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.txPri, marginBottom: 12 }}>💬 Registrar Atualização</div>

                {/* Tipo */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {TIPOS_COM.map(t => (
                    <button key={t.id} onClick={() => setTipo(t.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 8,
                        border: `1px solid ${tipo === t.id ? t.color + "80" : T.brBase}`,
                        background: tipo === t.id ? t.color + "18" : "transparent",
                        color: tipo === t.id ? t.color : T.txMut,
                        cursor: "pointer", fontSize: 13, fontWeight: tipo === t.id ? 700 : 400
                      }}>
                      <span>{t.icon}</span>{t.id}
                    </button>
                  ))}
                </div>

                {/* Autor */}
                <div style={{ marginBottom: 10 }}>
                  <input value={autor} onChange={e => setAutor(e.target.value)}
                    style={{ ...S.input, maxWidth: 220 }} placeholder="Seu nome (opcional)" />
                </div>

                {/* Texto */}
                <textarea value={texto} onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.ctrlKey && e.key === "Enter") addComentario(); }}
                  style={{
                    ...S.input, resize: "vertical", minHeight: 90, width: "100%",
                    boxSizing: "border-box", borderColor: texto ? tipoAtual.color + "50" : T.brBase
                  }}
                  placeholder={`Descreva o andamento, alerta ou ocorrência da obra ${obra.siteIdSharing || ""}...\n(Ctrl+Enter para enviar)`} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <span style={{ fontSize: 12, color: T.txDis }}>Ctrl+Enter para enviar</span>
                  <button onClick={addComentario}
                    disabled={!texto.trim()}
                    style={{
                      ...S.btn, padding: "8px 20px",
                      background: texto.trim() ? `linear-gradient(135deg,${tipoAtual.color}cc,${tipoAtual.color})` : "#1a2030",
                      color: texto.trim() ? "#fff" : T.txDis,
                      cursor: texto.trim() ? "pointer" : "default",
                      display: "flex", alignItems: "center", gap: 6
                    }}>
                    {tipoAtual.icon} Registrar
                  </button>
                </div>
              </div>

              {/* Feed */}
              {comentarios.length === 0 ? (
                <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
                  <div style={{ fontSize: 13, color: T.txSec, marginBottom: 4 }}>Nenhum comentário ainda</div>
                  <div style={{ fontSize: 13, color: T.txMut }}>Registre o andamento, alertas e ocorrências da obra</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {comentarios.map(c => {
                    const t = TIPOS_COM.find(x => x.id === c.tipo) || TIPOS_COM[0];
                    return (
                      <div key={c.id} style={{
                        ...S.card,
                        borderLeft: `3px solid ${t.color}`,
                        padding: "14px 16px",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 15 }}>{t.icon}</span>
                            <span style={{
                              background: t.color + "18", color: t.color, border: `1px solid ${t.color}40`,
                              padding: "2px 9px", borderRadius: 5, fontSize: 12, fontWeight: 700
                            }}>
                              {c.tipo}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.txSec }}>{c.autor}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, color: T.txMut }}>{c.dataHora}</span>
                            <button onClick={() => delComentario(c.id)}
                              style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "2px 7px", fontSize: 13 }}>🗑️</button>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: T.txPri, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {c.texto}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── MODAL UNIFICADO: NF / Pagamento / Despesa ── */}
        {showNFModal && (() => {
          const isNF = nfModalTipo === "nf";
          const isPag = nfModalTipo === "pagamento";
          const isDesp = nfModalTipo === "despesa";
          const acColor = isNF ? T.blue : isPag ? T.amber : T.orange;

          const handleAnexo = (fieldKey, file) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => setDespesaForm(p => ({ ...p, [fieldKey]: { name: file.name, data: e.target.result } }));
            reader.readAsDataURL(file);

            // Auto-leitura de NF: quando anexa PDF na aba NF Material, lê e preenche campos
            if (fieldKey === "anexoOrcamento" && isNF && file.type === "application/pdf") {
              extractPDFText(file).then(text => {
                const parsed = parseNFFromText(text);
                setDespesaForm(p => ({
                  ...p,
                  num:        parsed.num      || p.num,
                  serie:      parsed.serie    || p.serie,
                  cnpj:       parsed.cnpj     || p.cnpj,
                  fornecedor: parsed.fornecedor || p.fornecedor,
                  emissao:    parsed.emissao  || p.emissao,
                  valor:      parsed.valor > 0 ? parsed.valor : p.valor,
                }));
              }).catch(() => {/* silently ignore if PDF parse fails */});
            }
          };

          const AnexoField = ({ label, fieldKey, icon, hint = "" }: { label: string; fieldKey: string; icon: string; hint?: string }) => {
            const arq = despesaForm[fieldKey];
            const isNFPrimary = fieldKey === "anexoOrcamento" && isNF;
            return (
              <div style={{ background: T.bg3, border: `1px dashed ${arq ? acColor : T.brBase}`, borderRadius: 9, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 2 }}>
                    {label.toUpperCase()}
                    {isNFPrimary && !arq && <span style={{ color: T.green, fontWeight: 400, marginLeft: 8, fontSize: 11 }}>📖 leitura automática ao anexar PDF</span>}
                    {isNFPrimary && arq && arq.name?.endsWith(".pdf") && <span style={{ color: T.green, fontWeight: 400, marginLeft: 8, fontSize: 11 }}>✅ campos preenchidos automaticamente</span>}
                  </div>
                  {arq
                    ? <div style={{ fontSize: 13, color: acColor, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✓ {arq.name}</div>
                    : <div style={{ fontSize: 13, color: T.txDis }}>{hint || "Clique para selecionar (PDF, imagem)"}</div>}
                </div>
                <label style={{ ...S.btn, padding: "5px 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", background: arq ? T.bg4 : T.blueD }}>
                  {arq ? "Trocar" : "Selecionar"}
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }}
                    onChange={e => handleAnexo(fieldKey, e.target.files[0])} />
                </label>
                {arq && <button onClick={() => setDespesaForm(p => ({ ...p, [fieldKey]: null }))}
                  style={{ background: "transparent", border: "none", color: T.red, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>}
              </div>
            );
          };

          return (
            <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 16 }}>
              <div style={{ background: T.bg1, borderRadius: 18, border: `2px solid ${acColor}40`, width: 620, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: `0 0 60px ${acColor}20` }}>

                {/* Header */}
                <div style={{ background: `linear-gradient(135deg,${acColor}18,${T.bg2})`, borderRadius: "16px 16px 0 0", padding: "22px 28px", borderBottom: `1px solid ${acColor}30` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 900, color: acColor, marginBottom: 4 }}>
                        {isNF ? "📄 Registrar NF Paga de Material" : isPag ? "💸 Registrar Pagamento de Serviço" : "🧾 Lançar Despesa Geral"}
                      </div>
                      <div style={{ fontSize: 13, color: T.txMut }}>
                        {isNF ? "Nota fiscal de compra de material / serviço com CNPJ" : isPag ? "Pagamento a prestador, funcionário, fornecedor de serviço ou reembolso" : "Combustível, alimentação, frete, taxa e pequenas despesas"}
                      </div>
                    </div>
                    {/* Switch tipo */}
                    <div style={{ display: "flex", background: T.bg3, borderRadius: 8, padding: 3, gap: 2 }}>
                      {[{ id: "nf", l: "📄 NF Material", cor: T.blue }, { id: "pagamento", l: "💸 Pagamento", cor: T.amber }, { id: "despesa", l: "🧾 Despesa", cor: T.orange }].map(({ id, l, cor }) => (
                        <button key={id} onClick={() => setNfModalTipo(id)}
                          style={{
                            padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
                            fontWeight: nfModalTipo === id ? 700 : 400,
                            background: nfModalTipo === id ? cor : "transparent",
                            color: nfModalTipo === id ? "#000" : T.txMut
                          }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ padding: "20px 28px" }}>

                  {/* ── CAMPOS ESPECÍFICOS POR TIPO ── */}
                  {isNF ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.txMut, letterSpacing: "0.07em", marginBottom: 10 }}>DADOS DA NOTA FISCAL</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                        <div><label style={S.label}>Nº da NF / Recibo</label>
                          <input value={despesaForm.num} onChange={e => DF("num", e.target.value)} style={S.input} placeholder="Ex: 003847" /></div>
                        <div><label style={S.label}>CNPJ Emitente</label>
                          <input value={despesaForm.cnpj} onChange={e => DF("cnpj", e.target.value)} style={S.input} placeholder="00.000.000/0001-00" /></div>
                        <div style={{ gridColumn: "1/-1" }}>
                          <label style={S.label}>Fornecedor / Prestador</label>
                          <select value={despesaForm.fornecedor} onChange={e => {
                            const sel = (fornecedores as any[]).find((f: any) => f.nome === e.target.value);
                            setDespesaForm(p => ({
                              ...p,
                              fornecedor: e.target.value,
                              cnpj: sel?.cnpj || p.cnpj,
                              chavePix: sel?.chavePix || p.chavePix,
                              banco: sel?.banco || p.banco,
                              agencia: sel?.agencia || p.agencia,
                              conta: sel?.conta || p.conta,
                            }));
                          }} style={S.input}>
                            <option value="">— Selecionar fornecedor —</option>
                            {(fornecedores as any[]).filter((f: any) => f.moduloTipo === "material").map((f: any) => <option key={f.id} value={f.nome}>{f.nome}{f.cnpj ? ` · ${f.cnpj}` : ""}</option>)}
                            {(fornecedores as any[]).filter((f: any) => f.moduloTipo !== "material").length > 0 && <>
                              <optgroup label="── Prestadores de Serviço ──">
                                {(fornecedores as any[]).filter((f: any) => f.moduloTipo !== "material").map((f: any) => <option key={f.id} value={f.nome}>{f.nome}{f.cnpj ? ` · ${f.cnpj}` : ""}</option>)}
                              </optgroup>
                            </>}
                            <option value="__outro__">+ Outro (digitar manualmente)</option>
                          </select>
                          {(despesaForm.fornecedor === "__outro__" || (!fornecedores.find(f => f.nome === despesaForm.fornecedor) && despesaForm.fornecedor)) && (
                            <input value={despesaForm.fornecedor === "__outro__" ? "" : despesaForm.fornecedor}
                              onChange={e => DF("fornecedor", e.target.value)} style={{ ...S.input, marginTop: 6 }} placeholder="Nome do fornecedor / prestador" />
                          )}
                        </div>
                        <div><label style={S.label}>Categoria</label>
                          <select value={despesaForm.categoria} onChange={e => DF("categoria", e.target.value)} style={S.input}>
                            {CATEG_TIPO.map(c => <option key={c}>{c}</option>)}</select></div>
                        <div><label style={S.label}>Data de Emissão</label>
                          <input value={despesaForm.emissao} onChange={e => DF("emissao", e.target.value)} style={S.input} placeholder="DD/MM/AAAA" /></div>
                        <div><label style={S.label}>Data de Vencimento</label>
                          <input value={despesaForm.vencimento} onChange={e => DF("vencimento", e.target.value)} style={S.input} placeholder="DD/MM/AAAA" /></div>
                        <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Descrição</label>
                          <input value={despesaForm.desc} onChange={e => DF("desc", e.target.value)} style={S.input} placeholder="Ex: Fornecimento Estrutura Metálica - Medição 01" /></div>
                        <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Vínculo com Item do Orçamento</label>
                          <input value={despesaForm.vinculo} onChange={e => DF("vinculo", e.target.value)} style={S.input} placeholder="Ex: EST-001 / MO-001" /></div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.txMut, letterSpacing: "0.07em", marginBottom: 10 }}>PAGAMENTO DE PRESTADOR / FUNCIONÁRIO</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                        <div style={{ gridColumn: "1/-1" }}>
                          <label style={S.label}>Prestador / Funcionário</label>
                          <select value={despesaForm.funcionario} onChange={e => {
                            const nome = e.target.value;
                            const func = funcionarios.find(f => f.nome === nome);
                            const forn = fornecedores.find(f => f.nome === nome);
                            const rec = func || forn;
                            setDespesaForm(p => ({
                              ...p,
                              funcionario: nome,
                              tipoPagto: rec?.chavePix ? "PIX" : rec?.banco ? "Transferência Bancária (TED/DOC)" : p.tipoPagto,
                              chavePix: rec?.chavePix || (func ? (func.pixChave || "") : "") || p.chavePix,
                              banco: rec?.banco || p.banco,
                              agencia: rec?.agencia || p.agencia,
                              conta: rec?.conta || p.conta,
                            }));
                          }} style={S.input}>
                            <option value="">— Selecionar —</option>
                            {(funcionarios as any[]).length > 0 && <optgroup label="👨‍💼 Funcionários">
                              {(funcionarios as any[]).map((f: any) => <option key={f.id} value={f.nome}>{f.nome}{f.cargo ? ` — ${f.cargo}` : ""}</option>)}
                            </optgroup>}
                            {(fornecedores as any[]).filter((f: any) => f.moduloTipo !== "material").length > 0 && <optgroup label="👷 Prestadores de Serviço">
                              {(fornecedores as any[]).filter((f: any) => f.moduloTipo !== "material").map((f: any) => <option key={f.id} value={f.nome}>{f.nome}{f.especialidade ? ` · ${f.especialidade}` : ""}</option>)}
                            </optgroup>}
                          </select>
                          {despesaForm.funcionario && (() => {
                            const func = (funcionarios as any[]).find((f: any) => f.nome === despesaForm.funcionario);
                            const forn = (fornecedores as any[]).find((f: any) => f.nome === despesaForm.funcionario);
                            const rec = func || forn;
                            if (!rec) return null;
                            return (
                              <div style={{ marginTop: 6, background: T.bg3, borderRadius: 7, padding: "8px 12px", fontSize: 12, color: T.txMut, display: "flex", gap: 16, flexWrap: "wrap" }}>
                                {rec.telefone && <span>📱 {rec.telefone}</span>}
                                {(rec.chavePix || func?.pixChave) && <span>💠 PIX: {rec.chavePix || func?.pixChave}</span>}
                                {rec.banco && <span>🏦 {rec.banco} / Ag: {rec.agencia} / CC: {rec.conta}</span>}
                                {(rec.cnpj || func?.cpf) && <span>📋 {rec.cnpj || func?.cpf}</span>}
                              </div>
                            );
                          })()}
                        </div>
                        <div><label style={S.label}>Data do Pagamento</label>
                          <input value={despesaForm.data} onChange={e => DF("data", e.target.value)} style={S.input} placeholder="DD/MM/AAAA" /></div>
                        <div><label style={S.label}>Tipo de Serviço / Motivo</label>
                          <select value={despesaForm.adtTipo} onChange={e => DF("adtTipo", e.target.value)} style={S.input}>
                            {ADIANT_TIPOS.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        {despesaForm.adtTipo === "Outros" && (
                          <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Descreva o tipo</label>
                            <input value={despesaForm.adtOutroDesc} onChange={e => DF("adtOutroDesc", e.target.value)} style={S.input} placeholder="Ex: Aluguel de equipamento, Hospedagem..." /></div>
                        )}
                        <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Descrição / Observação</label>
                          <textarea value={despesaForm.justificativa} onChange={e => DF("justificativa", e.target.value)}
                            style={{ ...S.input, resize: "vertical", minHeight: 60 }} placeholder="Descreva o serviço prestado, referência da proposta, etc..." /></div>
                      </div>
                    </>
                  )}

                  {/* ── CAMPOS DESPESA GERAL ── */}
                  {isDesp && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.txMut, letterSpacing: "0.07em", marginBottom: 10 }}>DADOS DA DESPESA</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                        <div><label style={S.label}>Tipo de Despesa</label>
                          <select value={despesaForm.despesaTipo} onChange={e => DF("despesaTipo", e.target.value)} style={S.input}>
                            {DESP_GERAL_TIPOS.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div><label style={S.label}>Data</label>
                          <input value={despesaForm.data} onChange={e => DF("data", e.target.value)} style={S.input} placeholder="DD/MM/AAAA" /></div>
                        <div><label style={S.label}>Responsável</label>
                          <select value={despesaForm.funcionario} onChange={e => DF("funcionario", e.target.value)} style={S.input}>
                            <option value="">— Selecionar —</option>
                            {funcionarios.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                            {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                          </select>
                        </div>
                        <div><label style={S.label}>Status</label>
                          <select value={despesaForm.despesaStatusGeral} onChange={e => DF("despesaStatusGeral", e.target.value)} style={S.input}>
                            {DESP_STATUS.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Descrição</label>
                          <input value={despesaForm.desc} onChange={e => DF("desc", e.target.value)} style={S.input} placeholder="Ex: Combustível — trecho Belém→Benevides, 80km" /></div>
                      </div>
                    </>
                  )}

                  {/* ── VALOR ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div><label style={S.label}>Valor Total (R$)</label>
                      <input type="number" value={despesaForm.valor} onChange={e => DF("valor", e.target.value)}
                        style={{ ...S.input, color: acColor, fontWeight: 800, fontSize: 16 }} placeholder="0.00" /></div>
                    {isNF && <div><label style={S.label}>Status da NF</label>
                      <div style={{ ...S.input, display: "flex", alignItems: "center", fontWeight: 800, color: T.green, background: T.green + "12", borderColor: T.green + "35" }}>
                        Pago automaticamente no lançamento
                      </div></div>}
                    {isPag && <div><label style={S.label}>Status do Pagamento</label>
                      <select value={despesaForm.statusPagamento} onChange={e => DF("statusPagamento", e.target.value)} style={S.input}>
                        {PAG_STATUS.map(s => <option key={s}>{s}</option>)}</select></div>}
                  </div>

                  {/* ── FORMA DE PAGAMENTO ── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.txMut, letterSpacing: "0.07em", marginBottom: 10 }}>FORMA DE PAGAMENTO</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                      {PAGTO_TIPOS.map(t => (
                        <button key={t} onClick={() => DF("tipoPagto", t)}
                          style={{
                            padding: "6px 12px", borderRadius: 7, border: `1px solid ${despesaForm.tipoPagto === t ? acColor + "80" : T.brBase}`,
                            background: despesaForm.tipoPagto === t ? acColor + "18" : T.bg3,
                            color: despesaForm.tipoPagto === t ? acColor : T.txMut,
                            cursor: "pointer", fontSize: 13, fontWeight: despesaForm.tipoPagto === t ? 700 : 400
                          }}>
                          {{ "PIX": "💠 PIX", "Transferência Bancária (TED/DOC)": "🏦 TED/DOC", "Boleto": "📋 Boleto", "Cartão Corporativo": "💳 Cartão", "Dinheiro / Espécie": "💵 Dinheiro" }[t]}
                        </button>
                      ))}
                    </div>
                    {despesaForm.tipoPagto === "PIX" && (
                      <div><label style={S.label}>Chave PIX</label>
                        <input value={despesaForm.chavePix} onChange={e => DF("chavePix", e.target.value)} style={S.input} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" /></div>
                    )}
                    {despesaForm.tipoPagto === "Transferência Bancária (TED/DOC)" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <div><label style={S.label}>Banco</label>
                          <input value={despesaForm.banco} onChange={e => DF("banco", e.target.value)} style={S.input} placeholder="Ex: 341 Itaú" /></div>
                        <div><label style={S.label}>Agência</label>
                          <input value={despesaForm.agencia} onChange={e => DF("agencia", e.target.value)} style={S.input} placeholder="0000" /></div>
                        <div><label style={S.label}>Conta</label>
                          <input value={despesaForm.conta} onChange={e => DF("conta", e.target.value)} style={S.input} placeholder="00000-0" /></div>
                      </div>
                    )}
                  </div>

                  {/* ── ANEXOS ── */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.txMut, letterSpacing: "0.07em", marginBottom: 10 }}>ANEXOS (serão mencionados no e-mail)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <AnexoField label="Orçamento / Proposta" fieldKey="anexoOrcamento" icon="📋" />
                      <AnexoField label="Transferência / TC (comprovante da LS Office)" fieldKey="anexoTC" icon="🏦" />
                    </div>
                  </div>

                  {/* ── E-MAIL DESTINATÁRIO + CC ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    <div>
                      <label style={S.label}>Para (Destinatário)</label>
                      <input value={despesaForm.emailDestinatario} onChange={e => DF("emailDestinatario", e.target.value)}
                        style={S.input} placeholder="email@exemplo.com" />
                    </div>
                    <div>
                      <label style={S.label}>CC (separados por ";")</label>
                      <input value={(despesaForm as any).emailCC || ""} onChange={e => DF("emailCC", e.target.value)}
                        style={S.input} placeholder="email1@ex.com; email2@ex.com" />
                    </div>
                  </div>

                  {/* ── PREVIEW VALOR ── */}
                  {despesaForm.valor > 0 && (
                    <div style={{ background: acColor + "12", border: `1px solid ${acColor}30`, borderRadius: 10, padding: "12px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: T.txMut, fontWeight: 700, letterSpacing: "0.06em" }}>VALOR A SOLICITAR</div>
                        {despesaForm.tipoPagto && <div style={{ fontSize: 12, color: acColor, marginTop: 2 }}>via {despesaForm.tipoPagto}</div>}
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: acColor, letterSpacing: "-0.03em" }}>{fmt(Number(despesaForm.valor))}</div>
                    </div>
                  )}

                  {/* ── INFO E-MAIL ── */}
                  <div style={{ background: T.blue + "10", border: `1px solid ${T.blue}25`, borderRadius: 9, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: T.txSec }}>
                    <div>📩 Um arquivo <strong>.msg</strong> será baixado — basta dar <strong>duplo clique</strong> para abrir no Outlook com o e-mail formatado e pronto para enviar.</div>
                    <div style={{ marginTop: 4 }}>Para: <strong style={{ color: T.blue }}>{despesaForm.emailDestinatario || "—"}</strong>
                      {(despesaForm as any).emailCC && <span> · CC: <span style={{ color: T.txMut }}>{(despesaForm as any).emailCC}</span></span>}
                    </div>
                    {(despesaForm.anexoOrcamento || despesaForm.anexoTC) && (
                      <div style={{ marginTop: 4, color: T.green }}>📎 {[despesaForm.anexoOrcamento, despesaForm.anexoTC].filter(Boolean).length} anexo(s) serão incluídos no e-mail.</div>
                    )}
                  </div>

                  {/* ── BOTÕES ── */}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setShowNFModal(false)} style={{ ...S.ghost, flex: 1, padding: 11 }}>Cancelar</button>
                    <button onClick={addDespesa}
                      style={{
                        ...S.btn, flex: 3, padding: 11, fontSize: 13,
                        background: isNF ? "linear-gradient(135deg,#1d4ed8,#3b82f6)" : isPag ? "linear-gradient(135deg,#d97706,#f59e0b)" : "linear-gradient(135deg,#b45309,#f59e0b)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                      }}>
                      {isNF ? "✓ Registrar NF Paga & Gerar E-mail (.msg)" : isPag ? "💸 Registrar Pagamento & Gerar E-mail (.msg)" : "🧾 Lançar Despesa & Gerar E-mail (.msg)"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: CONTROLE DASHBOARD (sem obra selecionada — visão geral)
  // ════════════════════════════════════════════════════════════════════
  const TabControleDash = () => {
    const totalBudget = projetos.reduce((s, p) => s + calcBudgetEfetivo(p), 0);
    const totalCusto = projetos.reduce((s, p) => s + calcCustoPagoEfetivo(p), 0);
    const totalSaldo = projetos.reduce((s, p) => s + calcSaldoProjeto(p), 0);
    return (
      <div>
        <SectionHeader icon="📊" title="Controle de Obras" subtitle="Carteira completa de projetos em execução" color={T.blue} action={<button onClick={newProj} style={S.btn}>+ Novo Projeto</button>} />

        {nfsAtraso.length > 0 && (
          <div style={{ ...S.card, marginBottom: 18, borderLeft: `3px solid ${T.red}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.red, marginBottom: 10 }}>⚠️ ALERTAS — NFs EM ATRASO</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {nfsAtraso.map(nf => (
                <div key={nf.id} style={{ background: T.red + "12", border: `1px solid ${T.red}30`, borderRadius: 8, padding: "8px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.red }}>{nf.siteId || ""} — NF {nf.num}</div>
                  <div style={{ fontSize: 12, color: T.txMut }}>{nf.fornecedor} · {fmt(nf.valor)}</div>
                  <div style={{ fontSize: 12, color: T.red }}>Venceu em {nf.vencimento}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { icon: "📐", l: "Budget Total", v: fmt(totalBudget), c: T.blue },
            { icon: "💰", l: "Custo", v: fmt(totalCusto), c: T.amber },
            { icon: "💼", l: "Saldo Total", v: fmt(totalSaldo), c: totalSaldo < 0 ? T.red : T.cyan },
          ].map(({ icon, l, v, c }) => (
            <div key={l} style={{ ...S.card, ...cardTint(c), borderTop: `2px solid ${c}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase" }}>{l}</span>
                <span style={{ ...iconBox(c, true), width: 28, height: 28, borderRadius: 8 }}>
                  <span style={{ fontSize: 14, filter: "grayscale(1)" }}>{icon}</span>
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: c, letterSpacing: "-0.03em", textShadow: `0 0 20px ${c}40` }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 14 }}>📋 Carteira de Obras</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ background: T.bg3, borderBottom: `1px solid ${T.brStrong}` }}>
                {["Site ID Sharing / Operadora", "Cliente / Sharing", "Operadora", "Fornecedor", "Gestor", "PO", "Status", "Budget", "Custo", "Saldo", "Avanço", ""].map(h => (
                  <th key={h} style={{ padding: "9px 10px", textAlign: "left", color: T.txMut, fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {projetos.map((p, i) => {
                  const budget = calcBudgetEfetivo(p);
                  const custo = calcCustoPagoEfetivo(p);
                  const saldo = calcSaldoProjeto(p);
                  const avanco = getAvancoEfetivo(p);
                  const clienteNome = p.sharing || p.Sharing || "—";
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 === 0 ? "transparent" : T.bg3 + "80", transition: "background 0.1s", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = T.blue + "10"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? "transparent" : T.bg3 + "80"}
                    >
                      <td style={{ padding: "9px 10px", minWidth: 160 }}>
                        <div style={{ marginBottom: 3 }}>
                          <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.06em" }}>SHARING</div>
                          <div style={{ fontWeight: 900, color: T.purple, fontSize: 13 }}>{p.siteIdSharing || "—"}</div>
                        </div>
                        {p.siteIdOperadora && (
                          <div style={{ marginBottom: 3 }}>
                            <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.06em" }}>OPERADORA</div>
                            <div style={{ fontWeight: 700, color: T.blue, fontSize: 14 }}>{p.siteIdOperadora}</div>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: T.txMut }}>{p.municipio}{p.uf ? `/${p.uf}` : ""}</div>
                        {p.segmento && <div style={{ marginTop: 3 }}>
                          <span style={{ background: p.segmento === "Implantação" ? T.blue + "20" : T.green + "20", color: p.segmento === "Implantação" ? T.blue : T.green, borderRadius: 3, padding: "1px 5px", fontSize: 11, fontWeight: 700 }}>
                            {p.segmento === "Implantação" ? "🔧" : "⚙️"} {p.segmento}
                          </span>
                        </div>}
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ fontWeight: 700, color: T.purple, fontSize: 14 }}>{clienteNome}</div>
                      </td>
                      <td style={{ padding: "9px 10px", color: OP_COLOR[p.operadora] || T.txMut, fontWeight: 700, fontSize: 14 }}>{p.operadora}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ fontSize: 13, color: T.txSec, fontWeight: 600 }}>{p.fornecedor || "—"}</div>
                        {p.contato && <div style={{ fontSize: 12, color: T.txMut }}>{p.contato}</div>}
                      </td>
                      {/* Gestor */}
                      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                        {p.gestor
                          ? <span style={{ fontSize: 13, fontWeight: 700, color: T.cyan }}>{p.gestor}</span>
                          : <span style={{ fontSize: 12, color: T.txDis }}>—</span>}
                      </td>
                      <td style={{ padding: "9px 10px", minWidth: 130 }}>
                        {p.po ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ background: T.green + "18", color: T.green, border: `1px solid ${T.green}40`, borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                              ✅ PO {p.po.nrPO}
                            </span>
                            <span style={{ fontSize: 11, color: T.txMut }}>{p.po.dataPO} · {p.po.condicaoPagamento}</span>
                            <label style={{ fontSize: 11, color: T.blue, cursor: "pointer", textDecoration: "underline" }}>
                              Trocar PDF
                              <input type="file" accept=".pdf" style={{ display: "none" }} onChange={e => e.target.files[0] && parsePO(p.id, e.target.files[0])} />
                            </label>
                          </div>
                        ) : poLoading === p.id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 14, height: 14, border: `2px solid ${T.blue}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            <span style={{ fontSize: 12, color: T.blue }}>Lendo PO...</span>
                          </div>
                        ) : (
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: T.bg3, border: `1px dashed ${T.brBase}`, borderRadius: 7, padding: "5px 10px" }}>
                            <span style={{ fontSize: 14 }}>📎</span>
                            <span style={{ fontSize: 12, color: T.txMut }}>Anexar PO</span>
                            <input type="file" accept=".pdf" style={{ display: "none" }} onChange={e => e.target.files[0] && parsePO(p.id, e.target.files[0])} />
                          </label>
                        )}
                      </td>
                      <td style={{ padding: "9px 10px" }}><StatusBadge status={p.status} /></td>
                      <td style={{ padding: "9px 10px", color: T.txPri, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(budget)}</td>
                      <td style={{ padding: "9px 10px", color: T.amber, fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(custo)}</td>
                      <td style={{ padding: "9px 10px", color: saldo < 0 ? T.red : T.cyan, fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(saldo)}</td>
                      <td style={{ padding: "9px 10px", minWidth: 100 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: T.bg4, overflow: "hidden" }}><div style={{ height: "100%", width: `${avanco}%`, background: avanco >= 80 ? T.green : T.blue, borderRadius: 3 }} /></div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.txPri, minWidth: 28 }}>{avanco}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setProjetoSel(p.id); setObraTab("resumo"); setTab("controle"); }} style={{ ...S.btn, padding: "5px 12px", fontSize: 13, background: T.bg4, color: T.blue, border: `1px solid ${T.blue}30` }}>Abrir →</button>
                          <button 
                            onClick={() => {
                              const b = {
                                id: `ORC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
                                versao: 1,
                                data: new Date().toLocaleDateString("pt-BR"),
                                status: "Rascunho",
                                siteInfo: { 
                                  siteId: p.siteIdSharing || p.siteIdOperadora || p.siteId || "", 
                                  sharingNome: p.sharing || p.Sharing || "", 
                                  siteIdSharing: p.siteIdSharing || "", 
                                  siteIdOperadora: p.siteIdOperadora || "",
                                  operadora: p.operadora || "", 
                                  uf: p.uf || "", 
                                  municipio: p.municipio || "", 
                                  endereco: p.endereco || "" 
                                },
                                blocos: [],
                                contratante: p.sharing || p.Sharing || "", 
                                objeto: p.descricao || "", 
                                vigencia: "10 DIAS", 
                                fornecedor: "LS Office", 
                                obs: p.notas || "",
                                totalCapex: 0, totalOpex: 0, totalGeral: 0,
                                projetoId: p.id
                              };
                              setActiveBudgetV2(b as any);
                              setTab("orcv2");
                            }}
                            style={{ ...S.ghost, padding: "5px 10px", fontSize: 11, color: T.green, border: `1px solid ${T.green}30` }}
                          >
                            ➕ Orçamento
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: FORNECEDORES
  // ════════════════════════════════════════════════════════════════════
  const TabFornecedores = () => {
    const CATEG_MATERIAL = ["Elétrico", "Civil", "Telecom", "Cabos & Conectores", "Estrutura Metálica", "Ferramentas", "Equipamentos", "Acessórios", "Outros"];
    const SUBTIPO_PREST = ["Equipe", "PJ", "PF"];
    const SUBTIPO_COLOR: Record<string,string> = { Equipe: T.blue, PJ: T.purple, PF: T.amber };
    const SUBTIPO_ICON: Record<string,string> = { Equipe: "👷", PJ: "🏢", PF: "🧑‍🔧" };
    const SUBTIPO_DESC: Record<string,string> = { Equipe: "Empresa que fornece equipe de campo", PJ: "Empresa contratada (civil, elétrico, RF)", PF: "Autônomo / diarista / mensalista" };

    const search = fornSearch; const setSearch = setFornSearch;
    const filterTipo = fornFilterTipo; const setFilterTipo = setFornFilterTipo;

    const fornMat = fornecedores.filter((f: any) => f.moduloTipo === "material");
    const fornPrest = fornecedores.filter((f: any) => f.moduloTipo !== "material");

    const filtered = fornSubTab === "material"
      ? fornMat.filter((f: any) => f.nome.toLowerCase().includes(search.toLowerCase()) || (f.cnpj || "").includes(search))
      : fornPrest.filter((f: any) =>
          (filterTipo === "TODOS" || f.subtipo === filterTipo) &&
          (f.nome.toLowerCase().includes(search.toLowerCase()) || (f.cnpj || "").includes(search) || (f.cpf || "").includes(search))
        );

    const openNew = () => {
      setFornSelectOnSave(false);
      setEditForn(null);
      setFornForm({ ...fornFormInit, moduloTipo: fornSubTab });
      setShowFornModal(true);
    };
    const openEdit = (f: any) => {
      setFornSelectOnSave(false);
      setEditForn(f);
      setFornForm({
        nome: f.nome, cnpj: f.cnpj || "", cpf: f.cpf || "",
        moduloTipo: f.moduloTipo || "prestador",
        subtipo: f.subtipo || "PJ",
        tipo: f.tipo || "PJ Jurídico",
        categoriaMaterial: f.categoriaMaterial || "",
        contato: f.contato || "", telefone: f.telefone || "", email: f.email || "",
        regiao: f.regiao || "", obs: f.obs || "",
        banco: f.banco || "", agencia: f.agencia || "", conta: f.conta || "",
        chavePix: f.chavePix || "", especialidade: f.especialidade || "",
      });
      setShowFornModal(true);
    };
    const save = () => {
      if (!fornForm.nome.trim()) return;
      if (editForn) {
        setFornecedores((prev: any[]) => prev.map(f => f.id === editForn.id ? { ...f, ...fornForm } : f));
        if (fornSelectOnSave) {
          setProjField("fornecedor", fornForm.nome);
          if (!projForm.contato && fornForm.contato) setProjField("contato", fornForm.contato);
          setFornSelectOnSave(false);
        }
      } else {
        const newF = { id: `forn_${Date.now()}`, ...fornForm };
        setFornecedores((prev: any[]) => [...prev, newF]);
        if (fornSelectOnSave) {
          setProjField("fornecedor", newF.nome);
          if (!projForm.contato && newF.contato) setProjField("contato", newF.contato);
          setFornSelectOnSave(false);
        }
      }
      setShowFornModal(false); setEditForn(null);
    };

    const isMat = fornForm.moduloTipo === "material";

    return (
      <div>
        <SectionHeader icon="🏢" title="Fornecedores & Prestadores"
          subtitle={`${fornMat.length} fornecedores de material · ${fornPrest.length} prestadores de serviço`}
          color={T.blue}
          action={<button onClick={openNew} style={S.btn}>+ Adicionar</button>} />

        {/* Módulo selector — 2 big tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          {([
            { id: "material" as const, icon: "🏭", label: "Fornecedores de Material", desc: "Empresas que vendem produtos e insumos", color: T.green, count: fornMat.length },
            { id: "prestador" as const, icon: "👷", label: "Prestadores de Serviço", desc: "Equipes, PJs e autônomos que executam obras", color: T.blue, count: fornPrest.length },
          ] as const).map(({ id, icon, label, desc, color, count }) => (
            <button key={id} onClick={() => setFornSubTab(id)} style={{
              padding: "14px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
              border: `2px solid ${fornSubTab === id ? color : T.brBase}`,
              background: fornSubTab === id ? color + "12" : T.bg3,
              transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: fornSubTab === id ? color : T.txSec }}>{label}</div>
              <div style={{ fontSize: 11, color: T.txMut, marginTop: 2 }}>{desc}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: fornSubTab === id ? color : T.txPri, marginTop: 8 }}>{count}</div>
            </button>
          ))}
        </div>

        {/* Busca + filtros subtipo */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, maxWidth: 240 }}
            placeholder={fornSubTab === "material" ? "🔍 Nome, CNPJ..." : "🔍 Nome, CNPJ ou CPF..."} />
          {fornSubTab === "prestador" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(["TODOS", ...SUBTIPO_PREST] as string[]).map(t => {
                const c = t === "TODOS" ? T.blue : (SUBTIPO_COLOR[t] || T.blue);
                return (
                  <button key={t} onClick={() => setFilterTipo(t)} style={{
                    padding: "6px 12px", borderRadius: 7, border: `1px solid ${filterTipo === t ? c : T.brBase}`,
                    background: filterTipo === t ? c + "18" : "transparent",
                    color: filterTipo === t ? c : T.txMut, cursor: "pointer", fontSize: 13, fontWeight: filterTipo === t ? 700 : 400
                  }}>
                    {t === "TODOS" ? "Todos" : `${SUBTIPO_ICON[t]} ${t}`}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Grid de cards */}
        {filtered.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{fornSubTab === "material" ? "🏭" : "👷"}</div>
            <div style={{ color: T.txMut, fontSize: 14 }}>
              {fornSubTab === "material" ? "Nenhum fornecedor de material cadastrado" : "Nenhum prestador de serviço encontrado"}
            </div>
            <button onClick={openNew} style={{ ...S.btn, marginTop: 16 }}>+ Adicionar</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
            {(filtered as any[]).map(f => {
              const tc = fornSubTab === "material" ? T.green : (SUBTIPO_COLOR[f.subtipo] || T.blue);
              const icon = fornSubTab === "material" ? "🏭" : (SUBTIPO_ICON[f.subtipo] || "🏢");
              const obrasDoForn = projetos.filter((p: any) => p.fornecedor === f.nome).length;
              return (
                <div key={f.id} style={{ ...S.card, ...cardTint(tc), borderLeft: `3px solid ${tc}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.txPri, marginBottom: 4 }}>{icon} {f.nome}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {fornSubTab === "material"
                          ? <span style={{ background: tc + "18", color: tc, border: `1px solid ${tc}40`, padding: "2px 9px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{f.categoriaMaterial || "Material"}</span>
                          : <>
                              <span style={{ background: tc + "18", color: tc, border: `1px solid ${tc}40`, padding: "2px 9px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{f.subtipo || "PJ"}</span>
                              {f.especialidade && <span style={{ background: T.bg3, color: T.txMut, border: `1px solid ${T.brBase}`, padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>{f.especialidade}</span>}
                            </>
                        }
                        {obrasDoForn > 0 && <span style={{ background: T.green + "18", color: T.green, padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>{obrasDoForn} obra(s)</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      <button onClick={() => openEdit(f)} style={{ ...S.ghost, padding: "4px 9px", fontSize: 13 }}>✏️</button>
                      <button onClick={() => setFornecedores((prev: any[]) => prev.filter(x => x.id !== f.id))} style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "4px 9px", fontSize: 13 }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {f.cnpj && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>CNPJ: </span><span style={{ color: T.txSec }}>{f.cnpj}</span></div>}
                    {f.cpf && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>CPF: </span><span style={{ color: T.txSec }}>{f.cpf}</span></div>}
                    {f.contato && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Contato: </span><span style={{ color: T.txSec, fontWeight: 600 }}>{f.contato}</span></div>}
                    {f.telefone && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Tel: </span><span style={{ color: T.txSec }}>{f.telefone}</span></div>}
                    {f.email && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>E-mail: </span><a href={`mailto:${f.email}`} style={{ color: T.blue }}>{f.email}</a></div>}
                    {f.chavePix && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>PIX: </span><span style={{ color: T.green }}>{f.chavePix}</span></div>}
                    {f.regiao && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Região: </span><span style={{ color: T.txSec }}>{f.regiao}</span></div>}
                    {f.obs && <div style={{ fontSize: 13, color: T.txMut, background: T.bg3, borderRadius: 5, padding: "4px 8px", marginTop: 4 }}>💬 {f.obs}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal unificado */}
        {showFornModal && (
          <div style={{ position: "fixed", inset: 0, background: "#000000c0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16, overflowY: "auto" }}>
            <div style={{ background: T.bg2, borderRadius: 14, border: `1px solid ${T.brBase}`, padding: 26, width: 580, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: isMat ? T.green : T.blue, marginBottom: 14 }}>
                {editForn ? "✏️ Editar Cadastro" : "➕ Novo Cadastro"}
              </div>

              {/* Tipo de cadastro */}
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Tipo de Cadastro</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                  {([
                    { id: "material", icon: "🏭", label: "Fornecedor de Material", desc: "Vende produtos e insumos (CNPJ)", color: T.green },
                    { id: "prestador", icon: "👷", label: "Prestador de Serviço", desc: "Executa obras e serviços", color: T.blue },
                  ] as const).map(({ id, icon, label, desc, color }) => (
                    <button key={id} onClick={() => setFornField("moduloTipo", id)} style={{
                      padding: "12px 10px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                      border: `2px solid ${fornForm.moduloTipo === id ? color : T.brBase}`,
                      background: fornForm.moduloTipo === id ? color + "18" : T.bg3,
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 3 }}>{icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: fornForm.moduloTipo === id ? color : T.txSec }}>{label}</div>
                      <div style={{ fontSize: 11, color: T.txMut, marginTop: 2 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtipo — só para prestadores */}
              {!isMat && (
                <div style={{ marginBottom: 14 }}>
                  <label style={S.label}>Subtipo de Prestador</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
                    {SUBTIPO_PREST.map(t => {
                      const sel = fornForm.subtipo === t; const tc2 = SUBTIPO_COLOR[t];
                      return (
                        <button key={t} onClick={() => setFornField("subtipo", t)} style={{
                          padding: "10px 8px", borderRadius: 9, cursor: "pointer", textAlign: "center",
                          border: `2px solid ${sel ? tc2 : T.brBase}`, background: sel ? tc2 + "18" : T.bg3,
                        }}>
                          <div style={{ fontSize: 18, marginBottom: 3 }}>{SUBTIPO_ICON[t]}</div>
                          <div style={{ fontSize: 12, fontWeight: sel ? 800 : 500, color: sel ? tc2 : T.txSec }}>{t}</div>
                          <div style={{ fontSize: 11, color: T.txMut, marginTop: 2, lineHeight: 1.3 }}>{SUBTIPO_DESC[t]}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={S.label}>{isMat ? "Razão Social" : "Nome / Razão Social"}</label>
                  <input value={fornForm.nome} onChange={e => setFornField("nome", e.target.value)} style={S.input}
                    placeholder={isMat ? "Razão Social do fornecedor" : "Nome ou empresa prestadora"} />
                </div>

                {isMat
                  ? <div><label style={S.label}>CNPJ</label><input value={fornForm.cnpj} onChange={e => setFornField("cnpj", e.target.value)} style={S.input} placeholder="00.000.000/0001-00" /></div>
                  : fornForm.subtipo === "PF"
                    ? <div><label style={S.label}>CPF</label><input value={fornForm.cpf} onChange={e => setFornField("cpf", e.target.value)} style={S.input} placeholder="000.000.000-00" /></div>
                    : <div><label style={S.label}>CNPJ</label><input value={fornForm.cnpj} onChange={e => setFornField("cnpj", e.target.value)} style={S.input} placeholder="00.000.000/0001-00" /></div>
                }

                {isMat
                  ? <div><label style={S.label}>Categoria de Fornecimento</label>
                      <select value={fornForm.categoriaMaterial} onChange={e => setFornField("categoriaMaterial", e.target.value)} style={S.input}>
                        {(["", ...CATEG_MATERIAL] as string[]).map(c => <option key={c} value={c}>{c || "— Selecione —"}</option>)}
                      </select></div>
                  : <div><label style={S.label}>Especialidade</label>
                      <select value={fornForm.especialidade} onChange={e => setFornField("especialidade", e.target.value)} style={S.input}>
                        {(["", "Civil", "Elétrico", "RF", "Montagem Metálica", "Project Management", "Técnico de Campo", "Supervisor", "Operação & Manutenção"] as string[]).map(ev => <option key={ev} value={ev}>{ev || "— Selecione —"}</option>)}
                      </select></div>
                }

                <div><label style={S.label}>Contato</label>
                  <input value={fornForm.contato} onChange={e => setFornField("contato", e.target.value)} style={S.input} placeholder="Nome do responsável" /></div>
                <div><label style={S.label}>Telefone</label>
                  <input value={fornForm.telefone} onChange={e => setFornField("telefone", e.target.value)} style={S.input} placeholder="(00) 00000-0000" /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>E-mail</label>
                  <input value={fornForm.email} onChange={e => setFornField("email", e.target.value)} style={S.input} placeholder="email@empresa.com" /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Região de Atuação</label>
                  <input value={fornForm.regiao} onChange={e => setFornField("regiao", e.target.value)} style={S.input} placeholder="Ex: São Paulo / Nacional / Norte e Nordeste" /></div>

                <div style={{ gridColumn: "1/-1", background: T.bg3, borderRadius: 10, padding: 12, border: `1px solid ${T.brBase}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.txMut, letterSpacing: "0.06em", marginBottom: 10 }}>
                    💳 DADOS BANCÁRIOS / PIX
                    {!isMat && <span style={{ color: T.amber, fontWeight: 400, marginLeft: 8 }}>— obrigatório para pagamentos</span>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={S.label}>Chave PIX</label><input value={fornForm.chavePix} onChange={e => setFornField("chavePix", e.target.value)} style={S.input} placeholder="CPF, CNPJ, e-mail ou telefone" /></div>
                    <div><label style={S.label}>Banco</label><input value={fornForm.banco} onChange={e => setFornField("banco", e.target.value)} style={S.input} placeholder="Ex: Nubank, Itaú, BB" /></div>
                    <div><label style={S.label}>Agência</label><input value={fornForm.agencia} onChange={e => setFornField("agencia", e.target.value)} style={S.input} placeholder="0000" /></div>
                    <div><label style={S.label}>Conta</label><input value={fornForm.conta} onChange={e => setFornField("conta", e.target.value)} style={S.input} placeholder="00000-0" /></div>
                  </div>
                </div>

                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Observações</label>
                  <textarea value={fornForm.obs} onChange={e => setFornField("obs", e.target.value)}
                    style={{ ...S.input, resize: "vertical", minHeight: 60 }}
                    placeholder={isMat ? "Condições comerciais, prazo de entrega, certificações..." : "Disponibilidade, condições contratuais, notas..."} /></div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowFornModal(false); setFornSelectOnSave(false); }} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
                <button onClick={save} style={{ ...S.btn, flex: 2, padding: 10, background: isMat ? "linear-gradient(135deg,#065f46,#34d399)" : undefined }}>
                  {editForn ? "Salvar Alterações" : `Adicionar ${isMat ? "Fornecedor" : "Prestador"}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: CLIENTES
  // ════════════════════════════════════════════════════════════════════
  const TabClientes = () => {
    const TIPOS_CLI = ["Sharing", "Operadora", "Outro"];
    const TIPO_CLI_COLOR = { Sharing: T.purple, Operadora: T.blue, Outro: T.txMut };
    const search = cliSearch; const setSearch = setCliSearch;
    const filterTipo = cliFilterTipo; const setFilterTipo = setCliFilterTipo;
    const filtered = clientes.filter(c =>
      (filterTipo === "TODOS" || c.tipo === filterTipo) &&
      (c.nome.toLowerCase().includes(search.toLowerCase()) || (c.cnpj || "").includes(search))
    );
    const openNew = () => { setEditCliente(null); setClienteForm(clienteFormInit); setShowClienteModal(true); };
    const openEdit = (c) => { setEditCliente(c); setClienteForm({ nome: c.nome, cnpj: c.cnpj || "", tipo: c.tipo, contato: c.contato || "", telefone: c.telefone || "", email: c.email || "", regiao: c.regiao || "", obs: c.obs || "", contratoNumero: c.contratoNumero || "", contratoVigencia: c.contratoVigencia || "", slaGarantia: c.slaGarantia || 30, pos: c.pos || [] }); setShowClienteModal(true); };
    const save = () => {
      if (!clienteForm.nome.trim()) return;
      if (editCliente) setClientes(prev => prev.map(c => c.id === editCliente.id ? { ...c, ...clienteForm } : c));
      else setClientes(prev => [...prev, { id: `cli_${Date.now()}`, ...clienteForm }]);
      setShowClienteModal(false); setEditCliente(null);
    };

    // Obras vinculadas por cliente
    const obrasDoCliente = (nome) => projetos.filter(p =>
      p.sharing === nome || p.operadora === nome || p.Sharing === nome
    );

    return (
      <div>
        <SectionHeader icon="🤝" title="Clientes" subtitle={`${clientes.length} cadastrado(s) · Sharings, Operadoras e Sharings`} color={T.purple} action={<button onClick={openNew} style={{ ...S.btn, background: "linear-gradient(135deg,#6d28d9,#a78bfa)", boxShadow: `0 2px 10px ${T.purple}35` }}>+ Adicionar Cliente</button>} />

        {/* KPIs por tipo */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
          {TIPOS_CLI.map(t => {
            const c = TIPO_CLI_COLOR[t];
            const n = clientes.filter(x => x.tipo === t).length;
            return (
              <div key={t} onClick={() => setFilterTipo(filterTipo === t ? "TODOS" : t)}
                style={{ ...S.card, borderLeft: `3px solid ${c}`, cursor: "pointer", opacity: filterTipo !== "TODOS" && filterTipo !== t ? 0.4 : 1, transition: "opacity 0.15s" }}>
                <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 4 }}>{t.toUpperCase()}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: c }}>{n}</div>
              </div>
            );
          })}
        </div>

        {/* Busca */}
        <div style={{ marginBottom: 14 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, maxWidth: 320 }} placeholder="🔍 Buscar por nome ou CNPJ..." />
        </div>

        {/* Grid de cards */}
        {filtered.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤝</div>
            <div style={{ color: T.txMut, fontSize: 14 }}>Nenhum cliente encontrado</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
            {filtered.map(c => {
              const tc = TIPO_CLI_COLOR[c.tipo] || T.txMut;
              const obras = obrasDoCliente(c.nome);
              return (
                <div key={c.id} style={{ ...S.card, borderLeft: `3px solid ${tc}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.txPri, marginBottom: 4 }}>{c.nome}</div>
                      <span style={{ background: tc + "18", color: tc, border: `1px solid ${tc}40`, padding: "2px 9px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{c.tipo}</span>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => openEdit(c)} style={{ ...S.ghost, padding: "4px 9px", fontSize: 13 }}>✏️</button>
                      <button onClick={() => setClientes(prev => prev.filter(x => x.id !== c.id))} style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "4px 9px", fontSize: 13 }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    {c.cnpj && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>CNPJ: </span><span style={{ color: T.txSec }}>{c.cnpj}</span></div>}
                    {c.contato && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Contato: </span><span style={{ color: T.txSec, fontWeight: 600 }}>{c.contato}</span></div>}
                    {c.telefone && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Tel: </span><span style={{ color: T.txSec }}>{c.telefone}</span></div>}
                    {c.email && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>E-mail: </span><a href={`mailto:${c.email}`} style={{ color: T.blue }}>{c.email}</a></div>}
                    {c.regiao && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Região: </span><span style={{ color: T.txSec }}>{c.regiao}</span></div>}
                    {c.contratoNumero && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Contrato: </span><span style={{ color: T.txSec }}>{c.contratoNumero}</span>{c.contratoVigencia ? <span style={{ color: T.txMut }}> · vigência {c.contratoVigencia}</span> : null}</div>}
                    {c.slaGarantia && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>SLA pagamento: </span><span style={{ color: T.txSec }}>{c.slaGarantia} dias</span></div>}
                    {(c.pos || []).length > 0 && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>POs: </span><span style={{ color: T.green, fontWeight: 700 }}>{(c.pos || []).length} cadastrado(s)</span></div>}
                    {c.obs && <div style={{ fontSize: 13, color: T.txMut, background: T.bg3, borderRadius: 5, padding: "4px 8px", marginTop: 2 }}>💬 {c.obs}</div>}
                  </div>
                  {/* Obras vinculadas */}
                  {obras.length > 0 && (
                    <div style={{ borderTop: `1px solid ${T.brSub}`, paddingTop: 8 }}>
                      <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 5 }}>OBRAS VINCULADAS ({obras.length})</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {obras.map(o => (
                          <button key={o.id} onClick={() => { setProjetoSel(o.id); setObraTab("resumo"); setTab("controle"); }}
                            style={{ background: T.blue + "18", color: T.blue, border: `1px solid ${T.blue}30`, borderRadius: 5, padding: "2px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            {o.siteIdSharing || o.siteId || ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {showClienteModal && (
          <div style={{ position: "fixed", inset: 0, background: "#000000c0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}>
            <div style={{ background: T.bg2, borderRadius: 14, border: `1px solid ${T.brBase}`, padding: 26, width: 520, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.purple, marginBottom: 18 }}>{editCliente ? "✏️ Editar Cliente" : "➕ Novo Cliente"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Nome / Razão Social</label>
                  <input value={clienteForm.nome} onChange={e => setClienteField("nome", e.target.value)} style={S.input} placeholder="Nome do cliente" /></div>
                <div><label style={S.label}>CNPJ</label>
                  <input value={clienteForm.cnpj} onChange={e => setClienteField("cnpj", e.target.value)} style={S.input} placeholder="00.000.000/0001-00" /></div>
                <div><label style={S.label}>Tipo</label>
                  <select value={clienteForm.tipo} onChange={e => setClienteField("tipo", e.target.value)} style={S.input}>
                    {TIPOS_CLI.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label style={S.label}>Contato (nome)</label>
                  <input value={clienteForm.contato} onChange={e => setClienteField("contato", e.target.value)} style={S.input} placeholder="Nome do responsável" /></div>
                <div><label style={S.label}>Telefone</label>
                  <input value={clienteForm.telefone} onChange={e => setClienteField("telefone", e.target.value)} style={S.input} placeholder="(00) 00000-0000" /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>E-mail</label>
                  <input value={clienteForm.email} onChange={e => setClienteField("email", e.target.value)} style={S.input} placeholder="email@cliente.com" /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Região de Atuação</label>
                  <input value={clienteForm.regiao} onChange={e => setClienteField("regiao", e.target.value)} style={S.input} placeholder="Ex: Nacional / Norte / Sul e Sudeste" /></div>

                {/* Dados contratuais */}
                <div style={{ gridColumn: "1/-1", background: T.bg3, borderRadius: 10, padding: 12, border: `1px solid ${T.brBase}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.txMut, letterSpacing: "0.06em", marginBottom: 10 }}>📄 CONTRATO</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div><label style={S.label}>Nº Contrato</label><input value={clienteForm.contratoNumero} onChange={e => setClienteField("contratoNumero", e.target.value)} style={S.input} placeholder="Ex: CT-2026-001" /></div>
                    <div><label style={S.label}>Vigência</label><input value={clienteForm.contratoVigencia} onChange={e => setClienteField("contratoVigencia", e.target.value)} style={S.input} placeholder="Ex: 12/2027" /></div>
                    <div><label style={S.label}>SLA Pagamento (dias)</label><input type="number" value={clienteForm.slaGarantia} onChange={e => setClienteField("slaGarantia", Number(e.target.value))} style={S.input} placeholder="30" /></div>
                  </div>
                </div>

                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Observações</label>
                  <textarea value={clienteForm.obs} onChange={e => setClienteField("obs", e.target.value)} style={{ ...S.input, resize: "vertical", minHeight: 60 }} placeholder="Contratos ativos, particularidades, histórico..." /></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowClienteModal(false)} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
                <button onClick={save} style={{ ...S.btn, flex: 2, padding: 10, background: "linear-gradient(135deg,#6d28d9,#a78bfa)" }}>{editCliente ? "Salvar Alterações" : "Adicionar Cliente"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: RESUMO
  // ════════════════════════════════════════════════════════════════════
  const TabResumo = () => {
    const byCategory = CATEGORIAS.map(cat => {
      const items = orcItems.filter(i => i.resumo === cat);
      const totals = items.reduce((acc, item) => {
        const itemTotals = calcItemFinance(item);
        acc.base += itemTotals.totalBruto;
        acc.liquido += itemTotals.totalLiquido;
        acc.final += itemTotals.totalFinal;
        return acc;
      }, { base: 0, liquido: 0, final: 0 });
      return { cat, items, base: totals.base, liquido: totals.liquido, final: totals.final };
    }).filter(x => x.items.length > 0);

    return (
      <div>
        <SectionHeader icon="📈" title="Resumo do Orçamento" subtitle="Composição de custos e totais por categoria" color={T.blue} />
        {orcItems.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
            <div style={{ color: T.txMut, fontSize: 14 }}>Adicione itens na aba Orçamento para ver o resumo</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 14 }}>💰 Composição de Custos</div>
              {[ 
                { l: "Custo Mercado (Médio)", v: totalMercado, c: T.txMut },
                { l: "TOTAL BRUTO", v: totalCustom, c: T.txSec },
                { l: `(-) DESCONTO ${discount}%`, v: -totalDesconto, c: T.red },
                { l: "= TOTAL LÍQUIDO FINAL", v: totalLiquido, c: T.txPri, bold: true },
                { l: `(+) BDI ${bdi}%`, v: totalBdiValor, c: T.purple },
                { l: `(+) Lucro ${lucro}%`, v: totalLucroValor, c: T.green },
                { l: "= TOTAL FINAL", v: totalFinal, c: T.amber, bold: true, big: true },
              ].map(({ l, v, c, bold, big }) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.brSub}` }}>
                  <span style={{ fontSize: 14, color: bold ? T.txSec : T.txMut }}>{l}</span>
                  <span style={{ fontSize: big ? 17 : 13, fontWeight: bold ? 900 : 600, color: c }}>{fmt(v)}</span>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 14 }}>📦 Por Categoria</div>
              {byCategory.map(({ cat, items, base, final }) => (
                <div key={cat} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.txSec }}>{cat} <span style={{ color: T.txMut, fontWeight: 400 }}>({items.length})</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.amber }}>{fmt(final)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: T.bg4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct(base, totalCustom)}%`, background: T.blue, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...S.card, gridColumn: "span 2" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 14 }}>📋 Itens Selecionados</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${T.brBase}` }}>
                    {["ITEM", "CATEGORIA", "DESCRIÇÃO", "CONFIG.", "QTD", "UNID", "VL UNITÁRIO", "DESC. R$", "VL UNIT. C/DESC", "VL TOTAL"].map(h => (
                      <th key={h} style={{ padding: "7px 8px", textAlign: h.startsWith("VL") ? "right" : "left", color: T.txMut, fontWeight: 700, fontSize: 12, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {orcItems.map((item, i) => {
                      const itemTotals = calcItemFinance(item);
                      return (
                      <tr key={item.cod} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 === 0 ? "transparent" : T.bg1 + "50" }}>
                        <td style={{ padding: "7px 8px", color: T.blue, fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</td>
                        <td style={{ padding: "7px 8px" }}><span style={{ background: T.bg4, color: T.txSec, padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{item.resumo}</span></td>
                        <td style={{ padding: "7px 8px", color: T.txSec, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.solucao}>{item.solucao}</td>
                        <td style={{ padding: "7px 8px", color: T.txMut, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.config || "—"}</td>
                        <td style={{ padding: "7px 8px", color: T.txPri, fontWeight: 600, textAlign: "center" }}>{item.qtde}</td>
                        <td style={{ padding: "7px 8px", color: T.txMut, textAlign: "center" }}>{item.unid}</td>
                        <td style={{ padding: "7px 8px", color: T.green, fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(itemTotals.unitOriginal)}</td>
                        <td style={{ padding: "7px 8px", color: T.red, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(itemTotals.discountUnit)}</td>
                        <td style={{ padding: "7px 8px", color: T.green, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(itemTotals.unitNet)}</td>
                        <td style={{ padding: "7px 8px", color: T.amber, fontWeight: 700, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(itemTotals.totalLiquido)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: DASHBOARD FINANCEIRO
  // ════════════════════════════════════════════════════════════════════
  const TabDashboard = () => {
    const ALIQUOTA = 0.2204;
    const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const fmtMes = (mmyyyy: string) => { const [mm, yyyy] = mmyyyy.split("/"); return `${MESES_PT[parseInt(mm)-1]} ${yyyy}`; };

    // ── Meses disponíveis (últimos 12 + meses com dados)
    const mesesSet = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      mesesSet.add(`${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`);
    }
    projetos.forEach(p => {
      const raw = p.dataOrcamento || p.dataInicioAtividade;
      if (!raw) return;
      const parts = raw.split('/');
      if (parts.length >= 3) mesesSet.add(`${parts[1]}/${parts[2]}`);
    });
    const mesesDisp = [...mesesSet].sort((a, b) => {
      const [ma, ya] = a.split('/').map(Number); const [mb, yb] = b.split('/').map(Number);
      return (yb - ya) || (mb - ma);
    });
    const mesSel = dashMes;

    // ── Projetos acionados no mês selecionado (base: data de acionamento)
    const projetosDoMes = projetos.filter(p => {
      const raw = p.dataOrcamento || p.dataInicioAtividade;
      if (!raw) return false;
      const parts = raw.split('/');
      return parts.length >= 3 && `${parts[1]}/${parts[2]}` === mesSel;
    });

    // ── KPIs financeiros do mês
    const valorAtividades = roundCurrency(projetosDoMes.reduce((s, p) => s + calcBudgetEfetivo(p), 0));
    const custoMaterial   = roundCurrency(projetosDoMes.reduce((s, p) => s + calcNFPago(p), 0));
    const custoMaoDeObra  = roundCurrency(projetosDoMes.reduce((s, p) => s + calcPagamentosServicoPago(p), 0));
    const custoDespesas   = roundCurrency(projetosDoMes.reduce((s, p) => s + calcDespesasGeraisConfirmadas(p), 0));
    const custoTotal      = roundCurrency(custoMaterial + custoMaoDeObra + custoDespesas);
    const impostos        = roundCurrency(valorAtividades * ALIQUOTA);
    const valorLiquido    = roundCurrency(valorAtividades - impostos - custoTotal);
    const margemLiq       = valorAtividades > 0 ? Math.round((valorLiquido / valorAtividades) * 100) : 0;

    // ── Status das atividades do mês
    const stCounts = {
      total:       projetosDoMes.length,
      andamento:   projetosDoMes.filter(p => p.status === "Em Andamento").length,
      concluidas:  projetosDoMes.filter(p => p.status === "Concluído").length,
      planejado:   projetosDoMes.filter(p => p.status === "Planejado").length,
      pausado:     projetosDoMes.filter(p => p.status === "Pausado").length,
      cancelado:   projetosDoMes.filter(p => p.status === "Cancelado").length,
    };

    // ── PIPELINE: visão geral de TODOS os projetos ativos (independente do mês)
    const APTOS_STATUS = new Set(["Em Andamento", "Concluído"]);
    const aptasFaturar    = projetos.filter(p => APTOS_STATUS.has(p.status) && !!p.po);
    const semPO           = projetos.filter(p => APTOS_STATUS.has(p.status) && !p.po);
    const semNF           = projetos.filter(p => APTOS_STATUS.has(p.status) && !!p.po && calcNFPago(p) === 0 && calcPagamentosServicoPago(p) === 0);
    const emEsteira       = projetos.filter(p => p.status === "Planejado");
    const valorAptasFat   = roundCurrency(aptasFaturar.reduce((s, p) => s + calcBudgetEfetivo(p), 0));
    const valorSemPO      = roundCurrency(semPO.reduce((s, p) => s + calcBudgetEfetivo(p), 0));

    const KpiCard = ({ icon, label, value, sub, color, children = null }: any) => (
      <div style={{ ...S.card, borderTop: `3px solid ${color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: T.txMut, textTransform: "uppercase" }}>{label}</span>
          <span style={{ ...iconBox(color, true), width: 30, height: 30, borderRadius: 8 }}><span style={{ fontSize: 15 }}>{icon}</span></span>
        </div>
        <div style={{ fontSize: 23, fontWeight: 900, color, letterSpacing: "-0.03em" }}>{value}</div>
        <div style={{ fontSize: 11, color: T.txDis, marginTop: 4 }}>{sub}</div>
        {children}
      </div>
    );

    return (
      <div>
        {/* Header */}
        <SectionHeader icon="📈" title="Dashboard Financeiro" subtitle={`Realização financeira e pipeline de atividades — ${fmtMes(mesSel)}`} color={T.green}
          action={
            <select value={mesSel} onChange={e => setDashMes(e.target.value)}
              style={{ ...S.input, minWidth: 170, fontWeight: 700, color: T.blue, border: `1px solid ${T.blue}40`, background: T.bg2, cursor: "pointer", fontSize: 13 }}>
              {mesesDisp.map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
            </select>
          }
        />

        {/* ── Seção 1: KPIs Financeiros ── */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.txDis, marginBottom: 10, paddingLeft: 2 }}>REALIZAÇÃO FINANCEIRA — {fmtMes(mesSel).toUpperCase()}</div>

        {/* Linha 1: Valor, Impostos, Valor Líquido */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
          <KpiCard icon="💼" label="Valor Total das Atividades" value={fmt(valorAtividades)} sub={`${stCounts.total} atividade(s) acionadas no mês`} color={T.blue} />
          <KpiCard icon="🏛️" label={`Impostos (${(ALIQUOTA*100).toFixed(2)}%)`} value={fmt(impostos)} sub="Alíquota composta aplicada sobre o valor" color={T.red} />
          <KpiCard icon="✅" label="Valor Líquido das Atividades" value={fmt(valorLiquido)} sub={`Margem líquida: ${margemLiq}%`} color={valorLiquido >= 0 ? T.green : T.red} />
        </div>

        {/* Linha 2: Custo detalhado */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          <KpiCard icon="🧾" label="Material (NFs Pagas)" value={fmt(custoMaterial)}
            sub={`${valorAtividades > 0 ? Math.round((custoMaterial/valorAtividades)*100) : 0}% do valor das atividades`} color={T.green} />
          <KpiCard icon="👷" label="Mão de Obra (Serviços)" value={fmt(custoMaoDeObra)}
            sub={`${valorAtividades > 0 ? Math.round((custoMaoDeObra/valorAtividades)*100) : 0}% do valor das atividades`} color={T.purple} />
          <KpiCard icon="💸" label="Custo Total (Mat + MO + Desp)"
            value={fmt(custoTotal)}
            sub={`Desp. gerais: ${fmt(custoDespesas)} · ${valorAtividades > 0 ? Math.round((custoTotal/valorAtividades)*100) : 0}% do valor`}
            color={T.amber} />
        </div>

        {/* ── Seção 2: Status + Composição ── */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.txDis, marginBottom: 10, paddingLeft: 2 }}>STATUS DAS ATIVIDADES — {fmtMes(mesSel).toUpperCase()}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <div style={{ ...S.card }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { label: "Total",        v: stCounts.total,      c: T.blue },
                { label: "Em Andamento", v: stCounts.andamento,  c: T.amber },
                { label: "Concluídas",   v: stCounts.concluidas, c: T.green },
                { label: "Planejado",    v: stCounts.planejado,  c: T.purple },
                { label: "Pausado",      v: stCounts.pausado,    c: T.orange },
                { label: "Cancelado",    v: stCounts.cancelado,  c: T.red },
              ].map(({ label, v, c }) => (
                <div key={label} style={{ textAlign: "center", background: T.bg3, borderRadius: 10, padding: "12px 6px", border: v > 0 ? `1px solid ${c}30` : "none" }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: v > 0 ? c : T.txDis }}>{v}</div>
                  <div style={{ fontSize: 10, color: T.txMut, fontWeight: 600, marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...S.card }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.txSec, marginBottom: 14, letterSpacing: "0.06em", textTransform: "uppercase" }}>Composição do Resultado</div>
            {valorAtividades > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Valor Bruto",         v: valorAtividades, pct: 100,                                                           c: T.blue },
                  { label: "(-) Material (NF)",   v: custoMaterial,   pct: Math.round((custoMaterial/valorAtividades)*100),               c: T.green },
                  { label: "(-) Mão de Obra",     v: custoMaoDeObra,  pct: Math.round((custoMaoDeObra/valorAtividades)*100),              c: T.purple },
                  { label: "(-) Impostos 22,04%", v: impostos,        pct: Math.round((impostos/valorAtividades)*100),                    c: T.red },
                  { label: "= Valor Líquido",     v: valorLiquido,    pct: Math.abs(Math.round((valorLiquido/valorAtividades)*100)),      c: valorLiquido >= 0 ? T.green : T.red },
                ].map(({ label, v, pct, c }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: T.txMut }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{fmt(v)} <span style={{ fontSize: 10, color: T.txDis }}>({pct}%)</span></span>
                    </div>
                    <ProgBar v={Math.abs(v)} max={valorAtividades} color={c} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: T.txDis, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
                Sem atividades em {fmtMes(mesSel)}
              </div>
            )}
          </div>
        </div>

        {/* ── Seção 3: Pipeline / Esteira ── */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", color: T.txDis, marginBottom: 10, paddingLeft: 2 }}>PIPELINE — VISÃO GERAL DA CARTEIRA ATIVA</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
          {[
            { icon: "✅", label: "Aptas a Faturar", v: aptasFaturar.length, valor: valorAptasFat, c: T.green,  sub: "Em Andamento / Concluído + PO" },
            { icon: "⚠️", label: "Aguardando PO",   v: semPO.length,        valor: valorSemPO,    c: T.amber,  sub: "Ativas mas sem PO vinculado" },
            { icon: "🔄", label: "Sem Realiz. Fin.", v: semNF.length,        valor: 0,             c: T.blue,   sub: "Com PO porém sem NF ou pagamento" },
            { icon: "📋", label: "Na Esteira",       v: emEsteira.length,    valor: 0,             c: T.purple, sub: "Planejadas ainda não iniciadas" },
          ].map(({ icon, label, v, valor, c, sub }) => (
            <div key={label} style={{ ...S.card, borderLeft: `3px solid ${c}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.txMut, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
                <span style={{ fontSize: 18 }}>{icon}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: v > 0 ? c : T.txDis }}>{v}</div>
              {valor > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: c, marginTop: 2 }}>{fmt(valor)}</div>}
              <div style={{ fontSize: 11, color: T.txDis, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Tabela pipeline: projetos aptos a faturar */}
        {aptasFaturar.length > 0 && (
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 12 }}>✅ Aptas a Faturar ({aptasFaturar.length})</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ background: T.bg3, borderBottom: `1px solid ${T.brStrong}` }}>
                  {["Site / Op.", "Fornecedor", "Status", "Budget", "NF (Mat.)", "MO (Serv.)", "Saldo", "Av."].map(h => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: T.txMut, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {aptasFaturar.map((p, i) => {
                    const bud = calcBudgetEfetivo(p); const mat = calcNFPago(p);
                    const mo  = calcPagamentosServicoPago(p); const sal = calcSaldoProjeto(p);
                    const av  = getAvancoEfetivo(p); const sc = ST_COLOR[p.status] || T.txMut;
                    return (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${T.brSub}`, background: i%2===0?"transparent":T.bg3+"80", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = T.green+"10"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = i%2===0?"transparent":T.bg3+"80"}
                        onClick={() => { setProjetoSel(p.id); setObraTab("resumo"); setTab("controle"); }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 800, color: T.purple, fontSize: 12 }}>{p.siteIdSharing || "—"}</div>
                          {p.siteIdOperadora && <div style={{ fontSize: 10, color: T.blue }}>{p.siteIdOperadora}</div>}
                        </td>
                        <td style={{ padding: "8px 10px", color: T.txSec, fontSize: 11 }}>{p.fornecedor || "—"}</td>
                        <td style={{ padding: "8px 10px" }}><span style={{ background: sc+"18", color: sc, border: `1px solid ${sc}40`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{p.status}</span></td>
                        <td style={{ padding: "8px 10px", color: T.txPri, fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 }}>{fmt(bud)}</td>
                        <td style={{ padding: "8px 10px", color: T.green,  fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{fmt(mat)}</td>
                        <td style={{ padding: "8px 10px", color: T.purple, fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{fmt(mo)}</td>
                        <td style={{ padding: "8px 10px", color: sal<0?T.red:T.cyan, fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{fmt(sal)}</td>
                        <td style={{ padding: "8px 10px", minWidth: 70 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.bg4, overflow: "hidden" }}><div style={{ height: "100%", width: `${av}%`, background: av>=100?T.green:T.blue, borderRadius: 2 }} /></div>
                            <span style={{ fontSize: 10, fontWeight: 700 }}>{av}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tabela: aguardando PO */}
        {semPO.length > 0 && (
          <div style={{ ...S.card, borderLeft: `3px solid ${T.amber}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, marginBottom: 12 }}>⚠️ Aguardando PO — Bloqueadas para Faturamento ({semPO.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {semPO.map(p => {
                const bud = calcBudgetEfetivo(p); const sc = ST_COLOR[p.status] || T.txMut;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: T.bg3, borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}
                    onClick={() => { setProjetoSel(p.id); setObraTab("resumo"); setTab("controle"); }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 800, color: T.purple }}>{p.siteIdSharing || "—"}</span>
                      {p.siteIdOperadora && <span style={{ color: T.blue, marginLeft: 8, fontSize: 12 }}>{p.siteIdOperadora}</span>}
                      <span style={{ color: T.txDis, fontSize: 12, marginLeft: 8 }}>{p.fornecedor || ""}</span>
                    </div>
                    <span style={{ background: sc+"18", color: sc, border: `1px solid ${sc}40`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{p.status}</span>
                    <span style={{ color: T.txPri, fontWeight: 700, fontSize: 13 }}>{fmt(bud)}</span>
                    <span style={{ color: T.amber, fontSize: 11, fontWeight: 600 }}>Sem PO →</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // TAB: HISTÓRICO
  // ════════════════════════════════════════════════════════════════════
  const TabHistorico = () => {
    const STATUS_ORC = {
      "Rascunho": { color: T.txMut, bg: T.bg3, icon: "✏️", label: "Rascunho" },
      "Validado": { color: T.green, bg: T.green + "18", icon: "🛡️", label: "Validado" },
      "Enviado": { color: T.blue, bg: T.blue + "18", icon: "📤", label: "Enviado" },
      "Aprovado": { color: T.green, bg: T.green + "18", icon: "✅", label: "Aprovado" },
      "Rejeitado": { color: T.red, bg: T.red + "18", icon: "❌", label: "Rejeitado" },
    };
    const editOrc = null; // não usado — edição é direta no historico state
    const editMsg = orcEditMsg;
    const setEditMsg = setOrcEditMsg;

    // ── Se orc selecionado não existe mais, o useEffect no App já limpa

    // ── Se há um orçamento selecionado, mostra o detalhe
    if (orcSel) {
      const orc = historico.find(o => o.id === orcSel);
      if (!orc) return null;
      const legacyOrc = hydrateLegacyBudget(orc);
      const si = legacyOrc.siteInfo || {};
      const st = STATUS_ORC[orc.status] || STATUS_ORC["Rascunho"];
      const totalOrc = legacyOrc.totalBruto || 0;

      // Helpers de edição inline do orçamento
      const updSite = (k, v) => setHistorico(prev => prev.map(o => o.id === orc.id ? hydrateLegacyBudget({ ...o, siteInfo: { ...o.siteInfo, [k]: v } }) : o));
      const updOrc = (k, v) => setHistorico(prev => prev.map(o => o.id === orc.id ? hydrateLegacyBudget({ ...o, [k]: v }) : o));
      const updItem = (cod, field, val) => setHistorico(prev => prev.map(o => o.id === orc.id ? hydrateLegacyBudget({ ...o, itens: o.itens.map(i => i.cod === cod ? { ...i, [field]: Number(val) || 0 } : i) }) : o));
      const remItem = (cod) => setHistorico(prev => prev.map(o => o.id === orc.id ? hydrateLegacyBudget({ ...o, itens: o.itens.filter(i => i.cod !== cod) }) : o));

      const totalDetalhe = legacyOrc.totalFinal || 0;

      return (
        <div>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setOrcSel(null)} style={{ background: T.bg3, border: `1px solid ${T.brBase}`, color: T.txSec, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 5 }}>
              ← Voltar
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Excluir o orçamento ${orc.id}?\n\nEsta ação não pode ser desfeita.`)) {
                  setHistorico(prev => prev.filter(o => o.id !== orc.id));
                  setOrcSel(null);
                }
              }}
              style={{
                background: "transparent", border: `1px solid ${T.red}40`, color: T.red,
                borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 5
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.red + "18"; e.currentTarget.style.borderColor = T.red; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = T.red + "40"; }}>
              🗑 Excluir
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: T.blue }}>{orc.id}</span>
                <span style={{ background: st.bg, color: st.color, padding: "3px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700, border: `1px solid ${st.color}40` }}>
                  {st.icon} {st.label}
                </span>
                <span style={{
                  background: orc.projetoId ? T.green + "18" : T.bg3,
                  color: orc.projetoId ? T.green : T.txMut,
                  border: `1px solid ${orc.projetoId ? T.green + "40" : T.brBase}`,
                  padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700
                }}>
                  {getBudgetModeLabel(orc)}
                </span>
                <span style={{ fontSize: 13, color: T.txDis }}>{orc.data} · {orc.area}</span>
                {orc.projetoId && (
                  <button onClick={() => openLinkedProject(orc.projetoId)}
                    style={{ background: T.green + "18", color: T.green, border: `1px solid ${T.green}40`, borderRadius: 6, padding: "3px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    🏗️ Ver Obra → {orc.projetoId.slice(-6)}
                  </button>
                )}
              </div>
            </div>
            {/* Ações */}
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              {/* Botão de status */}
              {!orc.projetoId && (
                <select value={orc.status || "Rascunho"} onChange={e => updOrc("status", e.target.value)}
                  style={{ ...S.input, padding: "6px 10px", fontSize: 13, width: "auto", cursor: "pointer" }}>
                  {Object.keys(STATUS_ORC).map(s => <option key={s}>{s}</option>)}
                </select>
              )}
              {!orc.projetoId && orc.status !== "Validado" && (
                <button
                  onClick={() => updateHistoricBudgetStatus(orc.id, "Validado")}
                  style={{ ...S.ghost, fontSize: 12, padding: "5px 10px", color: T.green, borderColor: T.green + "40" }}
                >
                  🛡️ Validar p/ Cliente
                </button>
              )}
              {!orc.projetoId && orc.status === "Validado" && (
                <span
                  style={{ background: T.green + "18", color: T.green, border: `1px solid ${T.green}40`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}
                >
                  🛡️ Orçamento Validado
                </span>
              )}
              <button onClick={() => { setEditMsg(""); salvarOrc(legacyOrc); setEditMsg("✅ Salvo!"); setTimeout(() => setEditMsg(""), 3000); }}
                style={{ ...S.ghost, fontSize: 12, padding: "5px 10px" }}>
                💾 Salvar edições
              </button>
              <button onClick={() => gerarPdfOrcamento(legacyOrc, LOGO_B64)}
                style={{ ...S.ghost, fontSize: 12, padding: "5px 10px", color: T.amber, borderColor: T.amber + "40" }}>
                📄 Baixar PDF
              </button>
              {!orc.projetoId && (
                <button onClick={() => openBudgetLinkModal(orc)}
                  style={{ ...S.ghost, fontSize: 12, padding: "5px 10px", color: T.blue, borderColor: T.blue + "40" }}>
                  🔗 Vincular atividade
                </button>
              )}
              {!orc.projetoId && (
                <button onClick={() => openCreateActivityFromBudget(orc)}
                  style={{ ...S.ghost, fontSize: 12, padding: "5px 10px", color: T.green, borderColor: T.green + "40" }}>
                  ➕ Criar atividade
                </button>
              )}
              {orc.status === "Aprovado" && !orc.projetoId && (
                <button onClick={() => aprovarOrcamento(orc)}
                  style={{
                    background: "linear-gradient(135deg,#065f46,#34d399)", color: "#fff", border: "none", borderRadius: 8,
                    padding: "8px 18px", cursor: "pointer", fontSize: 14, fontWeight: 800,
                    boxShadow: `0 4px 16px ${T.green}40`
                  }}>
                  🏗️ Iniciar Obra no Controle
                </button>
              )}
              {orc.status !== "Aprovado" && !orc.projetoId && (
                <button onClick={() => { updOrc("status", "Aprovado"); setTimeout(() => { }, 100); }}
                  style={{
                    background: "linear-gradient(135deg,#065f46,#34d399)", color: "#fff", border: "none", borderRadius: 8,
                    padding: "8px 18px", cursor: "pointer", fontSize: 14, fontWeight: 800,
                    opacity: 0.8
                  }}>
                  ✅ Marcar como Aprovado
                </button>
              )}
            </div>
          </div>
          {editMsg && <div style={{ background: T.green + "18", color: T.green, borderRadius: 7, padding: "6px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12, border: `1px solid ${T.green}30` }}>{editMsg}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* ── Informações do Site */}
            <div style={S.card}>
              <div style={{ fontWeight: 700, color: T.blue, fontSize: 14, marginBottom: 12 }}>📍 Informações do Site</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { l: "Site ID", k: "siteId", ph: "Ex: PAPCJ001" },
                  { l: "Operadora", k: "operadora", ph: "Ex: Vivo" },
                  { l: "Sharing", k: "sharingNome", ph: "Ex: Highline" },
                  { l: "Site Sharing", k: "siteIdSharing", ph: "Ex: HIG-001" },
                  { l: "UF", k: "uf", ph: "SP" },
                  { l: "Município", k: "municipio", ph: "Ex: Campinas" },
                ].map(({ l, k, ph }) => (
                  <div key={k}>
                    <label style={S.label}>{l}</label>
                    <input key={`${orc.id}-${k}`} defaultValue={si[k] || ""} onBlur={e => updSite(k, e.target.value)} onChange={e => updSite(k, e.target.value)} style={S.input} placeholder={ph} />
                  </div>
                ))}
                <div style={{ gridColumn: "span 2" }}>
                  <label style={S.label}>Endereço</label>
                  <input key={`${orc.id}-endereco`} defaultValue={si.endereco || ""} onBlur={e => updSite("endereco", e.target.value)} onChange={e => updSite("endereco", e.target.value)} style={S.input} placeholder="Rua, número, bairro..." />
                </div>
              </div>
            </div>

            {/* ── Parâmetros + Totais */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={S.card}>
                <div style={{ fontWeight: 700, color: T.purple, fontSize: 14, marginBottom: 12 }}>⚙️ Parâmetros</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { l: "Fornecedor", k: "fornecedor", full: true, type: "text", ph: "LS Office" },
                    { l: "Desconto %", k: "discount", type: "number" },
                    { l: "BDI %", k: "bdi", type: "number" },
                    { l: "Lucro %", k: "lucro", type: "number" },
                  ].map(({ l, k, type, ph, full }) => (
                    <div key={k} style={full ? { gridColumn: "span 3" } : {}}>
                      <label style={S.label}>{l}</label>
                    <input key={`${orc.id}-${k}`} type={type || "text"} defaultValue={legacyOrc[k] ?? ""} placeholder={ph || ""}
                        onBlur={e => updOrc(k, type === "number" ? Number(e.target.value) : e.target.value)}
                        onChange={e => { if (type === "number") updOrc(k, Number(e.target.value)); }}
                        style={{ ...S.input }} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={S.label}>Observações</label>
                  <textarea key={`${orc.id}-obs`} defaultValue={orc.obs || ""} onBlur={e => updOrc("obs", e.target.value)}
                    style={{ ...S.input, resize: "vertical", minHeight: 52, fontSize: 13 }} placeholder="Notas, condições, validade..." />
                </div>
              </div>
              <div style={{ ...S.card, background: `linear-gradient(135deg,${T.bg3},${T.bg2})`, border: `1px solid ${T.amber}30` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.txMut }}>Total Bruto</span>
                  <span style={{ fontSize: 14, color: T.txSec, fontWeight: 600 }}>{fmt(totalOrc)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.txMut }}>{`(-) Desconto ${legacyOrc.discount || 0}%`}</span>
                  <span style={{ fontSize: 14, color: T.red, fontWeight: 600 }}>{fmt(legacyOrc.discountValue || 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.txMut }}>Total Líquido</span>
                  <span style={{ fontSize: 14, color: T.cyan, fontWeight: 600 }}>{fmt(legacyOrc.totalLiquido || 0)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.txMut }}>Valor da Proposta</span>
                  <span style={{ fontSize: 14, color: T.green, fontWeight: 600 }}>{fmt(totalDetalhe)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${T.amber}20`, paddingTop: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.amber }}>TOTAL FINAL</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: T.amber }}>{fmt(totalDetalhe)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Tabela de Itens editável */}
          <div style={{ ...S.card, marginTop: 16, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.brBase}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.txSec }}>📦 Itens do Orçamento ({orc.itens?.length || 0})</span>
              <span style={{ fontSize: 13, color: T.txDis }}>Edite qtde e VL Unit diretamente</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: T.bg3 }}>
                  {["ITEM", "CATEGORIA", "DESCRIÇÃO", "CONFIG.", "QTD", "UNID", "VL UNITÁRIO", "DESC. R$", "VL UNIT. C/DESC", "VL TOTAL", ""].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: h.startsWith("VL") ? "right" : "left", color: T.amber, fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", borderBottom: `1px solid ${T.brBase}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                  {(legacyOrc.itens || []).map((item, i) => {
                    const itemTotals = calcLegacyBudgetItemTotals(item, legacyOrc);

                    return (
                      <tr key={item.cod} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 === 0 ? "transparent" : T.bg1 + "30" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 700, color: T.cyan }}>{String(i + 1).padStart(2, "0")}</td>
                        <td style={{ padding: "7px 10px", color: T.txMut, fontSize: 12 }}>{item.resumo?.toUpperCase()}</td>
                      <td style={{ padding: "7px 10px", color: T.txSec, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }} title={item.solucao}>{item.solucao?.slice(0, 50)}</td>
                      <td style={{ padding: "7px 10px", color: T.txMut, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{item.config || "—"}</td>
                      <td style={{ padding: "7px 6px", width: 70 }}>
                        <input key={`${orc.id}-${item.cod}-qtde`} type="number" min={0} defaultValue={item.qtde}
                          onBlur={e => updItem(item.cod, "qtde", e.target.value)}
                          style={{ ...S.input, padding: "3px 6px", width: "100%", textAlign: "center", fontSize: 14 }} />
                      </td>
                      <td style={{ padding: "7px 10px", color: T.txSec, textAlign: "center" }}>{item.unid}</td>
                        <td style={{ padding: "7px 6px", width: 110 }}>
                          <input key={`${orc.id}-${item.cod}-vl`} type="number" min={0} step={0.01} defaultValue={item.vl_custom}
                            onBlur={e => updItem(item.cod, "vl_custom", e.target.value)}
                            style={{ ...S.input, padding: "3px 6px", width: "100%", color: T.green, fontSize: 14, textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "7px 10px", color: T.red, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(itemTotals.discountUnit)}</td>
                        <td style={{ padding: "7px 10px", color: T.green, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(itemTotals.unitNet)}</td>
                        <td style={{ padding: "7px 10px", fontWeight: 700, color: T.amber, whiteSpace: "nowrap", textAlign: "right" }}>{fmt(itemTotals.totalLiquido)}</td>
                        <td style={{ padding: "7px 6px" }}>
                          <button onClick={() => remItem(item.cod)}
                            style={{ background: "transparent", border: "none", color: T.red, cursor: "pointer", fontSize: 14, padding: "2px 6px", opacity: 0.6 }}
                          onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                          onMouseLeave={e => e.currentTarget.style.opacity = "0.6"}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Botão Aprovar e Iniciar Obra (prominente) */}
          {!orc.projetoId && (
            <div style={{
              ...S.card, marginTop: 16,
              background: `linear-gradient(135deg,${T.bg3},${T.bg2})`,
              border: `1px solid ${T.blue}40`, borderLeft: `4px solid ${T.blue}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.blue, marginBottom: 4 }}>🧩 Controle de Obras</div>
                <div style={{ fontSize: 13, color: T.txSec }}>
                  Este orçamento pode continuar como <strong>simples</strong>, ser <strong>vinculado a uma atividade existente</strong> ou
                  abrir uma <strong>nova atividade no Controle de Obras</strong> com site, budget e dados principais preenchidos.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => openBudgetLinkModal(orc)}
                  style={{
                    ...S.ghost,
                    color: T.blue,
                    border: `1px solid ${T.blue}40`,
                    padding: "13px 18px",
                    fontSize: 14,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}>
                  🔗 Vincular atividade
                </button>
                <button
                  onClick={() => openCreateActivityFromBudget(orc)}
                  style={{
                    background: "linear-gradient(135deg,#065f46,#34d399)",
                    color: "#fff", border: "none", borderRadius: 10,
                    padding: "13px 24px", cursor: "pointer",
                    fontSize: 14, fontWeight: 800,
                    boxShadow: `0 4px 20px ${T.green}40`,
                    whiteSpace: "nowrap",
                  }}>
                  ➕ Criar atividade →
                </button>
              </div>
            </div>
          )}
          {orc.projetoId && (
            <div style={{
              ...S.card, marginTop: 16,
              background: T.green + "12", border: `1px solid ${T.green}40`,
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <span style={{ fontSize: 24 }}>🏗️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: T.green, fontSize: 13 }}>Obra criada no Controle de Obras</div>
                <div style={{ fontSize: 13, color: T.txSec }}>Projeto ID: <strong>{orc.projetoId}</strong></div>
              </div>
              <button onClick={() => openLinkedProject(orc.projetoId)}
                style={{ ...S.btn, background: T.green, color: "#fff", padding: "8px 18px", fontSize: 14 }}>
                Ver Obra →
              </button>
            </div>
          )}
        </div>
      );
    }

    // ── LISTA DE ORÇAMENTOS ──
    const filtros = ["Todos", "Rascunho", "Validado", "Enviado", "Aprovado", "Rejeitado"];
    const filtroStatus = orcFiltroStatus;
    const setFiltroStatus = setOrcFiltroStatus;
    const orcsFiltrados = filtroStatus === "Todos" ? historico : historico.filter(o => o.status === filtroStatus);

    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 3, height: 36, borderRadius: 2, background: `linear-gradient(180deg, ${T.blue}, ${T.blue}60)`, flexShrink: 0, marginTop: 2 }} />
            <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.txPri, letterSpacing: "-0.02em" }}>📁 Orçamentos Salvos</div>
            <div style={{ fontSize: 13, color: T.txMut, marginTop: 3 }}>
              {historico.length} orçamento(s) · Clique para abrir e editar
            </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {filtros.map(f => (
              <button key={f} onClick={() => setFiltroStatus(f)}
                style={{
                  background: filtroStatus === f ? T.blue : T.bg3,
                  color: filtroStatus === f ? "#fff" : T.txMut,
                  border: `1px solid ${filtroStatus === f ? T.blue : T.brBase}`,
                  borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: filtroStatus === f ? 700 : 400,
                }}>{f}</button>
            ))}
          </div>
        </div>

        {orcsFiltrados.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <div style={{ color: T.txMut, fontSize: 14, fontWeight: 600 }}>Nenhum orçamento encontrado</div>
            <div style={{ color: T.txDis, fontSize: 14, marginTop: 6 }}>
              {historico.length === 0
                ? <>Monte um orçamento na aba <strong>Orçamento</strong> e clique em <strong>💾 Salvar Orçamento</strong></>
                : "Tente outro filtro de status"}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {orcsFiltrados.map(orc => {
              const si = orc.siteInfo || {};
              const st = STATUS_ORC[orc.status || "Rascunho"] || STATUS_ORC["Rascunho"];
              const isV2 = !!(orc.blocos && orc.blocos.length >= 0);
              const legacyOrc = !isV2 && isLegacyBudget(orc) ? hydrateLegacyBudget(orc) : null;
              // Sempre recalcula ao vivo para V2 (evita usar cache desatualizado)
              const v2Totals = isV2 ? calcBudgetTotals(orc) : null;
              const totalOrc = isV2 ? (v2Totals?.totalGeral || 0) : (legacyOrc?.totalBruto || 0);
              const totalDisplay = isV2 ? (v2Totals?.totalGeral || 0) : (legacyOrc?.totalFinal || totalOrc);
              const totalItens = isV2
                ? (orc.blocos || []).reduce((s, bl) => s + (bl.itens || []).length, 0)
                : (orc.itens || []).length;
              const openBudget = () => {
                if (isV2) {
                  setActiveBudgetV2(orc);
                  setTab("orcv2");
                } else {
                  setOrcSel(orc.id);
                }
              };
              return (
                <div key={orc.id}
                  style={{
                    ...S.card, cursor: "pointer",
                    borderLeft: `4px solid ${st.color}`,
                    transition: "all 0.15s",
                    position: "relative",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.bg3; e.currentTarget.style.transform = "translateX(2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.bg2; e.currentTarget.style.transform = "none"; }}>

                  {/* Botão excluir */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (window.confirm(`Excluir o orçamento ${orc.id}?`)) {
                        setHistorico(prev => prev.filter(o => o.id !== orc.id));
                      }
                    }}
                    title="Excluir orçamento"
                    style={{
                      position: "absolute", top: 10, right: 10,
                      background: "transparent", border: `1px solid ${T.red}40`,
                      color: T.red, borderRadius: 6, padding: "3px 8px",
                      cursor: "pointer", fontSize: 13, fontWeight: 700,
                      opacity: 0.45, transition: "opacity 0.15s, background 0.15s",
                      zIndex: 2,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = T.red + "18"; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = "0.45"; e.currentTarget.style.background = "transparent"; }}>
                    🗑
                  </button>

                  <div onClick={openBudget}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingRight: 60 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Linha 1: ID + badges */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.blue }}>{orc.id}</span>
                        <span style={{ background: st.bg, color: st.color, padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: `1px solid ${st.color}30` }}>
                          {st.icon} {st.label}
                        </span>
                        {isV2 && <span style={{ background: T.purple + "18", color: T.purple, padding: "1px 6px", borderRadius: 4, fontSize: 8, fontWeight: 700 }}>V2 Multi-Sharing</span>}
                        {!isV2 && <span style={{ background: T.bg3, color: T.txMut, padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{orc.area}</span>}
                        <span style={{
                          background: orc.projetoId ? T.green + "18" : T.bg3,
                          color: orc.projetoId ? T.green : T.txMut,
                          border: `1px solid ${orc.projetoId ? T.green + "35" : T.brBase}`,
                          padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700
                        }}>
                          {getBudgetModeLabel(orc)}
                        </span>
                        <span style={{ fontSize: 11, color: T.txDis }}>{orc.data}</span>
                        {orc.projetoId && <span style={{ background: T.green + "18", color: T.green, padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>🏗️ Obra</span>}
                      </div>
                      {/* Linha 2: dados do site */}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        {[
                          { l: "Site", v: si.siteId, icon: "📍" },
                          { l: "Sharing", v: si.sharingNome, icon: "🏢" },
                          { l: "Operadora", v: si.operadora, icon: "📡" },
                          { l: "Município", v: si.municipio && (si.municipio + (si.uf ? ` / ${si.uf}` : "")) },
                        ].filter(x => x.v).map(({ l, v, icon }) => (
                          <div key={l} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12 }}>
                            <span>{icon}</span>
                            <span style={{ color: T.txMut }}>{l}: </span>
                            <span style={{ color: T.txSec, fontWeight: 600 }}>{v}</span>
                          </div>
                        ))}
                        {!si.siteId && <span style={{ fontSize: 12, color: T.txDis, fontStyle: "italic" }}>Site não preenchido</span>}
                      </div>
                      {/* Linha 3: sharings ou itens */}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {isV2 ? (
                          (orc.blocos || []).map(bl => (
                            <span key={bl.id} style={{ background: (bl.sharingCor || T.blue) + "18", color: bl.sharingCor || T.blue, border: `1px solid ${(bl.sharingCor || T.blue)}40`, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 600 }}>
                              {bl.sharingNome} · {bl.tipo === "implantacao" ? "Impl" : "Oper"} · {bl.itens.length} itens
                            </span>
                          ))
                        ) : (
                          <>
                            {(orc.itens || []).slice(0, 5).map(item => (
                              <span key={item.cod} style={{ background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 4, padding: "1px 6px", fontSize: 11, color: T.txMut }}>
                                {item.cod} ×{item.qtde}
                              </span>
                            ))}
                            {(orc.itens || []).length > 5 && <span style={{ fontSize: 11, color: T.txDis }}>+{(orc.itens || []).length - 5}</span>}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Totais */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: T.amber }}>{fmt(totalDisplay)}</div>
                      {isV2 ? (
                        <div style={{ fontSize: 11, color: T.txMut }}>
                          {(v2Totals?.totalCapex || 0) > 0 && <div>CAPEX: {fmt(v2Totals?.totalCapex || 0)}</div>}
                          {(v2Totals?.totalOpex || 0) > 0 && <div>OPEX: {fmt(v2Totals?.totalOpex || 0)}</div>}
                          <div>{totalItens} item(ns) · {(orc.blocos || []).length} bloco(s)</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: T.txMut }}>
                          {`Bruto ${fmt(legacyOrc?.totalBruto || 0)} · Desc ${fmt(legacyOrc?.discountValue || 0)}`}
                          <div>{totalItens} item(ns)</div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
                        <button
                          onClick={e => { e.stopPropagation(); openBudget(); }}
                          style={{
                            background: st.color + "18",
                            border: `1px solid ${st.color}40`,
                            color: st.color,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ✏️ Editar
                        </button>
                        {!orc.projetoId && orc.status !== "Validado" && (
                          <button
                            onClick={e => { e.stopPropagation(); updateHistoricBudgetStatus(orc.id, "Validado"); }}
                            style={{
                              background: T.green + "18",
                              border: `1px solid ${T.green}40`,
                              color: T.green,
                              borderRadius: 6,
                              padding: "3px 10px",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            🛡️ Validar
                          </button>
                        )}
                        {!orc.projetoId && orc.status === "Validado" && (
                          <span
                            style={{
                              background: T.green + "18",
                              border: `1px solid ${T.green}40`,
                              color: T.green,
                              borderRadius: 6,
                              padding: "3px 10px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            🛡️ Validado
                          </span>
                        )}
                        {/* Botão importar PO */}
                        <label
                          onClick={e => e.stopPropagation()}
                          title="Importar PO (PDF) e vincular ao orçamento"
                          style={{
                            background: orcPOLoading === orc.id ? T.bg3 : T.amber + "18",
                            border: `1px solid ${T.amber}40`,
                            color: orcPOLoading === orc.id ? T.txMut : T.amber,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: orcPOLoading === orc.id ? "wait" : "pointer",
                            display: "inline-flex", alignItems: "center", gap: 4,
                            userSelect: "none",
                          }}
                        >
                          {orcPOLoading === orc.id ? "⏳" : "📄"} PO
                          <input
                            type="file"
                            accept="application/pdf"
                            style={{ display: "none" }}
                            disabled={!!orcPOLoading}
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) importPOToOrc(orc.id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {/* Badge PO vinculada */}
                        {(orc as any).poVinculada && (
                          <span title={`PO ${(orc as any).poVinculada.nrPO} · ${(orc as any).poVinculada.importadoEm}`}
                            style={{ background: T.green + "18", color: T.green, border: `1px solid ${T.green}40`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            ✅ PO {(orc as any).poVinculada.nrPO || "vinculada"}
                          </span>
                        )}
                      </div>
                      {orc.projetoId ? (
                        <button
                          onClick={e => { e.stopPropagation(); openLinkedProject(orc.projetoId); }}
                          style={{
                            marginTop: 6,
                            marginLeft: 6,
                            background: T.green + "18",
                            border: `1px solid ${T.green}40`,
                            color: T.green,
                            borderRadius: 6,
                            padding: "3px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          🏗️ Atividade
                        </button>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          <button
                            onClick={e => { e.stopPropagation(); openBudgetLinkModal(orc); }}
                            style={{ ...S.ghost, padding: "3px 10px", fontSize: 11, color: T.blue, border: `1px solid ${T.blue}30` }}
                          >
                            🔗 Vincular
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); openCreateActivityFromBudget(orc); }}
                            style={{ ...S.ghost, padding: "3px 10px", fontSize: 11, color: T.green, border: `1px solid ${T.green}30` }}
                          >
                            ➕ Atividade
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // SITE INFO MODAL
  // ════════════════════════════════════════════════════════════════════
  const budgetLinkTarget = budgetLinkTargetId ? historico.find(o => o.id === budgetLinkTargetId) : null;
  const budgetLinkProjSel = budgetLinkProjectId ? projetos.find(p => p.id === budgetLinkProjectId) : null;

  // ── Fluxo A: vindo do orçamento → escolher atividade (budgetLinkTargetId preenchido)
  // ── Fluxo B: vindo da atividade → escolher orçamento (budgetLinkProjectId preenchido, targetId null)
  const budgetLinkModalJSX = showBudgetLinkModal ? (() => {
    const closeModal = () => { setShowBudgetLinkModal(false); setBudgetLinkTargetId(null); setBudgetLinkProjectId(""); };

    // Fluxo B — obra já conhecida, precisa escolher o orçamento
    if (!budgetLinkTargetId && budgetLinkProjectId) {
      const orcamentosDisponiveis = historico.filter(o =>
        o.status !== "Rascunho" || true // mostra todos, inclusive rascunhos
      ).sort((a, b) => (b.data || "").localeCompare(a.data || ""));

      return (
        <div style={{ position: "fixed", inset: 0, background: "#000000b0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 520, padding: 16 }}>
          <div style={{ background: T.bg2, borderRadius: 16, border: `1px solid ${T.blue}40`, padding: 24, width: 600, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.blue, marginBottom: 4 }}>🔗 Vincular Orçamento à Atividade</div>
            <div style={{ fontSize: 13, color: T.txMut, marginBottom: 16 }}>
              Atividade: <strong style={{ color: T.purple }}>{budgetLinkProjSel?.siteIdSharing || budgetLinkProjectId}</strong>
              {budgetLinkProjSel?.sharing && <span style={{ color: T.txSec }}> · {budgetLinkProjSel.sharing}</span>}
            </div>

            {orcamentosDisponiveis.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: T.txMut }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                <div>Nenhum orçamento salvo encontrado. Crie um orçamento primeiro.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto", marginBottom: 16 }}>
                {orcamentosDisponiveis.map(orc => {
                  const total = getSavedBudgetTotal(orc);
                  const jaVinculado = orc.projetoId && orc.projetoId !== budgetLinkProjectId;
                  const selecionado = budgetLinkTargetId === orc.id;
                  const ST_C = { "Aprovado": T.green, "Validado": T.green, "Enviado": T.blue, "Rascunho": T.txMut, "Rejeitado": T.red };
                  const stC = ST_C[orc.status] || T.txMut;
                  return (
                    <div key={orc.id}
                      onClick={() => !jaVinculado && setBudgetLinkTargetId(orc.id)}
                      style={{
                        background: selecionado ? T.blue + "18" : T.bg3,
                        border: `1px solid ${selecionado ? T.blue : jaVinculado ? T.brSub : T.brBase}`,
                        borderRadius: 10, padding: "12px 16px", cursor: jaVinculado ? "not-allowed" : "pointer",
                        opacity: jaVinculado ? 0.5 : 1, transition: "all 0.15s",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: selecionado ? T.blue : T.txPri }}>{orc.id}</span>
                            <span style={{ background: stC + "18", color: stC, border: `1px solid ${stC}40`, padding: "1px 7px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{orc.status}</span>
                            {jaVinculado && <span style={{ fontSize: 11, color: T.amber }}>⚠️ Vinculado a outra atividade</span>}
                            {selecionado && <span style={{ fontSize: 12, color: T.blue, fontWeight: 700 }}>✓ Selecionado</span>}
                          </div>
                          <div style={{ fontSize: 12, color: T.txMut, display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {orc.siteInfo?.siteIdSharing && <span>📍 {orc.siteInfo.siteIdSharing}</span>}
                            {orc.siteInfo?.sharingNome && <span>🏢 {orc.siteInfo.sharingNome}</span>}
                            {orc.data && <span>📅 {orc.data}</span>}
                            <span>{getBudgetModeLabel(orc)}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: selecionado ? T.blue : T.txPri }}>{fmt(total)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={closeModal} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
              <button onClick={confirmBudgetLink}
                disabled={!budgetLinkTargetId}
                style={{ ...S.btn, flex: 2, padding: 10, opacity: budgetLinkTargetId ? 1 : 0.45 }}>
                {budgetLinkTargetId ? `🔗 Vincular ${budgetLinkTargetId}` : "Selecione um orçamento acima"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Fluxo A — orçamento já conhecido, escolher atividade
    if (!budgetLinkTarget) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000000b0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 520, padding: 16 }}>
        <div style={{ background: T.bg2, borderRadius: 16, border: `1px solid ${T.brBase}`, padding: 24, width: 560, maxWidth: "100%" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.blue, marginBottom: 8 }}>🔗 Vincular orçamento à atividade</div>
          <div style={{ fontSize: 13, color: T.txSec, marginBottom: 16 }}>
            {budgetLinkTarget.id} · {getBudgetModeLabel(budgetLinkTarget)} · {fmt(getSavedBudgetTotal(budgetLinkTarget))}
          </div>
          <div style={{ background: T.bg3, borderRadius: 10, border: `1px solid ${T.brBase}`, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>ATIVIDADE EXISTENTE</div>
            <select value={budgetLinkProjectId} onChange={e => setBudgetLinkProjectId(e.target.value)} style={S.input}>
              <option value="">Selecione a atividade no Controle de Obras</option>
              {projetos.map(p => (
                <option key={p.id} value={p.id}>
                  {(p.siteIdSharing || p.siteId || p.id)} · {(p.sharing || p.Sharing || "—")} · {p.status}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: T.txMut, marginTop: 8 }}>
              O budget da atividade será atualizado com o valor do orçamento selecionado.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={closeModal} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
            <button onClick={() => openCreateActivityFromBudget(budgetLinkTarget)} style={{ ...S.ghost, flex: 1, padding: 10, color: T.green, border: `1px solid ${T.green}30` }}>
              ➕ Nova atividade
            </button>
            <button onClick={confirmBudgetLink} disabled={!budgetLinkProjectId} style={{ ...S.btn, flex: 1.3, padding: 10, opacity: budgetLinkProjectId ? 1 : 0.5 }}>
              Vincular orçamento
            </button>
          </div>
        </div>
      </div>
    );
  })() : null;

  const projectModalJSX = showProjModal ? (
    <div style={{ position: "fixed", inset: 0, background: "#000000b0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16, overflowY: "auto" }}>
      <div style={{ background: T.bg2, borderRadius: 16, border: `1px solid ${T.brBase}`, padding: 26, width: 580, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.blue, marginBottom: 16 }}>{editProj ? "✏️ Editar Projeto" : "➕ Novo Projeto de Obra"}</div>

        {/* ── TIPO DE ATIVIDADE ── campo destacado no topo */}
        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>Tipo de Atividade</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
            {[
              { id: "Implantação", icon: "🔧", desc: "Obras, instalação, estrutura metálica, civil" },
              { id: "Operação", icon: "⚙️", desc: "Manutenção, O&M, contrato de operação" },
            ].map(({ id, icon, desc }) => (
              <button key={id} onClick={() => setProjForm(p => ({ ...p, segmento: id }))}
                style={{
                  padding: "14px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  border: `2px solid ${projForm.segmento === id ? (id === "Implantação" ? T.blue : T.green) : T.brBase}`,
                  background: projForm.segmento === id ? (id === "Implantação" ? T.blue + "18" : T.green + "18") : T.bg3,
                  transition: "all 0.15s",
                }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: projForm.segmento === id ? (id === "Implantação" ? T.blue : T.green) : T.txSec }}>{id}</div>
                <div style={{ fontSize: 10, color: T.txMut, marginTop: 2 }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── TIPO DE PROJETO ── define o cronograma padrão */}
        <div style={{ marginBottom: 20, background: T.bg3, borderRadius: 10, padding: "14px", border: `1px solid ${T.brBase}` }}>
          <label style={S.label}>Tipo de Projeto <span style={{ color: T.txMut, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(define o cronograma padrão)</span></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginTop: 8 }}>
            {TIPOS_PROJETO.map(tp => {
              const sel = (projForm.tipoProjeto || "adequacao_infra") === tp.id;
              return (
                <button key={tp.id} onClick={() => setProjForm(p => ({ ...p, tipoProjeto: tp.id }))}
                  style={{
                    padding: "10px 8px", borderRadius: 9, cursor: "pointer", textAlign: "center",
                    border: `2px solid ${sel ? T.blue : T.brBase}`,
                    background: sel ? T.blue + "18" : T.bg2,
                    transition: "all 0.15s"
                  }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{tp.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: sel ? 800 : 500, color: sel ? T.blue : T.txSec, lineHeight: 1.3 }}>{tp.label}</div>
                </button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>Categoria de Projeto</label>
              <select 
                value={projForm.categoriaProjeto || "implantacao"} 
                onChange={e => {
                  setProjField("categoriaProjeto", e.target.value);
                  if (e.target.value === "manutencao") {
                    setProjField("tipoProjeto", "manutencao_geral");
                  } else {
                    setProjField("tipoProjeto", "bts");
                  }
                }} 
                style={S.input}
              >
                <option value="manutencao">Manutenção O&M</option>
                <option value="implantacao">Implantação</option>
              </select>
            </div>
            
            {projForm.categoriaProjeto !== "manutencao" && (
              <div>
                <label style={S.label}>Tipo de Projeto</label>
                <select 
                  value={projForm.tipoProjeto || "bts"} 
                  onChange={e => setProjField("tipoProjeto", e.target.value)} 
                  style={S.input}
                >
                  <option value="bts">BTS</option>
                  <option value="obra_bts">Obra BTS</option>
                  <option value="obra_couro">Obra Couro</option>
                  <option value="adequacao_infra">Adequação de Infra</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, color: T.txMut, marginTop: 8 }}>
            📅 {(ETAPAS_POR_TIPO[projForm.tipoProjeto] || []).length} etapas serão criadas automaticamente no cronograma
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          {/* Site IDs — campo em destaque no topo */}
          <div style={{
            gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
            background: T.bg3, borderRadius: 10, padding: "14px", border: `1px solid ${T.brBase}`, marginBottom: 4
          }}>
            <div>
              <label style={{ ...S.label, color: T.purple }}>SITE ID SHARING / CLIENTE</label>
              <input value={projForm.siteIdSharing || ""} onChange={e => { setProjField("siteIdSharing", e.target.value); setProjField("siteId", e.target.value); }}
                style={{ ...S.input, fontWeight: 800, fontSize: 14, color: T.purple }} placeholder="Ex: PAPCJ001" />
              <div style={{ fontSize: 11, color: T.txMut, marginTop: 4 }}>ID usado pelo cliente/sharing</div>
            </div>
            <div>
              <label style={{ ...S.label, color: T.blue }}>SITE ID OPERADORA</label>
              <input value={projForm.siteIdOperadora || ""} onChange={e => setProjField("siteIdOperadora", e.target.value)}
                style={{ ...S.input, fontWeight: 800, fontSize: 14, color: T.blue }} placeholder="Ex: VIV-SP-0042" />
              <div style={{ fontSize: 11, color: T.txMut, marginTop: 4 }}>ID usado pela operadora (opcional)</div>
            </div>
          </div>
          <div>
            <label style={S.label}>Número da Proposta</label>
            <input value={projForm.proposta || ""} readOnly style={{ ...S.input, background: T.bg4, color: T.txSec, fontWeight: 700 }} />
            <div style={{ fontSize: 11, color: T.txMut, marginTop: 4 }}>Gerado automaticamente</div>
          </div>
          <div>
            <label style={S.label}>Sharing (Cliente)</label>
            <input
              list="clientes-list"
              value={projForm.sharing || ""}
              onChange={e => setProjField("sharing", e.target.value)}
              style={S.input}
              placeholder="Selecione o cliente"
            />
            <datalist id="clientes-list">
              {clientes.map(c => <option key={c.id} value={c.nome} />)}
            </datalist>
          </div>
          <div>
            <label style={S.label}>Fornecedor</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                list="fornecedores-list"
                value={projForm.fornecedor || ""}
                onChange={e => setProjField("fornecedor", e.target.value)}
                style={{ ...S.input, flex: 1 }}
                placeholder="Selecione o fornecedor"
              />
              <button
                onClick={() => { setEditForn(null); setFornForm(fornFormInit); setShowFornModal(true); setFornSelectOnSave(true); }}
                style={{ ...S.ghost, padding: "8px 10px", fontSize: 12, whiteSpace: "nowrap" }}
                type="button"
              >
                + Cadastrar
              </button>
            </div>
            <datalist id="fornecedores-list">
              {fornecedores.map(f => <option key={f.id} value={f.nome} />)}
            </datalist>
          </div>
          <div>
            <label style={S.label}>Contato (Solicitante)</label>
            <input value={projForm.contato || ""} onChange={e => setProjField("contato", e.target.value)} style={S.input} placeholder="Quem acionou a demanda" />
          </div>
          <div><label style={S.label}>Gestor</label>
            <input value={projForm.gestor || ""} onChange={e => setProjField("gestor", e.target.value)} style={S.input} placeholder="Ex: Diego Melo" /></div>
          <div><label style={S.label}>Data de Acionamento</label>
            <input value={projForm.dataOrcamento || ""} onChange={e => setProjField("dataOrcamento", e.target.value)} style={S.input} placeholder="DD/MM/AAAA" /></div>
          <div><label style={S.label}>Início da Atividade</label>
            <input type="date" value={brDateToIso(projForm.dataInicioAtividade || "")} onChange={e => setProjField("dataInicioAtividade", isoDateToBr(e.target.value))} style={S.input} /></div>
          <div><label style={S.label}>Data Final</label>
            <input type="date" value={brDateToIso(projForm.dataFimAtividade || "")} onChange={e => setProjField("dataFimAtividade", isoDateToBr(e.target.value))} style={S.input} /></div>
          <div><label style={S.label}>Município</label>
            <input value={projForm.municipio || ""} onChange={e => setProjField("municipio", e.target.value)} style={S.input} placeholder="Ex: Campinas" /></div>
          <div><label style={S.label}>UF</label>
            <input value={projForm.uf || ""} onChange={e => setProjField("uf", e.target.value)} style={S.input} placeholder="SP" /></div>
          <div><label style={S.label}>Budget Aprovado (R$)</label>
            <input
              type="number"
              value={projForm.budgetAprovado || 0}
              onChange={e => setProjField("budgetAprovado", Number(e.target.value))}
              style={{ ...S.input, opacity: projForm.orcamentoVinculadoId ? 0.65 : 1 }}
              placeholder="0"
              disabled={!!projForm.orcamentoVinculadoId}
              title={projForm.orcamentoVinculadoId ? "Budget sincronizado automaticamente com o orçamento vinculado" : ""}
            /></div>
          <div><label style={S.label}>Notas</label>
            <input value={projForm.notas || ""} onChange={e => setProjField("notas", e.target.value)} style={S.input} placeholder="Observações" /></div>
          <div style={{ gridColumn: "span 2" }}><label style={S.label}>Endereço</label>
            <input value={projForm.endereco || ""} onChange={e => setProjField("endereco", e.target.value)} style={S.input} placeholder="Rua, número, bairro..." /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {[{ l: "Operadora", k: "operadora", opts: OPERADORAS }, { l: "Status", k: "status", opts: STATUS_OPTS }].map(({ l, k, opts }) => (
            <div key={k}><label style={S.label}>{l}</label>
              <select value={projForm[k] || ""} onChange={e => setProjField(k, e.target.value)} style={S.input}>
                {opts.map(o => <option key={o}>{o}</option>)}</select></div>
          ))}
        </div>
        {/* ── VÍNCULO COM ORÇAMENTO ── */}
        <div style={{ marginBottom: 16, background: T.bg3, borderRadius: 10, padding: 14, border: `1px solid ${T.brBase}` }}>
          <label style={{ ...S.label, color: T.green }}>🔗 Orçamento Vinculado (Budget automático)</label>
          <select value={projForm.orcamentoVinculadoId || ""} onChange={e => {
            const orc = historico.find(o => o.id === e.target.value);
            setProjField("orcamentoVinculadoId", e.target.value);
            if (orc) {
              const total = getSavedBudgetTotal(orc);
              if (total > 0) setProjField("budgetAprovado", total);
            }
          }} style={S.input}>
            <option value="">— Nenhum (informar manualmente) —</option>
            {historico.map(o => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.contratante || o.siteInfo?.sharingNome || "—"} · {o.data || ""} · {o.status || "Rascunho"}
              </option>
            ))}
          </select>
          {projForm.orcamentoVinculadoId && (() => {
            const orc = historico.find(o => o.id === projForm.orcamentoVinculadoId);
            if (!orc) return null;
            return <div style={{ fontSize: 12, color: T.green, marginTop: 6 }}>✅ Budget puxado automaticamente do orçamento vinculado</div>;
          })()}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowProjModal(false)} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
          <button onClick={saveProj} style={{ ...S.btn, flex: 2, padding: 10, fontSize: 14 }}>{editProj ? "Salvar Alterações" : "Criar Projeto"}</button>
        </div>
      </div>
    </div>
  ) : null;

  // SiteModal — renderizado inline no JSX final (não como componente filho)
  // para evitar re-mount a cada render do App que trava os inputs
  const siteModalJSX = showSiteModal ? (
    <div style={{ position: "fixed", inset: 0, background: "#000000b0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 16 }}>
      <div style={{ background: T.bg2, borderRadius: 14, border: `1px solid ${T.brBase}`, padding: 26, width: 500, maxWidth: "100%" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.blue, marginBottom: 20 }}>📍 Informações do Site</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          {[{ l: "ID do Site", k: "siteId", ph: "Ex: PAPCJ001" }, { l: "Operadora", k: "operadora", ph: "Ex: Vivo" }, { l: "Nome do Sharing", k: "sharingNome", ph: "Ex: Highline" }, { l: "Site Sharing (ID)", k: "siteIdSharing", ph: "Ex: HIG-001" }, { l: "UF", k: "uf", ph: "SP" }, { l: "Município", k: "municipio", ph: "Ex: Campinas" }].map(({ l, k, ph }) => (
            <div key={k}><label style={S.label}>{l}</label>
              <input value={siteInfo[k]} onChange={e => setSiteField(k, e.target.value)} style={S.input} placeholder={ph} /></div>
          ))}
          <div style={{ gridColumn: "span 2" }}><label style={S.label}>Endereço Completo</label>
            <input value={siteInfo.endereco} onChange={e => setSiteField("endereco", e.target.value)} style={S.input} placeholder="Rua, número, bairro..." /></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowSiteModal(false)} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
          <button onClick={() => setShowSiteModal(false)} style={{ ...S.btn, flex: 1, padding: 10 }}>Confirmar</button>
        </div>
      </div>
    </div>
  ) : null;

  // ════════════════════════════════════════════════════════════════════
  // TAB: FATURAMENTO
  // ════════════════════════════════════════════════════════════════════
  const TabFaturamento = () => {
    const pctEdit = fatPctEdit; const setPctEdit = setFatPctEdit;
    const selected = fatSelected; const setSelected = setFatSelected;
    const expandido = fatExpandido; const setExpandido = setFatExpandido;
    const filtroStatus = fatFiltroStatus; const setFiltroStatus = setFatFiltroStatus;
    const faturamentoEditId = fatEditProjetoId;
    const setFaturamentoEditId = setFatEditProjetoId;
    const faturamentoForm = fatForm;
    const setFaturamentoForm = setFatForm;
    const isProjetoFaturado = (project) => String(project?.faturamentoStatus || "").trim().toLowerCase() === "sim";
    const getProjetoFaturamentoResumo = (project) => {
      if (!isProjetoFaturado(project)) return "Não faturado";
      const partes = ["Faturado"];
      if (project?.faturamentoData) partes.push(project.faturamentoData);
      if (project?.faturamentoNF) partes.push(`NF ${project.faturamentoNF}`);
      return partes.join(" · ");
    };
    const openFaturamentoEditor = (project) => {
      if (faturamentoEditId === project.id) {
        setFaturamentoEditId(null);
        return;
      }
      setFaturamentoEditId(project.id);
      setFaturamentoForm({
        status: isProjetoFaturado(project) ? "sim" : "nao",
        data: project?.faturamentoData || "",
        numeroNF: project?.faturamentoNF || "",
      });
    };
    const saveFaturamentoProjeto = (projectId) => {
      const faturado = faturamentoForm.status === "sim";
      if (faturado && (!faturamentoForm.data || !String(faturamentoForm.numeroNF || "").trim())) {
        window.alert("Para marcar a PO como faturada, informe a data e o número da NF.");
        return;
      }
      updateProjectRecord(projectId, project => ({
        ...project,
        faturamentoStatus: faturado ? "sim" : "nao",
        faturamentoData: faturado ? faturamentoForm.data : "",
        faturamentoNF: faturado ? String(faturamentoForm.numeroNF || "").trim() : "",
      }));
      setFaturamentoEditId(null);
    };

    // Montar lista de linhas faturáveis (1 linha por item da PO ou 1 linha por projeto sem PO)
    const linhas = [];
    projetos.forEach(p => {
      const budget = calcBudgetEfetivo(p);
      const apto = p.status === "Em Andamento" || p.status === "Concluído";
      const temPO = !!p.po;
      const faturado = isProjetoFaturado(p);
      const faturamentoData = p.faturamentoData || "";
      const faturamentoNF = p.faturamentoNF || "";
      if (p.po?.itens?.length > 0) {
        // Soma dos valorTotal dos itens para cross-check com po.valorTotal
        const somaItens = p.po.itens.reduce((s, it) => s + (it.valorTotal || 0), 0);
        const poTotal = p.po.valorTotal || 0;
        // Se a soma dos itens está muito abaixo do total da PO (dado cacheado com bug de regex antigo),
        // distribui o total da PO proporcionalmente pelo valorUnit (ou igualmente se tudo zero)
        const scaleFactor = (poTotal > 0 && somaItens > 0 && somaItens < poTotal * 0.5) ? poTotal / somaItens : 1;
        p.po.itens.forEach((it, idx) => {
          const key = `${p.id}__${idx}`;
          let itemVal = (it.valorTotal || it.valorUnit * it.qtde || 0) * scaleFactor;
          // Fallback extra: PO com 1 item → usar total da PO direto
          if (p.po.itens.length === 1 && poTotal > 0) itemVal = poTotal;
          linhas.push({
            key, projId: p.id, siteId: p.siteIdSharing || "",
            po: (p.po.nrPO || "").replace(/\s*[\/\-]\s*\d{4}\s*$/, "").trim(),
            linha: it.num || String(idx + 1).padStart(3, "0"),
            servico: it.descricao || "",
            valor: itemVal,
            empresa: p.sharing || p.Sharing || p.operadora || "",
            uf: p.uf || "", cidade: p.municipio || "",
            gestor: p.gestor || "",
            status: p.status, apto, temPO,
            faturado, faturamentoData, faturamentoNF,
            pctKey: key,
          });
        });
      } else {
        const key = `${p.id}__0`;
        linhas.push({
          key, projId: p.id, siteId: p.siteId,
          po: p.po?.nrPO || "", linha: "001",
          servico: p.descricao || "",
          valor: budget,
          empresa: p.sharing || p.Sharing || p.operadora || "",
          uf: p.uf || "", cidade: p.municipio || "",
          gestor: p.gestor || "",
          status: p.status, apto, temPO,
          faturado, faturamentoData, faturamentoNF,
          pctKey: key,
        });
      }
    });

    // projetos filtrados pelo filtroStatus (agrupado por projeto)
    const projFiltrados = projetos.filter(p => {
      const temPO = !!p.po;
      const apto = p.status === "Em Andamento" || p.status === "Concluído";
      const faturado = isProjetoFaturado(p);
      if (filtroStatus === "Aptos") return apto && temPO;
      if (filtroStatus === "Pendentes") return !apto || !temPO;
      if (filtroStatus === "Sem PO") return !temPO;
      if (filtroStatus === "Faturados") return faturado;
      if (filtroStatus === "Não Faturados") return !faturado;
      return true;
    });

    const selList = linhas.filter(l => selected[l.key]);
    const totalSel = selList.reduce((s, l) => {
      const pct = pctEdit[l.pctKey] !== undefined ? pctEdit[l.pctKey] : 100;
      return s + l.valor * pct / 100;
    }, 0);

    // ── Exportar Excel via SheetJS (bundled)
    const exportExcel = () => {
      if (selList.length === 0) return;
      const ALIQ = 0.2204;
      const rows = selList.map((l, idx) => {
        const pct = pctEdit[l.pctKey] !== undefined ? pctEdit[l.pctKey] : 100;
        const valor = roundCurrency(l.valor * pct / 100);
        const desconto = roundCurrency(valor * ALIQ);
        // PO number: only the numeric part before " / YEAR"
        const poNum = l.po.replace(/\s*[\/\-]\s*\d{4}\s*$/, "").trim();
        const excelRow = idx + 4;
        return [
          l.siteId,
          poNum,
          l.linha,
          l.servico,
          valor,
          l.gestor || "",
          "",
          l.uf,
          l.cidade,
          l.faturado ? (l.faturamentoData || "") : "",
          l.faturado ? (l.faturamentoNF || "") : "",
          "",
          { t: "n", f: `E${excelRow}*22.04%`, z: '"R$" #,##0.00', v: desconto },
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([
        Array(13).fill(""),
        ["NF", "NF", "NF", "NF", "NF", "", "", "", "", "", "", "", ""],
        [
          "SITE ID WINITY |",
          "Nº P.O |",
          "LINHA |",
          "SERVIÇO |",
          "VALOR ",
          "RESPONSÁVEL\n(Quem Acionou o Serviço)",
          "LIBERAÇÃO ESPECIALISTA",
          "UF",
          "CIDADE",
          "DATA FATURAMENTO",
          "NF",
          "DATA \nRECEBIMENTO",
          "Desconto - Aliquota Imposto Mês 22,04% (-)"
        ],
        ...rows,
      ]);

      ws["!cols"] = [
        { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 52 }, { wch: 14 },
        { wch: 28 }, { wch: 22 }, { wch: 5 }, { wch: 16 }, { wch: 18 },
        { wch: 12 }, { wch: 18 }, { wch: 30 },
      ];

      // Formatar colunas numéricas como moeda BRL
      const currencyCols = [4, 12]; // VALOR, Desconto (0-indexed)
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = 3; R <= range.e.r; R++) {
        currencyCols.forEach(c => {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c })];
          if (cell) cell.z = '"R$" #,##0.00';
        });
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "MED ENG LS OFFICE");
      const today = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
      XLSX.writeFile(wb, `Faturamento_Winity_${today}.xlsx`);
    };

    const aptoCor = (l) => l.apto && l.temPO ? T.green : !l.temPO ? T.amber : T.red;
    const aptoLabel = (l) => !l.temPO ? "⚠️ Sem PO" : !l.apto ? "🔒 Bloqueado" : "✅ Apto";

    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 3, height: 36, borderRadius: 2, background: `linear-gradient(180deg, ${T.green}, ${T.green}60)`, flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: T.txPri, letterSpacing: "-0.02em" }}>🧾 Faturamento</div>
              <div style={{ fontSize: 13, color: T.txMut, marginTop: 3 }}>Selecione os itens e exporte a planilha Winity com o status real de faturamento da PO</div>
            </div>
          </div>
          {selList.length > 0 && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: T.txMut }}>{selList.length} item(ns) selecionado(s)</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: T.green }}>{fmt(totalSel)}</div>
              </div>
              <button onClick={exportExcel}
                style={{ ...S.btn, padding: "10px 20px", fontSize: 13, background: "linear-gradient(135deg,#065f46,#34d399)", display: "flex", alignItems: "center", gap: 8 }}>
                📊 Exportar Excel
              </button>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
          {[
            { l: "Total de Linhas", v: linhas.length, c: T.blue, icon: "▦" },
            { l: "Aptas p/ Faturar", v: linhas.filter(l => l.apto && l.temPO).length, c: T.green, icon: "✅" },
            { l: "Selecionadas", v: selList.length, c: T.amber, icon: "✔" },
            { l: "Valor Selecionado", v: fmt(totalSel), c: T.green, icon: "💰" },
          ].map(({ l, v, c, icon }) => (
            <div key={l} style={{ ...S.card, ...cardTint(c), borderLeft: `3px solid ${c}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em" }}>{l.toUpperCase()}</div>
                <span style={{ ...iconBox(c, true), width: 26, height: 26, borderRadius: 8 }}>
                  <span style={{ fontSize: 12, filter: "grayscale(1)" }}>{icon}</span>
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Controles */}
        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {["TODOS", "Aptos", "Pendentes", "Sem PO", "Faturados", "Não Faturados"].map(f => (
              <button key={f} onClick={() => setFiltroStatus(f)}
                style={{
                  padding: "6px 12px", borderRadius: 7, border: `1px solid ${filtroStatus === f ? T.green : T.brBase}`,
                  background: filtroStatus === f ? T.green + "18" : "transparent",
                  color: filtroStatus === f ? T.green : T.txMut, cursor: "pointer", fontSize: 13, fontWeight: filtroStatus === f ? 700 : 400
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Lista agrupada por obra — 1 linha por projeto, expansível */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projFiltrados.length === 0 ? (
            <div style={{ ...S.card, textAlign: "center", padding: 40, color: T.txMut }}>Nenhuma obra encontrada para este filtro</div>
          ) : projFiltrados.map(p => {
            const linhasDaObra = linhas.filter(l => l.projId === p.id);
            const expanded = !!expandido[p.id];
            const budget = calcBudgetEfetivo(p);
            const apto = p.status === "Em Andamento" || p.status === "Concluído";
            const temPO = !!p.po;
            const faturado = isProjetoFaturado(p);
            const faturamentoResumo = getProjetoFaturamentoResumo(p);
            const faturamentoCor = faturado ? T.green : T.txMut;
            const ac = apto && temPO ? T.green : !temPO ? T.amber : T.red;
            const sc = ST_COLOR[p.status] || T.txMut;
            const clienteNome = p.sharing || p.Sharing || "—";

            // Total selecionado desta obra
            const totalSelObra = linhasDaObra.filter(l => selected[l.key]).reduce((s, l) => {
              const pct = pctEdit[l.pctKey] !== undefined ? pctEdit[l.pctKey] : 100;
              return s + l.valor * pct / 100;
            }, 0);
            const nSelObra = linhasDaObra.filter(l => selected[l.key]).length;
            const allSelObra = linhasDaObra.length > 0 && linhasDaObra.every(l => selected[l.key]);

            return (
              <div key={p.id} style={{
                ...S.card, padding: 0, overflow: "hidden",
                borderLeft: `3px solid ${expanded ? T.green : ac}`,
                transition: "border-color 0.15s"
              }}>

                {/* ── Linha principal (sempre visível) ── */}
                <div style={{
                  display: "grid", gridTemplateColumns: "36px 1fr auto", alignItems: "center",
                  padding: "12px 16px", cursor: "pointer", gap: 12,
                  background: expanded ? T.bg3 : "transparent"
                }}
                  onClick={() => setExpandido(prev => ({ ...prev, [p.id]: !prev[p.id] }))}>

                  {/* Checkbox obra inteira */}
                  <div onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={allSelObra}
                      onChange={() => {
                        const next = { ...selected };
                        linhasDaObra.forEach(l => { next[l.key] = !allSelObra; });
                        setSelected(next);
                      }}
                      style={{ width: 15, height: 15, cursor: "pointer", accentColor: T.green }} />
                  </div>

                  {/* Info da obra */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div><div style={{ fontWeight: 900, color: T.purple, fontSize: 13 }}>{p.siteIdSharing || ""}</div>{p.siteIdOperadora && <div style={{ fontSize: 12, color: T.blue, marginTop: 1 }}>Op: {p.siteIdOperadora}</div>}</div>
                        <span style={{ background: sc + "18", color: sc, border: `1px solid ${sc}40`, padding: "1px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{p.status}</span>
                        <span style={{ background: ac + "18", color: ac, border: `1px solid ${ac}40`, padding: "1px 8px", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                          {!temPO ? "⚠️ Sem PO" : !apto ? "🔒 Bloqueado" : "✅ Apto"}
                        </span>
                        {p.segmento && <span style={{ background: p.segmento === "Implantação" ? T.blue + "20" : T.green + "20", color: p.segmento === "Implantação" ? T.blue : T.green, borderRadius: 3, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>{p.segmento === "Implantação" ? "🔧" : "⚙️"} {p.segmento}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: T.txMut, marginTop: 3, display: "flex", gap: 12 }}>
                        <span><span style={{ color: T.purple, fontWeight: 600 }}>{clienteNome}</span></span>
                        <span>{p.operadora}</span>
                        {p.municipio && <span>📍 {p.municipio}/{p.uf}</span>}
                        {p.gestor && <span style={{ color: T.cyan }}>👤 {p.gestor}</span>}
                      </div>
                    </div>
                    {/* PO */}
                    <div onClick={e => e.stopPropagation()}>
                      {temPO ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ background: T.green + "18", color: T.green, border: `1px solid ${T.green}40`, padding: "2px 10px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>
                            📄 PO {p.po.nrPO}
                          </span>
                          <label style={{ cursor: "pointer", fontSize: 11, color: T.txMut, textDecoration: "underline" }}>
                            trocar
                            <input type="file" accept=".pdf" style={{ display: "none" }} onChange={e => e.target.files[0] && parsePO(p.id, e.target.files[0])} />
                          </label>
                        </div>
                      ) : (
                        <label style={{
                          display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                          background: T.amber + "15", border: `1px dashed ${T.amber}60`,
                          borderRadius: 7, padding: "5px 12px"
                        }}>
                          <span style={{ fontSize: 13 }}>📎</span>
                          <span style={{ fontSize: 12, color: T.amber, fontWeight: 700 }}>
                            {poLoading === p.id ? "⏳ Lendo PO..." : "Anexar PO"}
                          </span>
                          <input type="file" accept=".pdf" style={{ display: "none" }} onChange={e => e.target.files[0] && parsePO(p.id, e.target.files[0])} />
                        </label>
                      )}
                    </div>
                    {/* Financeiro resumido */}
                    <div style={{ display: "flex", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.05em" }}>BUDGET</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.txPri }}>{fmt(budget)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: T.txMut, fontWeight: 700, letterSpacing: "0.05em" }}>FATURAMENTO</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: faturamentoCor }}>{faturamentoResumo}</div>
                      </div>
                      {nSelObra > 0 && <div>
                        <div style={{ fontSize: 11, color: T.green, fontWeight: 700, letterSpacing: "0.05em" }}>SELECIONADO</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.green }}>{fmt(totalSelObra)}</div>
                      </div>}
                      {temPO && p.po.valorTotal > 0 && Math.abs(p.po.valorTotal - budget) > 0.5 && (
                        <div style={{ background: T.red + "15", border: `1px solid ${T.red}50`, borderRadius: 6, padding: "4px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
                          <div style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: "0.05em" }}>⚠️ DIVERGÊNCIA PO/ORC</div>
                          <div style={{ fontSize: 12, color: T.red, fontWeight: 800 }}>PO: {fmt(p.po.valorTotal)}</div>
                        </div>
                      )}
                      <div onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => temPO && openFaturamentoEditor(p)}
                          style={{
                            ...S.btn,
                            padding: "7px 12px",
                            fontSize: 12,
                            background: !temPO
                              ? T.bg3
                              : faturado
                                ? "linear-gradient(135deg,#065f46,#10b981)"
                                : "linear-gradient(135deg,#1f2937,#334155)",
                            whiteSpace: "nowrap",
                            opacity: temPO ? 1 : 0.6,
                            cursor: temPO ? "pointer" : "not-allowed"
                          }}
                          disabled={!temPO}
                        >
                          {!temPO ? "Aguardar PO" : faturado ? "Editar Faturamento" : "Validar Faturamento"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expandir chevron */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {linhasDaObra.length > 0 && (
                      <span style={{ fontSize: 12, color: T.txMut }}>{linhasDaObra.length} item(s)</span>
                    )}
                    <span style={{
                      color: T.txMut, fontSize: 18, transition: "transform 0.2s",
                      transform: expanded ? "rotate(90deg)" : "rotate(0deg)"
                    }}>›</span>
                  </div>
                </div>

                {faturamentoEditId === p.id && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      borderTop: `1px solid ${T.brBase}`,
                      borderBottom: `1px solid ${T.brBase}`,
                      background: T.bg3,
                      padding: "14px 16px",
                      display: "grid",
                      gridTemplateColumns: "1.1fr 1fr 1fr auto",
                      gap: 10,
                      alignItems: "end"
                    }}
                  >
                    <div>
                      <label style={{ ...S.label, marginBottom: 6 }}>PO Faturada?</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[
                          { id: "nao", label: "Não", color: T.txMut },
                          { id: "sim", label: "Sim", color: T.green }
                        ].map(opcao => {
                          const ativo = faturamentoForm.status === opcao.id;
                          return (
                            <button
                              key={opcao.id}
                              onClick={() => setFaturamentoForm(prev => ({
                                ...prev,
                                status: opcao.id,
                                data: opcao.id === "sim" ? prev.data : "",
                                numeroNF: opcao.id === "sim" ? prev.numeroNF : "",
                              }))}
                              style={{
                                flex: 1,
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: `1px solid ${ativo ? opcao.color : T.brBase}`,
                                background: ativo ? opcao.color + "18" : T.bg2,
                                color: ativo ? opcao.color : T.txMut,
                                cursor: "pointer",
                                fontWeight: ativo ? 800 : 600,
                                fontSize: 13
                              }}
                            >
                              {opcao.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ ...S.label, marginBottom: 6 }}>Data do Faturamento</label>
                      <input
                        type="date"
                        value={faturamentoForm.data}
                        disabled={faturamentoForm.status !== "sim"}
                        onChange={e => setFaturamentoForm(prev => ({ ...prev, data: e.target.value }))}
                        style={{ ...S.input, opacity: faturamentoForm.status === "sim" ? 1 : 0.6 }}
                      />
                    </div>
                    <div>
                      <label style={{ ...S.label, marginBottom: 6 }}>Número da NF</label>
                      <input
                        value={faturamentoForm.numeroNF}
                        disabled={faturamentoForm.status !== "sim"}
                        onChange={e => setFaturamentoForm(prev => ({ ...prev, numeroNF: e.target.value }))}
                        placeholder="Informe a NF"
                        style={{ ...S.input, opacity: faturamentoForm.status === "sim" ? 1 : 0.6 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setFaturamentoEditId(null)} style={{ ...S.ghost, padding: "10px 12px" }}>Cancelar</button>
                      <button onClick={() => saveFaturamentoProjeto(p.id)} style={{ ...S.btn, padding: "10px 14px" }}>Salvar</button>
                    </div>
                  </div>
                )}

                {/* ── Linhas expandidas (itens da PO) ── */}
                {expanded && (
                  <div style={{ borderTop: `1px solid ${T.brBase}` }}>
                    {linhasDaObra.length === 0 ? (
                      <div style={{ padding: "16px 20px", color: T.txMut, fontSize: 14 }}>
                        {temPO ? "Nenhum item extraído da PO." : "Anexe a PO para ver os itens."}
                      </div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: T.bg1 + "80", borderBottom: `1px solid ${T.brSub}` }}>
                            <th style={{ width: 36, padding: "7px 12px" }} />
                            {["LINHA", "SERVIÇO / DESCRIÇÃO", "VALOR", "% FAT.", "VALOR FINAL"].map(h => (
                              <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: T.amber, fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {linhasDaObra.map((l, idx) => {
                            const pct = pctEdit[l.pctKey] !== undefined ? pctEdit[l.pctKey] : 100;
                            const valorFinal = l.valor * pct / 100;
                            const isSel = !!selected[l.key];
                            return (
                              <tr key={l.key}
                                onClick={() => setSelected(prev => ({ ...prev, [l.key]: !prev[l.key] }))}
                                style={{
                                  borderBottom: `1px solid ${T.brSub}`, cursor: "pointer",
                                  background: isSel ? T.green + "12" : idx % 2 === 0 ? "transparent" : T.bg1 + "30",
                                  borderLeft: isSel ? `3px solid ${T.green}` : `3px solid transparent`,
                                  transition: "background 0.1s"
                                }}>
                                <td style={{ padding: "8px 12px" }} onClick={e => e.stopPropagation()}>
                                  <input type="checkbox" checked={isSel}
                                    onChange={() => setSelected(prev => ({ ...prev, [l.key]: !prev[l.key] }))}
                                    style={{ width: 14, height: 14, cursor: "pointer", accentColor: T.green }} />
                                </td>
                                <td style={{ padding: "8px 10px", color: T.txMut, fontWeight: 600 }}>{l.linha}</td>
                                <td style={{ padding: "8px 10px", maxWidth: 360 }}>
                                  <div style={{ color: T.txPri, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }} title={l.servico}>{l.servico || "—"}</div>
                                </td>
                                <td style={{ padding: "8px 10px", color: T.txSec, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(l.valor)}</td>
                                <td style={{ padding: "8px 10px", minWidth: 150 }} onClick={e => e.stopPropagation()}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                                    <input type="range" min={0} max={100} step={5} value={pct}
                                      onChange={e => setPctEdit(prev => ({ ...prev, [l.pctKey]: Number(e.target.value) }))}
                                      style={{ flex: 1, accentColor: T.green, cursor: "pointer" }} />
                                    <span style={{ fontSize: 13, fontWeight: 900, color: T.green, minWidth: 34 }}>{pct}%</span>
                                  </div>
                                  <div style={{ display: "flex", gap: 3 }}>
                                    {[25, 50, 75, 100].map(v => (
                                      <button key={v} onClick={e => { e.stopPropagation(); setPctEdit(prev => ({ ...prev, [l.pctKey]: v })); }}
                                        style={{ flex: 1, padding: "1px 0", borderRadius: 3, border: `1px solid ${pct === v ? T.green : T.brBase}`, background: pct === v ? T.green + "25" : "transparent", color: pct === v ? T.green : T.txMut, fontSize: 11, cursor: "pointer", fontWeight: pct === v ? 700 : 400 }}>
                                        {v}%
                                      </button>
                                    ))}
                                  </div>
                                </td>
                                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                  <span style={{ fontSize: 14, fontWeight: 900, color: isSel ? T.green : T.amber }}>{fmt(valorFinal)}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé seleção */}
        {selList.length > 0 && (
          <div style={{
            ...S.card, marginTop: 14, background: T.green + "10", border: `1px solid ${T.green}30`,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.green }}>✅ {selList.length} item(ns) selecionado(s)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: T.green }}>{fmt(totalSel)}</span>
              <button onClick={exportExcel}
                style={{ ...S.btn, padding: "9px 20px", fontSize: 14, background: "linear-gradient(135deg,#065f46,#34d399)", display: "flex", alignItems: "center", gap: 7 }}>
                📊 Exportar Excel
              </button>
            </div>
          </div>
        )}

      </div>
    );
  };

  const PlaceholderPage = ({ icon, title, desc }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.card, padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.txPri, marginBottom: 6 }}>{icon} {title}</div>
        <div style={{ fontSize: 13, color: T.txSec }}>{desc}</div>
      </div>
    </div>
  );

  const TabFuncionarios = () => {
    const TIPOS_FUNC = ["CLT", "PJ", "Terceirizado", "Diarista"];
    const TIPO_COLOR = { CLT: T.green, PJ: T.blue, Terceirizado: T.purple, Diarista: T.amber };
    const TIPO_ICON = { CLT: "🧑‍💼", PJ: "🧑‍🔧", Terceirizado: "🤝", Diarista: "👷" };
    const search = funcSearch; const setSearch = setFuncSearch;
    const filterTipo = funcFilterTipo; const setFilterTipo = setFuncFilterTipo;
    const filtered = funcionarios.filter(f =>
      (filterTipo === "TODOS" || f.tipo === filterTipo) &&
      (f.nome.toLowerCase().includes(search.toLowerCase())
        || (f.cargo || "").toLowerCase().includes(search.toLowerCase())
        || (f.telefone || "").includes(search))
    );
    const openNew = () => { setEditFunc(null); setFuncForm(funcFormInit); setShowFuncModal(true); };
    const openEdit = (f) => { setEditFunc(f); setFuncForm({ nome: f.nome, cargo: f.cargo || "", tipo: f.tipo || "CLT", telefone: f.telefone || "", email: f.email || "", pixTipo: f.pixTipo || "CPF", pixChave: f.pixChave || "", banco: f.banco || "", agencia: f.agencia || "", conta: f.conta || "", obs: f.obs || "" }); setShowFuncModal(true); };
    const save = () => {
      if (!funcForm.nome.trim()) return;
      if (editFunc) setFuncionarios(prev => prev.map(f => f.id === editFunc.id ? { ...f, ...funcForm } : f));
      else setFuncionarios(prev => [...prev, { id: `func_${Date.now()}`, ...funcForm }]);
      setShowFuncModal(false); setEditFunc(null);
    };

    return (
      <div>
        <SectionHeader icon="👥" title="Funcionários" subtitle={`${funcionarios.length} cadastrado(s) · CLT, PJ e Terceirizados`} color={T.green} action={<button onClick={openNew} style={{ ...S.btn, background: "linear-gradient(135deg,#065f46,#34d399)" }}>+ Adicionar Funcionário</button>} />

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, maxWidth: 240 }} placeholder="🔍 Buscar por nome, cargo ou telefone..." />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["TODOS", ...TIPOS_FUNC].map(t => (
              <button key={t} onClick={() => setFilterTipo(t)}
                style={{
                  padding: "6px 12px", borderRadius: 7, border: `1px solid ${filterTipo === t ? (TIPO_COLOR[t] || T.green) : T.brBase}`,
                  background: filterTipo === t ? (TIPO_COLOR[t] || T.green) + "18" : "transparent",
                  color: filterTipo === t ? (TIPO_COLOR[t] || T.green) : T.txMut, cursor: "pointer", fontSize: 13, fontWeight: filterTipo === t ? 700 : 400
                }}>
                {t === "TODOS" ? t : `${TIPO_ICON[t]} ${t}`}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de cards */}
        {filtered.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
            <div style={{ color: T.txMut, fontSize: 14 }}>Nenhum funcionário encontrado</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {filtered.map(f => {
              const tc = TIPO_COLOR[f.tipo] || T.txMut;
              return (
                <div key={f.id} style={{ ...S.card, ...cardTint(tc), borderLeft: `3px solid ${tc}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.txPri, marginBottom: 4 }}>{TIPO_ICON[f.tipo] || "👤"} {f.nome}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ background: tc + "18", color: tc, border: `1px solid ${tc}40`, padding: "2px 9px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>{f.tipo}</span>
                        {f.cargo && <span style={{ background: T.bg3, color: T.txMut, border: `1px solid ${T.brBase}`, padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>{f.cargo}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => openEdit(f)} style={{ ...S.ghost, padding: "4px 9px", fontSize: 13 }}>✏️</button>
                      <button onClick={() => setFuncionarios(prev => prev.filter(x => x.id !== f.id))} style={{ ...S.ghost, color: T.red, border: `1px solid ${T.red}30`, padding: "4px 9px", fontSize: 13 }}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {f.telefone && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>Tel: </span><span style={{ color: T.txSec }}>{f.telefone}</span></div>}
                    {f.email && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>E-mail: </span><a href={`mailto:${f.email}`} style={{ color: T.blue }}>{f.email}</a></div>}
                    {f.pixChave && <div style={{ fontSize: 13 }}><span style={{ color: T.txMut }}>PIX ({f.pixTipo || "—"}): </span><span style={{ color: T.green }}>{f.pixChave}</span></div>}
                    {(f.banco || f.agencia || f.conta) && (
                      <div style={{ fontSize: 13 }}>
                        <span style={{ color: T.txMut }}>Banco: </span>
                        <span style={{ color: T.txSec }}>{[f.banco, f.agencia && `Ag ${f.agencia}`, f.conta && `Cc ${f.conta}`].filter(Boolean).join(" · ")}</span>
                      </div>
                    )}
                    {f.obs && <div style={{ fontSize: 13, color: T.txMut, background: T.bg3, borderRadius: 5, padding: "4px 8px", marginTop: 4 }}>💬 {f.obs}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {showFuncModal && (
          <div style={{ position: "fixed", inset: 0, background: "#000000c0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16, overflowY: "auto" }}>
            <div style={{ background: T.bg2, borderRadius: 14, border: `1px solid ${T.brBase}`, padding: 26, width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.green, marginBottom: 14 }}>{editFunc ? "✏️ Editar Funcionário" : "➕ Novo Funcionário"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Nome Completo</label>
                  <input value={funcForm.nome} onChange={e => setFuncField("nome", e.target.value)} style={S.input} placeholder="Nome do funcionário" /></div>
                <div><label style={S.label}>Tipo de Vínculo</label>
                  <select value={funcForm.tipo} onChange={e => setFuncField("tipo", e.target.value)} style={S.input}>
                    {TIPOS_FUNC.map(t => <option key={t} value={t}>{t}</option>)}
                  </select></div>
                <div><label style={S.label}>Cargo / Função</label>
                  <input value={funcForm.cargo} onChange={e => setFuncField("cargo", e.target.value)} style={S.input} placeholder="Ex: Técnico, Supervisor" /></div>
                <div><label style={S.label}>Telefone</label>
                  <input value={funcForm.telefone} onChange={e => setFuncField("telefone", e.target.value)} style={S.input} placeholder="(00) 00000-0000" /></div>
                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>E-mail</label>
                  <input value={funcForm.email} onChange={e => setFuncField("email", e.target.value)} style={S.input} placeholder="email@empresa.com" /></div>

                {/* Dados bancários / PIX */}
                <div style={{ gridColumn: "1/-1", background: T.bg3, borderRadius: 10, padding: 12, border: `1px solid ${T.brBase}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.txMut, letterSpacing: "0.06em", marginBottom: 10 }}>💳 DADOS BANCÁRIOS / PIX</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={S.label}>Tipo de Chave PIX</label>
                      <select value={funcForm.pixTipo} onChange={e => setFuncField("pixTipo", e.target.value)} style={S.input}>
                        {PIX_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label style={S.label}>Chave PIX</label>
                      <input value={funcForm.pixChave} onChange={e => setFuncField("pixChave", e.target.value)} style={S.input} placeholder="Informe a chave PIX" /></div>
                    <div><label style={S.label}>Banco</label>
                      <input value={funcForm.banco} onChange={e => setFuncField("banco", e.target.value)} style={S.input} placeholder="Ex: Nubank, Itaú, BB" /></div>
                    <div><label style={S.label}>Agência</label>
                      <input value={funcForm.agencia} onChange={e => setFuncField("agencia", e.target.value)} style={S.input} placeholder="0000" /></div>
                    <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Conta</label>
                      <input value={funcForm.conta} onChange={e => setFuncField("conta", e.target.value)} style={S.input} placeholder="00000-0" /></div>
                  </div>
                </div>

                <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Observações</label>
                  <textarea value={funcForm.obs} onChange={e => setFuncField("obs", e.target.value)} style={{ ...S.input, resize: "vertical", minHeight: 60 }} placeholder="Observações internas, disponibilidade, custos, etc." /></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setShowFuncModal(false); setEditFunc(null); }} style={{ ...S.ghost, flex: 1, padding: 10 }}>Cancelar</button>
                <button onClick={save} style={{ ...S.btn, flex: 2, padding: 10, background: "linear-gradient(135deg,#065f46,#34d399)" }}>{editFunc ? "Salvar Alterações" : "Adicionar Funcionário"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const TabRelatorios = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
      <div style={{ ...S.card, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>📊 Resumo Financeiro</div>
        <div style={{ fontSize: 12, color: T.txSec, lineHeight: 1.6 }}>
          Indicadores gerais, composição de custos e distribuição por categorias.
        </div>
        <button onClick={() => setTab("resumo")} style={{ ...S.btn, width: "fit-content" }}>Abrir resumo</button>
      </div>
      <div style={{ ...S.card, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>📑 PV Highline</div>
        <div style={{ fontSize: 12, color: T.txSec, lineHeight: 1.6 }}>
          Geração do PV com mapeamento automático e exportação em Excel.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setTab("pvhighline")} style={{ ...S.btn, width: "fit-content" }}>Abrir PV</button>
          <button onClick={() => setTab("orcamento")} style={{ ...S.ghost, width: "fit-content" }}>Abrir Orçamento (LPU)</button>
        </div>
      </div>
    </div>
  );

  const TabTabela = () => (
    <PlaceholderPage
      icon="▦"
      title="Tabela"
      desc="Área reservada para tabelas consolidadas e painéis auxiliares."
    />
  );

  const TabFaturas = () => (
    <PlaceholderPage
      icon="🧾"
      title="Faturas"
      desc="Gestão de faturas e cobranças (em construção)."
    />
  );

  // ════════════════════════════════════════════════════════════════════
  // TAB: PV HIGHLINE — Orçamento LS → PV Highline → Resumo
  // ════════════════════════════════════════════════════════════════════
  const TabPVHighline = () => {
    const { lpu: LPU_DB, mapeamento: MAPEAMENTO, pvTemplate: PV_TEMPLATE, resumoCats: RESUMO_CATS } = DB_PV_HIGHLINE;

    // ── Monta mapa cod LS → item LPU
    const lpuMap = {};
    LPU_DB.forEach(item => { lpuMap[item.cod] = item; });

    // ── Calcula PV a partir dos itens selecionados (orcItemsImpl)
    const calcPV = () => {
      // Para cada item do mapeamento, soma os valores dos cods LS que estão no orçamento
      const pvResult = {};
      MAPEAMENTO.forEach(map => {
        let qtdeTotal = 0;
        let vlTotal = 0;
        map.codsLS.forEach(cod => {
          const orcItem = orcItemsImpl.find(o => o.cod === cod);
          if (orcItem) {
            qtdeTotal += Number(orcItem.qtde) || 0;
            vlTotal += (Number(orcItem.qtde) || 0) * (Number(orcItem.vl_custom || orcItem.vlLS || lpuMap[cod]?.vlLS) || 0);
          }
        });
        // Se tem mapeamento manual, usa esse
        const manual = pvManuais[map.itemHL];
        if (manual) {
          qtdeTotal = Number(manual.qtde) || 0;
          vlTotal = qtdeTotal * (Number(manual.vlUnit) || 0);
        }
        pvResult[map.itemHL] = { qtde: qtdeTotal, vlTotal: vlTotal, map };
      });
      return pvResult;
    };

    const pvResult = calcPV();

    // ── Calcula Resumo por categoria
    const calcResumo = () => {
      const atividadeMap = {
        "Serviços de Engenharia": ["SEN"],
        "Fundação": ["FUNC", "FRZ"],
        "Fechamento": ["FEC"],
        "Área Construída": ["CON"],
        "Energia": ["ENT", "INFR"],
        "Extensão de Rede": ["EXT"],
        "Acesso": ["ACS"],
        "Itens complementares": ["COM"],
        "Transporte": ["TRA"],
        "Montagem": ["MON"],
        "Acessórios EV": ["AEV"],
        "Roof Top": ["RFT"],
        "Reforço": ["REF"],
      };
      const resumo = {};
      RESUMO_CATS.forEach(cat => { resumo[cat] = 0; });
      Object.entries(pvResult).forEach(([itemHL, val]) => {
        if (val.vlTotal <= 0) return;
        for (const [cat, prefixes] of Object.entries(atividadeMap)) {
          if (prefixes.some(p => itemHL.startsWith(p))) {
            resumo[cat] = (resumo[cat] || 0) + val.vlTotal;
            break;
          }
        }
      });
      return resumo;
    };

    const resumo = calcResumo();
    const totalPV = Object.values(resumo).reduce((s, v) => s + v, 0);

    // ── Export Excel — usa template original com fórmulas reais

    const exportarExcel = async () => {
      if (orcItemsImpl.length === 0) {
        setPvExportMsg("⚠️ Nenhum item no orçamento. Adicione itens em Orçamento (Implantação).");
        return;
      }
      setPvExportando(true);
      setPvExportMsg("⏳ Preparando exportação...");
      try {
        setPvExportMsg("⏳ Carregando template PV Highline...");

        // Decodificar template base64
        const binaryStr = atob(XLSX_TEMPLATE_PV_B64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const wb = XLSX.read(bytes, { type: "array", cellFormula: true, cellStyles: true });

        setPvExportMsg("⏳ Preenchendo quantidades...");

        // Atualizar cabeçalho PV HIGHLINE
        const wsPV = wb.Sheets["PV HIGHLINE"];
        wsPV["C7"] = { v: pvFornec, t: "s" };
        wsPV["C8"] = { v: pvSiteId, t: "s" };
        wsPV["C9"] = { v: pvUF, t: "s" };

        // Montar mapa cod→qtde do orçamento
        const qtdeMap = {};
        orcItemsImpl.forEach(item => {
          const q = Number(item.qtde) || 0;
          if (q > 0) qtdeMap[item.cod] = q;
        });

        // Preencher QTDE (col H) na sheet LPU ORÇAMENTO_LS
        const wsLPU = wb.Sheets["LPU ORÇAMENTO_LS"];
        const range = XLSX.utils.decode_range(wsLPU["!ref"]);
        for (let r = 2; r <= range.e.r; r++) {  // row 3+ (0-indexed = 2+)
          const codCell = wsLPU[XLSX.utils.encode_cell({ r, c: 0 })];  // col A
          if (!codCell || !codCell.v) continue;
          const cod = String(codCell.v).trim();
          const qtdeCell = XLSX.utils.encode_cell({ r, c: 7 });        // col H
          wsLPU[qtdeCell] = { v: qtdeMap[cod] || 0, t: "n" };
        }

        // Adicionar manuais via pvManuais
        // Esses ficam direto na PV HIGHLINE col F (QTDE)
        const pvRange = XLSX.utils.decode_range(wsPV["!ref"]);
        for (let r = 11; r <= pvRange.e.r; r++) {  // row 12+ (0-indexed=11+)
          const itemCell = wsPV[XLSX.utils.encode_cell({ r, c: 2 })];  // col C = item code
          if (!itemCell || !itemCell.v) continue;
          const itemCode = String(itemCell.v).trim();
          const manual = pvManuais[itemCode];
          if (manual && Number(manual.qtde) > 0) {
            // Sobrescrever col F com valor manual (sobreposição da fórmula)
            const fCell = XLSX.utils.encode_cell({ r, c: 5 });  // col F
            wsPV[fCell] = { v: Number(manual.qtde), t: "n" };
          }
        }

        setPvExportMsg("⏳ Gerando arquivo...");

        // Exportar apenas as sheets necessárias em novo workbook
        const wbOut = XLSX.utils.book_new();
        ["LPU ORÇAMENTO_LS", "MAPEAMENTO", "PV HIGHLINE", "Resumo PV"].forEach(name => {
          if (wb.Sheets[name]) XLSX.utils.book_append_sheet(wbOut, wb.Sheets[name], name);
        });

        const today = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
        const fname = `PV_Highline_${pvSiteId}_${today}.xlsx`;
        XLSX.writeFile(wbOut, fname);
        setPvExportMsg(`✅ Arquivo "${fname}" gerado! Abra no Excel para ver os valores calculados.`);
      } catch (e) {
        setPvExportMsg(`❌ Erro: ${e.message}`);
        console.error(e);
      } finally {
        setPvExportando(false);
      }
    };

    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: T.cyan, letterSpacing: "-0.02em" }}>📑 PV Highline</div>
            <div style={{ fontSize: 13, color: T.txMut, marginTop: 2 }}>Orçamento LS → mapeamento automático → PV Highline</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <button onClick={exportarExcel} disabled={pvExportando}
              style={{
                background: pvExportando ? "#1a3a2a" : "linear-gradient(135deg,#065f46,#34d399)",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "12px 22px", cursor: pvExportando ? "wait" : "pointer",
                fontSize: 13, fontWeight: 800, opacity: pvExportando ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: pvExportando ? "none" : "0 4px 20px #34d39940",
              }}>
              <span style={{ fontSize: 18 }}>📥</span>
              {pvExportando ? "⏳ Gerando arquivo..." : "Baixar PV Highline (.xlsx)"}
            </button>
            {pvExportMsg && (
              <div style={{
                fontSize: 13, maxWidth: 420, textAlign: "right", lineHeight: 1.5,
                color: pvExportMsg.startsWith("✅") ? T.green : pvExportMsg.startsWith("❌") ? T.red : T.amber,
                background: T.bg3, borderRadius: 7, padding: "6px 10px",
                border: `1px solid ${pvExportMsg.startsWith("✅") ? T.green : pvExportMsg.startsWith("❌") ? T.red : T.amber}30`,
              }}>{pvExportMsg}</div>
            )}
            <div style={{ fontSize: 12, color: T.txMut, textAlign: "right" }}>
              Abre no Excel · fórmulas calculam automaticamente
            </div>
          </div>
        </div>

        {/* Dados do site */}
        <div style={{ ...S.card, marginBottom: 18, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {[
            { l: "ID Highline (Site ID)", k: "pvSiteId", v: pvSiteId, set: setPvSiteId },
            { l: "UF", k: "pvUF", v: pvUF, set: setPvUF },
            { l: "Região", k: "pvRegiao", v: pvRegiao, set: setPvRegiao },
            { l: "Fornecedor", k: "pvFornec", v: pvFornec, set: setPvFornec },
          ].map(({ l, v, set }) => (
            <div key={l}>
              <label style={S.label}>{l}</label>
              <input value={v} onChange={e => set(e.target.value)} style={S.input} />
            </div>
          ))}
        </div>

        {/* Sub-abas */}
        <div style={{ display: "flex", gap: 3, marginBottom: 16, background: T.bg3, padding: 4, borderRadius: 10, width: "fit-content" }}>
          {[
            { id: "orcamento", l: "🔧 Orçamento LS" },
            { id: "pv", l: "📋 PV Highline" },
            { id: "resumo", l: "📊 Resumo" },
          ].map(({ id, l }) => (
            <button key={id} onClick={() => setPvTabInner(id)}
              style={{
                padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 14,
                fontWeight: pvTabInner === id ? 700 : 400,
                background: pvTabInner === id ? T.bg0 : "transparent",
                color: pvTabInner === id ? T.cyan : T.txMut
              }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── ABA: ORÇAMENTO LS ── */}
        {pvTabInner === "orcamento" && (
          <div>
            <div style={{ ...S.card, marginBottom: 12, background: T.blue + "10", border: `1px solid ${T.blue}30` }}>
              <div style={{ fontSize: 13, color: T.blue }}>
                💡 Selecione os itens no <strong>Orçamento (Implantação)</strong> e defina as quantidades.
                Os itens selecionados serão automaticamente mapeados para a PV Highline.
              </div>
            </div>
            {orcItemsImpl.length === 0 ? (
              <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                <div style={{ fontSize: 13, color: T.txSec, marginBottom: 6 }}>Nenhum item selecionado no Orçamento</div>
                <div style={{ fontSize: 13, color: T.txMut, marginBottom: 16 }}>Vá em Orçamento (Implantação), selecione os itens e defina as quantidades</div>
                <button onClick={() => setTab("orcamento")} style={S.btn}>→ Ir para Orçamento</button>
              </div>
            ) : (
              <div>
                {/* Legenda de origem dos preços */}
                <div style={{
                  background: T.bg3, border: `1px solid ${T.blue}30`,
                  borderRadius: 8, padding: "8px 14px", marginBottom: 10,
                  fontSize: 13, color: T.txSec, lineHeight: 1.8,
                }}>
                  <strong style={{ color: T.blue }}>ℹ️ Origem do VL Unit LS:</strong>{" "}
                  Os valores exibidos são os <strong style={{ color: T.amber }}>preços editados no Orçamento (Implantação)</strong> (campo "VL Unit").
                  A planilha original Highline tinha a coluna de custo LS zerada — os valores foram preenchidos com o
                  <strong style={{ color: T.cyan }}> preço de mercado (VL Médio)</strong> como referência.
                  Para usar seu custo real, edite o VL Unit diretamente em cada item na aba Orçamento.
                </div>
                <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: T.bg3, borderBottom: `1px solid ${T.brBase}` }}>
                        {["COD", "CATEGORIA", "CONFIGURAÇÃO", "UNID", "QTDE", "VL UNIT LS", "TOTAL LS", "→ ITEM HL"].map(h => (
                          <th key={h} style={{ padding: "9px 10px", textAlign: "left", color: T.amber, fontWeight: 700, fontSize: 12, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orcItemsImpl.map((item, i) => {
                        const vlUnit = item.vl_custom || item.vlLS || lpuMap[item.cod]?.vlLS || 0;
                        const total = (item.qtde || 0) * vlUnit;
                        // Quais itens HL este cod mapeia?
                        const hlMaps = MAPEAMENTO.filter(m => m.codsLS.includes(item.cod));
                        return (
                          <tr key={item.cod} style={{ borderBottom: `1px solid ${T.brSub}`, background: i % 2 === 0 ? "transparent" : T.bg1 + "40" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: T.cyan }}>{item.cod}</td>
                            <td style={{ padding: "8px 10px", color: T.txSec }}>{item.resumo}</td>
                            <td style={{ padding: "8px 10px", color: T.txMut, fontSize: 13, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.config}</td>
                            <td style={{ padding: "8px 10px", color: T.txSec }}>{item.unid}</td>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: T.txPri }}>{item.qtde}</td>
                            <td style={{ padding: "8px 10px", color: vlUnit > 0 ? T.green : T.txDis, whiteSpace: "nowrap", fontWeight: 600 }}>
                              {vlUnit > 0 ? fmt(vlUnit) : <span style={{ fontSize: 12, color: T.txDis }}>— editar no Orçamento</span>}
                            </td>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: T.amber, whiteSpace: "nowrap" }}>{fmt(total)}</td>
                            <td style={{ padding: "8px 10px" }}>
                              {hlMaps.length > 0
                                ? <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {hlMaps.map(m => (
                                    <span key={m.itemHL} style={{ background: T.green + "18", color: T.green, border: `1px solid ${T.green}30`, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>{m.itemHL}</span>
                                  ))}
                                </div>
                                : <span style={{ color: T.txDis, fontSize: 12 }}>sem mapeamento</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: T.bg3, borderTop: `2px solid ${T.amber}30` }}>
                        <td colSpan={6} style={{ padding: "10px", fontWeight: 700, color: T.txSec }}>TOTAL ORÇAMENTO LS</td>
                        <td style={{ padding: "10px", fontWeight: 900, color: T.amber, fontSize: 15 }}>
                          {fmt(orcItemsImpl.reduce((s, i) => {
                            const v = i.vl_custom || i.vlLS || lpuMap[i.cod]?.vlLS || 0;
                            return s + (i.qtde || 0) * v;
                          }, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ABA: PV HIGHLINE ── */}
        {pvTabInner === "pv" && (
          <div>
            <div style={{ ...S.card, marginBottom: 12, background: T.amber + "10", border: `1px solid ${T.amber}30` }}>
              <div style={{ fontSize: 13, color: T.amber }}>
                💡 Itens com <strong>Qtde = 0</strong> e sem mapeamento automático podem ser preenchidos manualmente abaixo.
                O campo "Qtde Manual" sobrepõe o valor calculado automaticamente.
              </div>
            </div>
            <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.bg3, borderBottom: `1px solid ${T.brBase}` }}>
                      {["Atividade", "Item", "Descrição", "Unid", "Qtde Auto", "Qtde Manual", "Vl Unit", "Vl Total", "Cods LS"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: T.amber, fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PV_TEMPLATE.map((pv, i) => {
                      const res = pvResult[pv.item] || { qtde: 0, vlTotal: 0 };
                      const manual = pvManuais[pv.item];
                      const qtdeFinal = manual ? (Number(manual.qtde) || 0) : res.qtde;
                      const vlTotal = qtdeFinal * pv.vlUnit;
                      const map = MAPEAMENTO.find(m => m.itemHL === pv.item);
                      const temMapeamento = map && map.codsLS.length > 0;
                      const hasValue = vlTotal > 0;
                      return (
                        <tr key={`${pv.item}_${i}`}
                          style={{
                            borderBottom: `1px solid ${T.brSub}`,
                            background: hasValue ? T.green + "08" : i % 2 === 0 ? "transparent" : T.bg1 + "30"
                          }}>
                          <td style={{ padding: "6px 10px", color: T.txMut, fontSize: 12, whiteSpace: "nowrap" }}>{pv.atividade}</td>
                          <td style={{ padding: "6px 10px", fontWeight: 700, color: hasValue ? T.green : T.txDis }}>{pv.item}</td>
                          <td style={{ padding: "6px 10px", color: T.txSec, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pv.desc}>{pv.desc}</td>
                          <td style={{ padding: "6px 10px", color: T.txMut }}>{pv.unid}</td>
                          <td style={{ padding: "6px 10px", fontWeight: res.qtde > 0 ? 700 : 400, color: res.qtde > 0 ? T.blue : T.txDis }}>{res.qtde || "—"}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <input type="number" min={0}
                              value={manual?.qtde ?? ""}
                              onChange={e => {
                                const v = e.target.value;
                                setPvManuais(prev => ({ ...prev, [pv.item]: { ...(prev[pv.item] || {}), qtde: v } }));
                              }}
                              placeholder="—"
                              style={{
                                ...S.input, width: 60, padding: "3px 6px", fontSize: 12, textAlign: "center",
                                color: manual?.qtde ? T.amber : T.txDis,
                                borderColor: manual?.qtde ? T.amber : T.brBase
                              }} />
                          </td>
                          <td style={{ padding: "6px 10px", color: T.txSec, whiteSpace: "nowrap" }}>{pv.vlUnit > 0 ? fmt(pv.vlUnit) : "—"}</td>
                          <td style={{ padding: "6px 10px", fontWeight: hasValue ? 700 : 400, color: hasValue ? T.green : T.txDis, whiteSpace: "nowrap" }}>{hasValue ? fmt(vlTotal) : "—"}</td>
                          <td style={{ padding: "6px 10px" }}>
                            {temMapeamento
                              ? <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                {map.codsLS.map(c => (
                                  <span key={c} style={{ background: T.blue + "18", color: T.blue, borderRadius: 3, padding: "1px 5px", fontSize: 11 }}>{c}</span>
                                ))}
                              </div>
                              : <span style={{ color: T.txDis, fontSize: 11 }}>{map?.obs || "manual"}</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: T.bg3, borderTop: `2px solid ${T.green}40` }}>
                      <td colSpan={7} style={{ padding: "10px", fontWeight: 700, color: T.txSec }}>TOTAL PV HIGHLINE</td>
                      <td style={{ padding: "10px", fontWeight: 900, color: T.green, fontSize: 15, whiteSpace: "nowrap" }}>{fmt(totalPV)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── ABA: RESUMO ── */}
        {pvTabInner === "resumo" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 16 }}>📊 Resumo PV Highline</div>
              <div style={{ marginBottom: 12, padding: "10px 14px", background: T.bg3, borderRadius: 9, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: T.txMut }}>Site ID Highline</span>
                <span style={{ fontWeight: 700, color: T.purple }}>{pvSiteId}</span>
              </div>
              {[{ l: "UF", v: pvUF }, { l: "Região", v: pvRegiao }, { l: "Fornecedor", v: pvFornec }].map(({ l, v }) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.brSub}` }}>
                  <span style={{ fontSize: 13, color: T.txMut }}>{l}</span>
                  <span style={{ fontSize: 13, color: T.txPri, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 20 }}>
                {RESUMO_CATS.map(cat => {
                  const val = resumo[cat] || 0;
                  const pct = totalPV > 0 ? (val / totalPV * 100).toFixed(1) : 0;
                  return (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 14, color: val > 0 ? T.txPri : T.txMut }}>{cat}</span>
                        <span style={{ fontSize: 14, fontWeight: val > 0 ? 700 : 400, color: val > 0 ? T.green : T.txDis }}>{val > 0 ? fmt(val) : "—"}</span>
                      </div>
                      {val > 0 && <div style={{ height: 4, borderRadius: 2, background: T.bg4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: T.green, borderRadius: 2 }} />
                      </div>}
                    </div>
                  );
                })}
                <div style={{ borderTop: `2px solid ${T.green}40`, paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>TOTAL R$</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: T.green }}>{fmt(totalPV)}</span>
                </div>
              </div>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 16 }}>🔗 Como funciona</div>
              <div style={{ fontSize: 13, color: T.txSec, lineHeight: 2 }}>
                <div><span style={{ color: T.blue, fontWeight: 700 }}>1.</span> Acesse <strong>Orçamento (Implantação)</strong> e selecione os itens</div>
                <div><span style={{ color: T.blue, fontWeight: 700 }}>2.</span> Defina as <strong>quantidades (QTDE)</strong> de cada item</div>
                <div><span style={{ color: T.blue, fontWeight: 700 }}>3.</span> Volte aqui e clique em <strong>Exportar PV Highline</strong></div>
                <div><span style={{ color: T.blue, fontWeight: 700 }}>4.</span> O sistema preenche as QTDEs no template original da Highline</div>
                <div><span style={{ color: T.blue, fontWeight: 700 }}>5.</span> O Excel exportado usa as <strong>fórmulas reais</strong> da Highline</div>
                <div><span style={{ color: T.blue, fontWeight: 700 }}>6.</span> Abra no Excel — os valores são calculados automaticamente</div>
              </div>
              <div style={{ marginTop: 12, padding: "10px 14px", background: T.amber + "15", borderRadius: 8, border: `1px solid ${T.amber}30` }}>
                <div style={{ fontSize: 12, color: T.amber, fontWeight: 700, marginBottom: 4 }}>💡 PREÇOS NO ARQUIVO EXPORTADO</div>
                <div style={{ fontSize: 12, color: T.txSec, lineHeight: 1.7 }}>
                  O <strong>Valor Unitário</strong> na PV Highline usa a tabela de referência Highline (VL Médio),
                  que é o preço que a Highline reconhece. O preço LS Office fica no seu orçamento interno.
                  Itens sem mapeamento automático podem ter QTDE preenchida manualmente na aba <strong>PV Highline</strong>.
                </div>
              </div>
              <div style={{ background: T.bg3, borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 8 }}>ESTATÍSTICAS</div>
                {[
                  { l: "Itens no orçamento LS", v: orcItemsImpl.length, c: T.blue },
                  { l: "Itens PV mapeados (auto)", v: Object.values(pvResult).filter(r => r.qtde > 0).length, c: T.green },
                  { l: "Itens PV preenchidos (manual)", v: Object.keys(pvManuais).filter(k => pvManuais[k]?.qtde).length, c: T.amber },
                  { l: "Total itens PV Highline", v: PV_TEMPLATE.length, c: T.txMut },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.brSub}` }}>
                    <span style={{ fontSize: 13, color: T.txMut }}>{l}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════
  // RENDER MAIN
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="scroll-min" style={{ fontFamily: "'Inter','DM Sans',system-ui,sans-serif", minHeight: "100vh", background: T.bg0, color: T.txPri, display: "flex", fontSize: 14, position: "relative", WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" } as React.CSSProperties}>
      {Sidebar()}
      <div className="scroll-min" style={{ 
        flex: 1, 
        overflowY: "auto", 
        padding: "10px 12px 18px",
        marginLeft: sidePinned ? 260 : 64,
        transition: "margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
      }}>
        {tab !== "secretaria" && TopBar()}
        {tab === "dashboard" && TabDashboard()}
        {tab === "orcv2" && <TabOrcamentoV2 dbImpl={DB} dbOp={DB_OP} dbHighline={DB_PV_HIGHLINE?.lpu} onSaveBudget={handleSaveBudgetV2} onCreateProjectFromBudget={openCreateActivityFromBudget} onLinkBudgetToProject={openBudgetLinkModal} onOpenLinkedProject={openLinkedProject} activeBudget={activeBudgetV2} setActiveBudget={setActiveBudgetV2} logoBase64={LOGO_B64} projetos={projetos} clientes={clientes} />}
        {tab === "lpus" && <TabLpus />}
        {tab === "projetos" && TabProjetos()}
        {tab === "controle" && (projetoSel ? TabControle() : TabControleDash())}
        {tab === "fornecedores" && TabFornecedores()}
        {tab === "funcionarios" && TabFuncionarios()}
        {tab === "relatorios" && TabRelatorios()}
        {tab === "clientes" && TabClientes()}
        {tab === "faturamento" && TabFaturamento()}
        {tab === "pvhighline" && TabPVHighline()}
        {tab === "resumo" && TabResumo()}
        {tab === "historico" && TabHistorico()}
        {tab === "tabela" && TabTabela()}
      {tab === "faturas" && TabFaturas()}
      {tab === "secretaria" && (
        <div style={{ height: "calc(100vh - 20px)", width: "100%", display: "flex", flexDirection: "column", margin: "-10px -12px" }}>
          <TabSecretaria />
        </div>
      )}
    </div>
      {budgetLinkModalJSX}
      {projectModalJSX}
      {siteModalJSX}
    </div>
  );
}
