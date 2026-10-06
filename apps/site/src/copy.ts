/**
 * The scaffold's words, in both languages. The English the operator approved
 * (#334) is read from `COPY_EN`, its one home; the rest are placeholders
 * until the home page is built from that copy (#335), and the Indonesian
 * until it is translated with its D18 evidence (#338). Dev is
 * password-gated until then, and production waits for both (epic #331).
 */
import { COPY_EN } from './copy-en';
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
    devStrip: COPY_EN.devStrip.text,
    comingSoon: COPY_EN.hero.badge.text,
    titles: {
      home: 'Yawelo Idle',
      roadmap: COPY_EN.roadmap.title.text,
      privacy: COPY_EN.privacy.title.text,
    },
    launchListSoon: 'The launch list opens soon.',
    roadmapSoon: 'The live roadmap is being built.',
    privacySoon:
      'The privacy notice will be published here before the launch list opens.',
    notFoundTitle: COPY_EN.notFound.title.text,
    notFoundBody: COPY_EN.notFound.body.text,
    homeLink: COPY_EN.notFound.home.text,
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
