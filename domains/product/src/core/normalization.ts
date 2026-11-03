import { ProductValidationError } from './errors.js';

export function normalizeProductCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) throw new ProductValidationError('Code must use A-Z, 0-9, _ or -');
  return code;
}

export function normalizeProductCountry(value?: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new ProductValidationError('marketCode must be ISO alpha-2');
  return code;
}

/** Canonical SKU selection dimensions, not model attributes or immutable SKU identity. */
export function normalizeSkuDimension(value: string | null | undefined, field: 'colorCode' | 'sizeCode'): string | null {
  if(value===undefined||value===null)return null;
  if(typeof value!=='string')throw new ProductValidationError(field+' must be text');
  const dimension=value.trim().toUpperCase();
  if(!dimension)return null;
  if(!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(dimension))
    throw new ProductValidationError(field+' must use at most 32 A-Z, 0-9, _ or - characters');
  return dimension;
}

/** Business-facing mnemonic stock code; NOT a database primary key. */
export function normalizeMnemonicSku(value: string): string {
  if (typeof value !== 'string') throw new ProductValidationError('SKU must be text');
  const sku = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]-[A-Z]{3}-[A-Z0-9]{3}$/.test(sku))
    throw new ProductValidationError('SKU must use 2-3-3 format, e.g. A1-EBI-BLK');
  const category = sku.slice(3, 6);
  if (!['EBI','BAT','CHG','MOT','RCK','FND','LCK','HLM','BAG'].includes(category))
    throw new ProductValidationError('SKU category must come from the ALSVID dictionary');
  return sku;
}

/** Derive the two-character vehicle SKU family prefix; null requires admin review. */
export function deriveVehicleSkuPrefix(value: string): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)?$/.test(code)) return null;
  const segments = code.split('-');
  if (segments.length === 2) return `${segments[0]![0]}${segments[1]![0]}`;
  if (code.length === 2) return code;
  if (/^[A-Z]{2}[A-Z0-9]+$/.test(code)) return code.slice(0, 2);
  return null;
}

export function normalizeMnemonicPrefix(value: string): string {
  if (typeof value !== 'string') throw new ProductValidationError('SKU prefix must be text');
  const prefix = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]$/.test(prefix))
    throw new ProductValidationError('SKU prefix must be two uppercase alphanumeric characters, e.g. A1 or AU');
  return prefix;
}
