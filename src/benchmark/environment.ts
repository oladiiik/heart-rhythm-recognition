/** Умови, за яких отримано результати: зберігаються разом із ними, щоб заміри можна було порівнювати */
export interface BenchmarkEnvironment {
  readonly browser: string;
  readonly os: string;
  readonly logicalCores: number | null;
  /** Оцінка браузера в ГБ; Chrome повідомляє щонайбільше 8 */
  readonly memoryGb: number | null;
  readonly userAgent: string;
}

interface BrandVersion {
  readonly brand: string;
  readonly version: string;
}

interface HighEntropyValues {
  readonly fullVersionList?: readonly BrandVersion[];
  readonly platform?: string;
  readonly platformVersion?: string;
}

interface ExtendedNavigator extends Navigator {
  readonly userAgentData?: { getHighEntropyValues(hints: string[]): Promise<HighEntropyValues> };
  readonly deviceMemory?: number;
}

function browserFromUserAgent(userAgent: string): string {
  const patterns: readonly [RegExp, string][] = [
    [/Edg\/([\d.]+)/, 'Microsoft Edge'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ];
  for (const [pattern, name] of patterns) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) return `${name} ${version}`;
  }
  return 'невідомий браузер';
}

function osFromUserAgent(userAgent: string): string {
  if (/Windows NT 10/.test(userAgent)) return 'Windows 10 або 11';
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Linux/.test(userAgent)) return 'Linux';
  return 'невідома ОС';
}

function browserFromBrands(brands: readonly BrandVersion[]): string | null {
  // Список містить і загальні позначки на кшталт «Chromium» та навмисно вигадані назви з «Not»
  const named =
    brands.find(({ brand }) => brand !== 'Chromium' && !/Not/i.test(brand)) ??
    brands.find(({ brand }) => brand === 'Chromium');
  return named ? `${named.brand} ${named.version}` : null;
}

function osFromPlatform(platform: string, version: string): string {
  if (platform === 'Windows') {
    // Windows 11 повідомляє версію платформи 13 і вище, Windows 10 нижче 13
    const major = Number.parseInt(version, 10);
    return Number.isFinite(major) ? (major >= 13 ? 'Windows 11' : 'Windows 10') : 'Windows';
  }
  return version ? `${platform} ${version}` : platform;
}

export async function detectEnvironment(): Promise<BenchmarkEnvironment> {
  const nav = navigator as ExtendedNavigator;
  const userAgent = nav.userAgent;
  let browser = browserFromUserAgent(userAgent);
  let os = osFromUserAgent(userAgent);
  try {
    const values = await nav.userAgentData?.getHighEntropyValues(['fullVersionList', 'platformVersion']);
    browser = (values?.fullVersionList && browserFromBrands(values.fullVersionList)) ?? browser;
    if (values?.platform) os = osFromPlatform(values.platform, values.platformVersion ?? '');
  } catch {
    // Браузер може відмовити в докладних даних; тоді лишаються дані з рядка User-Agent
  }
  return {
    browser,
    os,
    logicalCores: nav.hardwareConcurrency || null,
    memoryGb: nav.deviceMemory ?? null,
    userAgent,
  };
}
