/**
 * The scaffold's words, in both languages. They are placeholders until the
 * operator approves the English copy (#334) and the Indonesian is translated
 * with its D18 evidence (#338); dev is password-gated until then, and
 * production waits for both (epic #331's order). The development strip's
 * English is the spec's own wording (website spec §3 item 1).
 */
import type { Locale, Page } from './i18n';

export interface Copy {
  /** The language's own name, shown on the switcher that leads to it. */
  languageName: string;
  devStrip: string;
  comingSoon: string;
  titles: Record<Page, string>;
  launchListSoon: string;
  roadmapSoon: string;
  privacySoon: string;
  notFoundTitle: string;
  notFoundBody: string;
  homeLink: string;
}

export const COPY: Record<Locale, Copy> = {
  en: {
    languageName: 'English',
    devStrip:
      'In development: what you see may change, and the released game could be completely different.',
    comingSoon: 'Coming soon',
    titles: { home: 'Yawelo Idle', roadmap: 'Roadmap', privacy: 'Privacy' },
    launchListSoon: 'The launch list opens soon.',
    roadmapSoon: 'The live roadmap is being built.',
    privacySoon:
      'The privacy notice will be published here before the launch list opens.',
    notFoundTitle: 'Page not found',
    notFoundBody: 'There is no page at this address.',
    homeLink: 'Back to the home page',
  },
  id: {
    languageName: 'Bahasa Indonesia',
    devStrip:
      'Dalam pengembangan: yang Anda lihat bisa berubah, dan game yang dirilis bisa sangat berbeda.',
    comingSoon: 'Segera hadir',
    titles: { home: 'Yawelo Idle', roadmap: 'Peta jalan', privacy: 'Privasi' },
    launchListSoon: 'Daftar peluncuran segera dibuka.',
    roadmapSoon: 'Peta jalan langsung sedang dibangun.',
    privacySoon:
      'Pemberitahuan privasi akan diterbitkan di sini sebelum daftar peluncuran dibuka.',
    notFoundTitle: 'Halaman tidak ditemukan',
    notFoundBody: 'Tidak ada halaman di alamat ini.',
    homeLink: 'Kembali ke beranda',
  },
};
