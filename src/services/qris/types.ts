/**
 * Types & Interfaces for QRIS parser, validator, and dynamic converter.
 * Based on EMVCo / QRIS Bank Indonesia specification.
 */

export interface TLV {
  tag: string;
  name: string;
  length: number;
  value: string;
  children?: TLV[];
}

export interface QRISData {
  version: string;
  method: 'static' | 'dynamic';
  merchantAccountInfo: MerchantAccountInfo[];
  merchantCategoryCode: string;
  currency: string;
  amount?: string;
  tipIndicator?: 'prompt' | 'fixed' | 'percentage';
  tipFixed?: string;
  tipPercentage?: string;
  countryCode: string;
  merchantName: string;
  merchantCity: string;
  postalCode: string;
  additionalData?: TLV[];
  crc: string;
  raw: TLV[];
}

export interface MerchantAccountInfo {
  tag: string;
  globallyUniqueId: string;
  merchantId?: string;
  merchantCriteria?: string;
  fields: TLV[];
}

export interface ConvertOptions {
  amount: number;
  fee?: {
    type: 'fixed' | 'percentage';
    value: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
