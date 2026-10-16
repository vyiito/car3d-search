export function sourceFailure(error, requests = []) {
  const message = String(error || '')
  const statuses = requests.filter(request => !request.recovered).map(request => request.status)
  if (/chave de API|acesso pago|payment required|x402/i.test(message) || statuses.includes(402)) return { failureKind: 'access-required', retryable: false, error: 'A fonte exige acesso de API autorizado ou pago. A busca no site original continua disponível.' }
  if (/não expõe um catálogo|unsupported-catalog|login required/i.test(message) || statuses.includes(401)) return { failureKind: 'access-required', retryable: false, error: 'A fonte exige login ou uma integração autorizada para consultar este catálogo.' }
  if (statuses.includes(403) || statuses.includes(202) || /HTTP (?:403|202)|bloqueou|access denied|cloudflare|captcha/i.test(message)) {
    const status = statuses.find(status => status === 403 || status === 202) || message.match(/HTTP (403|202)/i)?.[1]
    return { failureKind: 'blocked', retryable: false, error: `A fonte bloqueou a consulta automática${status ? ` (HTTP ${status})` : ''}. Abra a busca no site original.` }
  }
  if (/tempo limite|timeout|timed out|aborted/i.test(message)) return { failureKind: 'timeout', retryable: true, error: 'Tempo limite da consulta excedido. Os resultados já encontrados foram preservados.' }
  if (statuses.includes(429) || /HTTP 429/.test(message)) return { failureKind: 'rate-limit', retryable: true, error: 'A fonte limitou as consultas. Tente novamente mais tarde ou abra o site original.' }
  if (statuses.some(status => status >= 500) || /HTTP 5\d\d|fetch failed|network/i.test(message)) return { failureKind: 'temporary', retryable: true, error: 'A fonte está temporariamente indisponível. Tente novamente ou abra o site original.' }
  return { failureKind: 'integration', retryable: true, error: message || 'Não foi possível consultar a fonte.' }
}
