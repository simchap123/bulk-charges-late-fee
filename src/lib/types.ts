// V0 API types
export interface V0Tenant {
  Id?: string;
  IntegrationId?: string;
  ExternalId?: string;
  OccupancyId?: string;
  Status?: string;
  UnitId?: string;
  [key: string]: unknown;
}

// V2 API types
export interface V2TenantDirectoryRow {
  occupancy_import_uid?: string;
  tenant_integration_id?: string;
  status?: string;
  property_name?: string;
  property?: string;
  unit?: string;
  unit_name?: string;
  occupancy_id?: string;
  [key: string]: unknown;
}

export interface AgedReceivablesRow {
  propName?: string;
  unitName?: string;
  payerName?: string;
  occIdV2?: string;
  zeroTo30?: number | string;
  totalAmount?: number | string;
  v2UnitId?: string;
  v2PropId?: string;
  postingDateRaw?: string;
  chargeDateRaw?: string;
  _account_number?: string;
}

// Application types
export interface ChargeRow {
  propertyName: string;
  unitName: string;
  occupancyUid: string;
  tenantName: string;
  occupancyId: string;
  amount: number;
  chargeDate: string;
  postingDate: string;
  glAccountNumber: string;
  description: string;
  // Internal fields (prefixed with _)
  _chargeDateIso: string;
  _postingDateIso: string;
  _tenantIntegrationId: string;
  _v0OccupancyId: string;
  _v2UnitId: string;
  _v2PropertyId: string;
  _zeroTo30: number;
  _totalAmount: number;
}

// API response types
export interface TableDataResponse {
  rows: ChargeRow[];
  warnings: string[];
}

export interface BulkChargePayload {
  AmountDue: string;
  ChargedOn: string;
  Description: string;
  GlAccountId: string;
  OccupancyId: string;
  ReferenceId: string;
}

export interface LoadingState {
  isLoading: boolean;
  progress: number;
  stage: string;
}
