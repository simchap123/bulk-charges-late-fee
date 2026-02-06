// Environment configuration helper
// Switches between TEST and LIVE credentials based on X-Env-Mode header

export type EnvMode = 'live' | 'test';

export interface V2Config {
  base: string;
  user: string;
  pass: string;
  propertyIds: string[];
}

export interface V0Config {
  base: string;
  devId: string;
  clientId: string;
  clientSecret: string;
  propertyIds: string[];
}

export interface GlConfig {
  bulkGlAccountId: string;
  tableGlAccountNumber: string;
  filterGlAccount: string;
}

export function getEnvMode(request: Request): EnvMode {
  const header = request.headers.get('X-Env-Mode');
  return header === 'test' ? 'test' : 'live';
}

export function getV2Config(mode: EnvMode): V2Config {
  if (mode === 'test') {
    return {
      base: (process.env.TEST_V2_BASE || '').replace(/\/$/, ''),
      user: process.env.TEST_V2_USER || '',
      pass: process.env.TEST_V2_PASS || '',
      propertyIds: (process.env.TEST_V2_PROPERTY_IDS || '').split(',').filter(Boolean),
    };
  }

  return {
    base: (process.env.V2_BASE || '').replace(/\/$/, ''),
    user: process.env.V2_USER || '',
    pass: process.env.V2_PASS || '',
    propertyIds: (process.env.V2_PROPERTY_IDS || '').split(',').filter(Boolean),
  };
}

export function getV0Config(mode: EnvMode): V0Config {
  if (mode === 'test') {
    return {
      base: (process.env.TEST_V0_BASE || 'https://api.appfolio.com/api/v0').replace(/\/$/, ''),
      devId: process.env.TEST_V0_DEV_ID || '',
      clientId: process.env.TEST_V0_CLIENT_ID || '',
      clientSecret: process.env.TEST_V0_CLIENT_SECRET || '',
      propertyIds: (process.env.TEST_V0_PROPERTY_IDS || '').split(',').filter(Boolean),
    };
  }

  return {
    base: (process.env.V0_BASE || 'https://api.appfolio.com/api/v0').replace(/\/$/, ''),
    devId: process.env.V0_DEV_ID || '',
    clientId: process.env.V0_CLIENT_ID || '',
    clientSecret: process.env.V0_CLIENT_SECRET || '',
    propertyIds: (process.env.V0_PROPERTY_IDS || '').split(',').filter(Boolean),
  };
}

export function getGlConfig(mode: EnvMode): GlConfig {
  if (mode === 'test') {
    return {
      bulkGlAccountId: process.env.TEST_BULK_GL_ACCOUNT_ID || '',
      tableGlAccountNumber: process.env.TEST_TABLE_GL_ACCOUNT_NUMBER || '',
      filterGlAccount: process.env.TEST_FILTER_GL_ACCOUNT || '',
    };
  }

  return {
    bulkGlAccountId: process.env.BULK_GL_ACCOUNT_ID || '',
    tableGlAccountNumber: process.env.TABLE_GL_ACCOUNT_NUMBER || '',
    filterGlAccount: process.env.FILTER_GL_ACCOUNT || '',
  };
}

export function isDryRun(mode: EnvMode): boolean {
  if (mode === 'test') {
    return process.env.TEST_DRY_RUN === '1';
  }
  return false;
}

export function authBasic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}
