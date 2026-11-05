export interface TriggerResponse { trigger_word: string; response_text: string; active?: boolean }

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// Match complete words and prefer the most specific phrase, regardless of row order.
export function matchTriggerResponse(text: string, rules: TriggerResponse[]) {
  const message = normalize(text);
  if (!message) return undefined;
  let best: TriggerResponse | undefined;
  let bestScore = -1;
  for (const rule of rules) {
    if (rule.active === false) continue;
    for (const raw of rule.trigger_word.split(",")) {
      const keyword = normalize(raw);
      if (!keyword) continue;
      const exact = message === keyword;
      if (!exact && !` ${message} `.includes(` ${keyword} `)) continue;
      const score = keyword.length + (exact ? 10000 : 0);
      if (score > bestScore) { best = rule; bestScore = score; }
    }
  }
  return best;
}

const standardMenu = [
  { number: '1', label: 'Tabela de preços', keywords: ['tabela de preços', 'preço'] },
  { number: '2', label: 'Agendar horário', keywords: ['agendar', 'agendamento'] },
  { number: '3', label: 'Horários de funcionamento', keywords: ['funcionamento', 'abre'] },
  { number: '4', label: 'Nosso endereço', keywords: ['endereço', 'local'] },
  { number: '5', label: 'Serviços disponíveis', keywords: ['serviços', 'tabela de preços', 'preço'] },
  { number: '6', label: 'Falar com atendente', keywords: ['atendente', 'humano'] },
  { number: '7', label: 'Encerrar', keywords: ['tchau', 'até mais'] },
];

export function getMenuEntries(rules: TriggerResponse[]) {
  return standardMenu.flatMap(option => {
    const explicit = matchTriggerResponse(option.number, rules);
    const rule = explicit || option.keywords.map(word => matchTriggerResponse(word, rules)).find(Boolean);
    if (!rule) return [];
    const customLabel = explicit?.trigger_word.split(',').map(word => word.trim()).find(word => word && !/^\d+$/.test(word));
    return [{ ...option, label: customLabel || option.label, rule }];
  });
}

export function resolveMenuResponse(text: string, rules: TriggerResponse[]) {
  const direct = matchTriggerResponse(text, rules);
  if (direct) return direct;
  const input = normalize(text);
  if (!/^\d+$/.test(input)) return undefined;
  return getMenuEntries(rules).find(option => option.number === input)?.rule;
}

export function buildNumericMenu(rules: TriggerResponse[]) {
  const options = getMenuEntries(rules);
  if (!options.length) return 'Olá! Como podemos ajudar?';
  return `💈 *Atendimento Dom Vere*\n\nEscolha uma opção:\n\n${options.map(option => `${option.number} — ${option.label}`).join('\n')}\n\nDigite o número da opção. Para voltar ao menu, digite 0.`;
}
