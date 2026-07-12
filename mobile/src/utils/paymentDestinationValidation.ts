export interface PaymentDestinationParseResult {
  kind: 'iban' | 'mbway';
  description: string;
}

const IBAN_LENGTH_BY_COUNTRY: Record<string, number> = {
  PT: 25,
};

function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

function normalizeMbway(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

function ibanToNumericString(iban: string): string {
  let out = '';
  for (const ch of iban) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      out += (code - 55).toString();
    } else {
      out += ch;
    }
  }
  return out;
}

function mod97(numeric: string): number {
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder;
}

function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  const country = iban.slice(0, 2);
  const expectedLength = IBAN_LENGTH_BY_COUNTRY[country];
  if (expectedLength && iban.length !== expectedLength) return false;

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  const numeric = ibanToNumericString(rearranged);
  return mod97(numeric) === 1;
}

function isValidMbway(phone: string): boolean {
  if (/^9\d{8}$/.test(phone)) return true;
  if (/^\+3519\d{8}$/.test(phone)) return true;
  return false;
}

function stripKnownPrefix(raw: string): {value: string; hint: 'iban' | 'mbway' | null} {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();

  if (upper.startsWith('IBAN')) {
    return {value: trimmed.slice(4).trim(), hint: 'iban'};
  }

  if (upper.startsWith('MBWAY')) {
    return {value: trimmed.slice(6).trim(), hint: 'mbway'};
  }

  if (upper.startsWith('MB WAY')) {
    return {value: trimmed.slice(6).trim(), hint: 'mbway'};
  }

  return {value: trimmed, hint: null};
}

function formatIbanForDisplay(iban: string): string {
  const chunks = iban.match(/.{1,4}/g) ?? [iban];
  return `IBAN ${chunks.join(' ')}`;
}

function formatMbwayForDisplay(phone: string): string {
  const normalized = phone.startsWith('+351') ? phone : `+351${phone}`;
  return `MB WAY ${normalized}`;
}

export function parsePaymentDestination(raw: string): PaymentDestinationParseResult | null {
  const {value, hint} = stripKnownPrefix(raw);
  if (!value) return null;

  const iban = normalizeIban(value);
  if ((hint === 'iban' || hint === null) && isValidIban(iban)) {
    return {
      kind: 'iban',
      description: formatIbanForDisplay(iban),
    };
  }

  const mbway = normalizeMbway(value);
  if ((hint === 'mbway' || hint === null) && isValidMbway(mbway)) {
    return {
      kind: 'mbway',
      description: formatMbwayForDisplay(mbway),
    };
  }

  return null;
}
