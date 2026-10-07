/**
 * The site's English words, every line with its sources (#334). The home
 * page sections follow the website spec §3 in order, for the first
 * production release (W13): the demo (#336) and the voyage (#337) get their
 * words in their own stories.
 *
 * Approved by the operator section by section on 2026-10-06, 16:55 to 16:57
 * UTC, before translation (#338) or building (#335): tagline A of three.
 * Section 10 names no platform, only the browser (operator, 17:02 UTC, W9
 * amended). A change to any line is approved again before it ships.
 */
import { line, t } from './copy-line';
import { digits, duration, rankList, rankName, words } from './figures';

export const COPY_EN = {
  devStrip: line(
    'In development: what you see may change, and the released game could be completely different.',
    'site §1',
    'W4',
  ),

  hero: {
    badge: line('Coming soon', 'site §3'),
    tagline: line('An idle adventure through a real language.', 'parent §1'),
    summary: line(
      'Yawelo Idle is an idle game about travelling through a real language and the places where it is spoken. Play it purely as an idle game, or answer reviews along the way and go faster.',
      'parent §1',
      'D1',
    ),
    joinList: line('Join the launch list', 'W1', 'site §3'),
    save: line('Save Yawelo Idle', 'site §6.2'),
  },

  journeys: {
    heading: line('Choose your journey', 'site §3'),
    learnIndonesian: {
      label: line('Learn Indonesian', 'site §3'),
      body: line(
        'For English speakers: travel through Jawa, Bali and Sumatra, from Jakarta to Danau Toba.',
        'parent §1',
        'parent §4.5',
      ),
    },
    learnEnglish: {
      label: line('Learn English', 'site §3'),
      body: line(
        'For Indonesian speakers: travel through England, the USA and Australia, from London to Perth.',
        'parent §1',
        'parent §4.5',
      ),
    },
    both: line('Both journeys are in the game from launch.', 'D3'),
  },

  trailer: {
    heading: line('See it in motion', 'site §3'),
    notice: line(
      'Designed scenes, not gameplay: the released game may be completely different.',
      'W14',
      'site §3',
    ),
    captions: [
      line('Night falls over the islands.', 'site §4'),
      line('Your ship sets sail for the next destination.', 'parent §4.4'),
      line(
        t`Every word you pick up is a card that climbs from ${rankName('RANKS.0')} to ${rankName('RANKS.-1')}.`,
        'parent §3.3',
        'parent §3.4',
      ),
      line(
        'Remember a word when it is due, and Insight arrives.',
        'parent §3.1',
      ),
      line('Yawelo Idle. Coming soon.', 'site §3'),
    ],
  },

  howItPlays: {
    heading: line('How it plays', 'site §3'),
    encounters: {
      title: line('Encounters', 'parent §3.2'),
      body: line(
        'Everyday moments where you hear the language, like a chat at a warung or a ride in an angkot. Each one earns Understanding every second, and keeps earning while you are away, up to a limit.',
        'parent §3.2',
        'parent §3.1',
        'DN19',
      ),
    },
    words: {
      title: line('Word cards', 'parent §3.3'),
      body: line(
        'Spend Understanding to pick up real words and phrases as collectible cards. Each card boosts every Encounter that shares its theme, so your first words keep paying all the way to the end.',
        'parent §3.3',
      ),
    },
    ranks: line(
      t`Every card climbs ${words('RANKS.length', { '5': 'five' })} ranks: ${rankList('RANKS')}.`,
      'parent §3.3',
      'parent §3.4',
    ),
    reviews: {
      title: line('Reviews that respect your time', 'parent §3.4'),
      body: line(
        t`When a word is due, answer one quick question about it. Remember it and you earn Insight, and the word comes back later, spaced out the way memory works. A wrong answer costs nothing: the word drops one rank and is simply rescheduled. You never see more than ${digits('BALANCE.memory.queueSize')} reviews at once, and never a backlog.`,
        'parent §3.4',
        'parent §3.1',
        'DN16',
        'DN23',
      ),
    },
    optional: line(
      t`Reviews are optional. A word you never review keeps at least ${words('BALANCE.words.floorShare', { '0.8': 'four fifths' })} of its bonus, so a pure idler can still reach the end. Learners just get there faster.`,
      'D1',
      'parent §3.3',
      'parent §1',
    ),
    currencies: line(
      'Three currencies to start: Understanding from Encounters, Insight from remembering words, and Passport Stamps from setting sail.',
      'parent §3.1',
      'DN8',
    ),
    journeys: {
      title: line('Journeys and culture cards', 'parent §4.2'),
      body: line(
        t`Send out Journeys that last from ${duration('BALANCE.journeys.durationsMs.0')} to ${words('BALANCE.journeys.durationsMs.-1', { '86400000': 'a day' })}. Each one brings back a culture card (a festival, a food, a custom, a place or a motif) with new words to pick up and a bonus that lasts.`,
        'parent §4.2',
      ),
    },
    festivals: line(
      'Real festivals such as Lebaran, Nyepi and Bonfire Night give a bonus while they are on, and their cards can be found all year.',
      'parent §4.2',
      'DN15',
    ),
    grammar: {
      title: line('The grammar tree', 'parent §4.3'),
      body: line(
        'Unlock Indonesian affixes or English endings with Insight. Each one boosts every word it attaches to and teaches the words it builds: ajar grows into belajar, mengajar, pelajar and pelajaran.',
        'parent §4.3',
        'parent §1',
      ),
    },
    setSail: {
      title: line('Set Sail', 'parent §4.4'),
      body: line(
        'Meet a destination’s goal and set sail for the next one. Encounters and Understanding start again, but your words, their ranks, your culture cards, grammar, stamps and upgrades stay for good, and you see exactly what you keep before you go.',
        'parent §4.4',
        'DN3',
      ),
    },
    guide: line(
      t`From the ${words('BALANCE.automation.opensAtRegion', { '2': 'second' })} region, a guide called Pemandu buys Encounters for you, so idling really works.`,
      'parent §4.6',
      'parent §3.2',
      'DN10',
    ),
  },

  adventure: {
    heading: line('A year of adventure', 'site §3'),
    intro: line(
      'Yawelo Idle is designed for about a year of play, in four layers, and nothing you learn is ever reset.',
      'site §3',
      '#328',
      'DN3',
    ),
    setSail: line(
      'Set Sail: travel destination by destination, earning Passport Stamps.',
      'parent §4.4',
      'parent §3.1',
    ),
    homecoming: line(
      'Homecoming: reach the Mudik finale, come home with souvenirs, and spend them on a tree with four branches: Trade, Travel, Scholar and Culture.',
      'site §3',
      '#328',
      'parent §4.7',
    ),
    later: line(
      'Generations and Tour Guide: two more layers, arriving as free updates before anyone could reach them.',
      'site §3',
      '#328',
      'D2',
    ),
    story: line(
      'A family story grows with every homecoming, and your story book lets you rewatch every chapter you have unlocked.',
      'site §3',
      '#328',
    ),
    lottery: line(
      'Spend Insight on a lottery of cosmetics, collectibles and small boosts. The odds are always shown, and it can never be bought with money.',
      'site §3',
      '#328',
    ),
    shards: line(
      'Duplicates and big moments drop shards of items you do not own yet, so nothing is wasted.',
      'site §3',
      '#328',
    ),
    dailyGift: line(
      'A small gift on each day you play, counted in total days, never as a streak: missing a day costs you nothing.',
      'site §3',
      '#328',
      'DN16',
    ),
    varieties: line(
      'Choose British, American or Australian English, or standard Indonesian with colloquial Jakartan alongside, from day one. Local dialects unlock as you go.',
      'site §3',
      '#328',
    ),
  },

  fair: {
    heading: line('Fair by design', 'site §3'),
    noAds: line('No ads, ever.', 'DN14'),
    nothingSold: line('Nothing for sale that speeds you up.', 'DN12', 'D2'),
    learningKept: line('Learning is never reset.', 'DN3'),
    noEnergy: line('No energy bars or stamina.', 'DN11'),
    noPunishment: line('No punishment for missed days.', 'DN16'),
    noExpiry: line('No expiring content and no battle passes.', 'DN13'),
    noLogin: line('No account or login.', 'D6'),
    saves: line(
      'Saves kept in layers on your device, and synced between your devices by pairing them.',
      'DN18',
      'D6',
    ),
    leaderboards: line(
      'Fair leaderboards: the server checks every score, cheats are hidden from public boards, and nobody’s personal information is shown.',
      'parent §10',
      'D11',
    ),
  },

  browser: {
    heading: line('Play in your browser', 'W9', 'site §3'),
    body: line(
      'Yawelo Idle will be free to play in your browser, with an optional supporter pack that is cosmetic only, never progress.',
      'W9',
      'D2',
      'D16',
    ),
  },

  roadmapTeaser: {
    heading: line('Watch it being built', 'site §3'),
    body: line(
      'The development board is public and live. See how far along the game is, and when it should be ready.',
      'W5',
      'site §5',
    ),
    complete: line('complete', 'site §3'),
    eta: line('Estimated ready', 'site §3'),
    link: line('Open the roadmap', 'site §3'),
  },

  openSource: {
    heading: line('Open source', 'site §3'),
    body: line(
      'The code is public under Apache-2.0. Original writing and art are licensed CC BY-NC-SA 4.0, and content adapted from open sources CC BY-SA 4.0. The Yawelo Idle name and logo are reserved trademarks.',
      'D17',
      'file:TRADEMARKS.md',
    ),
    link: line('Read the code on GitHub', 'D17', 'site §3'),
  },

  getReady: {
    heading: line('Get ready for launch', 'site §3'),
    body: line(
      'Join the launch list, save the site, or follow along as it is built.',
      'site §1',
    ),
    form: {
      email: line('Email address', 'site §6.1'),
      language: line('Language for emails', 'site §6.1'),
      course: line('Which journey interests you? (optional)', 'site §6.1'),
      consent: line(
        'Send me one email when Yawelo Idle launches, and at most one milestone update a month.',
        'W7',
        'site §6.1',
      ),
      age: line('I am 13 or older', 'site §6.1'),
      submit: line('Join the launch list', 'W1', 'site §6.1'),
      sent: line(
        'Nearly there: check your inbox and confirm your address.',
        'site §6.1',
      ),
      privacy: line('How we handle your email', 'site §6.3'),
    },
    follow: line('Follow development on GitHub', 'D17', 'site §3'),
    footer: line(
      'Yawelo Idle is a Shyden Labs project. The name and logo are trademarks of Shyden Labs.',
      'file:TRADEMARKS.md',
    ),
  },

  saveButton: {
    keysWindows: line('Press Ctrl+D to bookmark this page.', 'site §6.2'),
    keysMac: line('Press ⌘D to bookmark this page.', 'site §6.2'),
    apple: line(
      'On iPhone or iPad: tap Share, then Add to Home Screen.',
      'site §6.2',
    ),
  },

  roadmap: {
    title: line('Roadmap', 'site §5'),
    intro: line(
      'This is the game’s development board, live. It updates by itself as work moves, with no need to reload.',
      'W5',
      'site §5',
    ),
    byTickets: line('By stories', 'site §5'),
    byEffort: line('By effort', 'site §5'),
    todo: line('To do', 'site §5'),
    inProgress: line('In progress', 'site §5'),
    done: line('Done', 'site §5'),
    live: line('Live', 'site §5'),
    reconnecting: line('Reconnecting…', 'site §5'),
  },

  privacy: {
    title: line('Privacy', 'site §6.3'),
    collected: line('What we collect', 'site §6.3'),
    basis: line('Why we may hold it', 'site §6.3'),
    withdraw: line('How to withdraw your consent', 'site §6.3'),
    logging: line('What our servers log', 'site §6.3'),
    cookies: line('Cookies and analytics', 'site §6.3'),
    noCookies: line(
      'This site sets no cookies. We count visits with Cloudflare Web Analytics, which stores nothing on your device and does not fingerprint you.',
      'W17',
      'site §3',
      'site §6.3',
    ),
  },

  play: {
    title: line('Not ready yet', 'site §7.2'),
    body: line(
      'Yawelo Idle will be playable here at launch. Until then, watch the roadmap or join the launch list.',
      'site §7.2',
      'D16',
    ),
  },

  notFound: {
    title: line('Page not found', 'site §3'),
    body: line('There is no page at this address.', 'site §3'),
    home: line('Back to the home page', 'site §3'),
  },
};
