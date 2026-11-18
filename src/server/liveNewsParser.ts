import { generateSlug, sanitizeEditorialHtml } from '../lib/editorialRules';
import { formatHistoricalArticleDate } from '../lib/dateIst';

export type FeedSource =
  | 'google-news'
  | 'gnews'
  | 'bbc'
  | 'aljazeera'
  | 'hindustan-times'
  | 'the-hindu'
  | 'guardian'
  | 'livemint'
  | 'npr'
  | 'axios'
  | 'news-wire';

export interface ClusterHeadline {
  title: string;
  source: string;
}

export interface ParsedRssItem {
  guid: string;
  title: string;
  sourceName: string;
  link: string;
  pubDateIso: string;
  descriptionText: string;
  clusterHeadlines: ClusterHeadline[];
  imageUrl: string | null;
  feedCategory: string;
  feedSource: FeedSource;
  defaultCategorySlug: string;
}

export interface GNewsArticlePayload {
  title?: string;
  description?: string;
  content?: string;
  url?: string;
  image?: string | null;
  publishedAt?: string;
  source?: { name?: string; url?: string };
}

export interface SynthesizedDispatch {
  sourceGuid: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  subheadline: string;
  slug: string;
  summary: string;
  contentHtml: string;
  featuredImageUrl: string | null;
  imageCaption: string;
  imageCredit: string;
  categorySlug: string;
  authorSlug: string;
  tags: string[];
  isBreaking: boolean;
  publishedAtIso: string;
  topicSignature: string;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have',
  'had', 'will', 'would', 'could', 'should', 'may', 'might', 'over', 'after', 'ahead',
  'amid', 'into', 'than', 'that', 'this', 'these', 'those', 'says', 'said', 'say',
  'new', 'more', 'most', 'first', 'report', 'reports', 'live', 'updates', 'update',
  'news', 'watch', 'explained', 'today', 'india', 'world',
]);

const GENERIC_STUB_TITLES = new Set([
  'news analysis',
  'editorial',
  'morning brief',
  'evening brief',
  'top news',
  'daily brief',
  'latest news',
  'breaking news',
  'world news',
  'live updates',
]);

const DEFAULT_SOURCE_NAMES: Record<FeedSource, string> = {
  'google-news': 'Google News Wire',
  gnews: 'GNews Global Wire',
  bbc: 'BBC News',
  aljazeera: 'Al Jazeera',
  'hindustan-times': 'Hindustan Times',
  'the-hindu': 'The Hindu',
  guardian: 'The Guardian',
  livemint: 'Livemint',
  npr: 'NPR',
  axios: 'Axios',
  'news-wire': 'International Wire',
};

export function decodeXmlEntities(input: string): string {
  if (!input) return '';
  let text = input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—');

  text = text.replace(/&#(\d+);/g, (_m, dec) => {
    const code = Number.parseInt(dec, 10);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
  });
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
  });
  return text;
}

export function stripHtmlTags(input: string): string {
  return decodeXmlEntities(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractTag(block: string, tagName: string): string {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = re.exec(block);
  return match ? match[1].trim() : '';
}

function extractAtomLink(block: string): string {
  const linkMatch =
    /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(block) ||
    /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(block);
  if (linkMatch?.[1]) return decodeXmlEntities(linkMatch[1]).trim();
  return stripHtmlTags(extractTag(block, 'link'));
}

function extractImageFromItem(block: string, rawDescription: string): string | null {
  const mediaMatch =
    /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i.exec(block) ||
    /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/i.exec(block) ||
    /<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["'][^>]*>/i.exec(block) ||
    /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["'][^>]*>/i.exec(block);

  if (mediaMatch?.[1]) {
    const url = decodeXmlEntities(mediaMatch[1]).trim();
    if (/^https:\/\/[a-z0-9.-]+/i.test(url)) return url;
  }

  const decodedDesc = decodeXmlEntities(rawDescription);
  const imgMatch = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec(decodedDesc);
  if (imgMatch?.[1]) {
    const url = imgMatch[1].trim();
    if (/^https:\/\/[a-z0-9.-]+/i.test(url) && !/pixel|tracker|spacer|1x1/i.test(url)) {
      return url;
    }
  }
  return null;
}

function parseGoogleClusterHeadlines(rawDescription: string): ClusterHeadline[] {
  const decoded = decodeXmlEntities(rawDescription);
  const items: ClusterHeadline[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = liRegex.exec(decoded)) !== null) {
    const inner = match[1];
    const linkMatch = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(inner);
    const fontMatch = /<font[^>]*>([\s\S]*?)<\/font>/i.exec(inner);
    const headline = stripHtmlTags(linkMatch ? linkMatch[1] : inner);
    const source = stripHtmlTags(fontMatch ? fontMatch[1] : '');
    if (headline && headline.length >= 16) {
      items.push({ title: headline, source: source || 'Wire Dispatch' });
    }
  }
  return items;
}

function cleanWireTitlePrefixSuffix(rawTitle: string): string {
  return rawTitle
    .replace(/^(?:LIVE(?:\s+UPDATES?)?|WATCH|BREAKING|EXCLUSIVE|EXPLAINED|OPINION)\s*[:|\-–—]\s*/i, '')
    .replace(/^(?:World|India|Business|Sports|Tech)?\s*News\s+Live\s+Updates?\s*[:|\-–—]\s*/i, '')
    .replace(/^(?:HT|Mint|ET|TOI)\s+(?:Evening|Morning|Afternoon|Daily)\s+News\s+Brief(?:\s+[A-Za-z]+\s+\d+(?:,?\s*\d{4})?)?\s*[:\-–—]\s*/i, '')
    .replace(/\s+(?:in|on|across)\s+(?:World|India|Business|Sports)?\s*News\s+Live\s+Updates?\b/gi, '')
    .replace(/\s*[:|\-–—]\s*(?:What you need to know|All you need to know|Here'?s what we know|Read more|Full story|Live updates)\s*$/i, '')
    .replace(/\s*\|\s*[^|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHeadlineAndSource(
  rawTitle: string,
  explicitSource: string,
  feedSource: FeedSource
): {
  title: string;
  sourceName: string;
} {
  const decodedTitle = stripHtmlTags(rawTitle);
  if (feedSource === 'google-news' || feedSource === 'gnews') {
    const idx = decodedTitle.lastIndexOf(' - ');
    if (idx > 16) {
      const candidateTitle = cleanWireTitlePrefixSuffix(decodedTitle.slice(0, idx).trim());
      const candidateSource = decodedTitle.slice(idx + 3).trim();
      return {
        title: candidateTitle,
        sourceName: explicitSource || candidateSource || DEFAULT_SOURCE_NAMES[feedSource],
      };
    }
  }
  return {
    title: cleanWireTitlePrefixSuffix(decodedTitle),
    sourceName: explicitSource || DEFAULT_SOURCE_NAMES[feedSource],
  };
}

function cleanSourceDescription(rawDesc: string): string {
  return stripHtmlTags(
    decodeXmlEntities(rawDesc)
      .replace(/<div[^>]*>\s*(?:Data|Chart|Source|Photo):[\s\S]*?<\/div>/gi, ' ')
      .replace(/<strong>\s*(?:Why it matters|The big picture|What's next|Go deeper|Catch up quick)\s*:\s*<\/strong>/gi, ' ')
  )
    .replace(/^(?:NEW DELHI|MUMBAI|BENGALURU|CHENNAI|KOLKATA|HYDERABAD|WASHINGTON|LONDON|BRUSSELS|BEIJING)\s*\([^)]+\)\s*[:\-–—]\s*/i, '')
    .replace(/^(?:PTI|ANI|IANS|REUTERS|AP|AFP)\s*[:\-–—]\s*/i, '')
    .replace(/\s*(?:Continue reading|Read more|Click here to read).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function smartLowerFirst(text: string): string {
  if (!text) return '';
  if (text.length < 2) return text.toLowerCase();
  // Keep acronyms & compound uppercase prefixes intact (e.g. US-China, UK, RBI, ISRO, NATIONAL)
  if (/[A-Z]/.test(text[0]) && /[A-Z]/.test(text[1])) return text;
  const firstWord = text.split(/[\s,.;:!?()—–-]+/)[0] || '';
  const lowercaseableStarters = new Set([
    'The', 'A', 'An', 'In', 'On', 'At', 'As', 'After', 'Before', 'Amid', 'While', 'During',
    'Following', 'Fresh', 'New', 'Latest', 'Recent', 'Officials', 'Authorities', 'Analysts',
    'Observers', 'Researchers', 'Lawmakers', 'Ministers', 'Critics', 'Supporters', 'Investors',
    'Markets', 'Market', 'Shares', 'Stocks', 'Prices', 'Conditions', 'Little', 'More', 'Many',
    'Several', 'Multiple', 'Growing', 'Rising', 'Heavy', 'Strong', 'Major', 'Senior',
    'Reporting', 'Accounts', 'Data', 'Figures', 'Details', 'Talks', 'Discussions',
  ]);
  if (lowercaseableStarters.has(firstWord)) {
    return text[0].toLowerCase() + text.slice(1);
  }
  return text;
}

export function repairBrokenCasing(text: string): string {
  if (!text) return '';
  return text
    .replace(/\bFresh York\b/g, 'New York')
    .replace(/\bFresh Delhi\b/g, 'New Delhi')
    .replace(/\bFresh Zealand\b/g, 'New Zealand')
    .replace(/\bStatus Account\b/g, 'Status Report')
    .replace(/\bEstablished Dead\b/g, 'Found Dead')
    .replace(/\bSyndicate-Rape\b/gi, 'Gang-Rape')
    .replace(/\buS-/g, 'US-')
    .replace(/\buS\b/g, 'US')
    .replace(/\baSEAN\b/g, 'ASEAN')
    .replace(/\bkU\b/g, 'KU')
    .replace(/\bopenAI\b/g, 'OpenAI')
    .replace(/\biSRO\b/g, 'ISRO')
    .replace(/\brBI\b/g, 'RBI')
    .replace(/\biMD\b/g, 'IMD')
    .replace(/\beU\b/g, 'EU')
    .replace(/\buK\b/g, 'UK')
    .replace(/\buN\b/g, 'UN')
    .replace(/\bnATIONAL DESK\b/g, 'NATIONAL DESK')
    .replace(/\biNTERNATIONAL DESK\b/g, 'INTERNATIONAL DESK')
    .replace(/\bbENGALURU\b/g, 'BENGALURU')
    .replace(/\bkeralam\b/g, 'Keralam')
    .replace(/\bputhur\b/g, 'Puthur')
    .replace(/\bindia\b/g, 'India')
    .replace(/^([a-z])/, (_m, ch: string) => ch.toUpperCase());
}

export function truncateAtWordBoundary(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen - 1);
  const lastPeriod = slice.lastIndexOf('. ');
  if (lastPeriod >= Math.floor(maxLen * 0.55)) {
    return slice.slice(0, lastPeriod + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 24 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-]+$/, '').trim()}…`;
}

function polishPunctuation(text: string): string {
  return repairBrokenCasing(text)
    .replace(/\b([Aa])\s+account\b/g, (_m, art: string) => (art === 'A' ? 'An account' : 'an account'))
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([?!])\s*,\s*/g, '$1 ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPredominantlyEnglish(text: string): boolean {
  const cleaned = stripHtmlTags(text);
  if (!cleaned) return false;
  const letters = cleaned.match(/\p{L}/gu) || [];
  if (letters.length === 0) return false;
  const asciiLetters = cleaned.match(/[A-Za-z]/g) || [];
  return asciiLetters.length / letters.length >= 0.75;
}

function matchCase(sourceWord: string, replacement: string): string {
  if (!sourceWord) return replacement;
  if (sourceWord === sourceWord.toUpperCase() && /[A-Z]/.test(sourceWord) && sourceWord.length > 1) {
    return replacement.toUpperCase();
  }
  if (sourceWord[0] === sourceWord[0].toUpperCase() && sourceWord[0] !== sourceWord[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyLexicalRules(input: string, rules: ReadonlyArray<readonly [RegExp, string]>): string {
  let out = input;
  for (const [pattern, replacement] of rules) {
    out = out.replace(pattern, (matched) => matchCase(matched, replacement));
  }
  return polishPunctuation(out);
}

const HEADLINE_PHRASE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bfound guilty\b/gi, 'convicted'],
  [/\bpartly collapses\b/gi, 'suffers partial collapse'],
  [/\bpartially collapses\b/gi, 'sustains partial collapse'],
  [/\bearly trade\b/gi, 'opening market session'],
  [/\bno proof\b/gi, 'no evidence'],
  [/\blaid to rest\b/gi, 'given final farewell'],
  [/\bin a bid to\b/gi, 'aiming to'],
  [/\bon high alert\b/gi, 'under heightened alert'],
  [/\bhigh alert\b/gi, 'elevated alert'],
  [/\bfocus on\b/gi, 'prioritise'],
  [/\bcalls for\b/gi, 'presses for'],
  [/\bcall for\b/gi, 'demand for'],
  [/\bregistered against\b/gi, 'filed against'],
  [/\bset to begin\b/gi, 'slated to open'],
  [/\bto begin on\b/gi, 'scheduled to open on'],
  [/\bto begin\b/gi, 'slated to open'],
  [/\bturns violent\b/gi, 'escalates into violence'],
  [/\bagrees to hear\b/gi, 'takes up'],
  [/\bissues guidelines\b/gi, 'releases guidelines'],
  [/\bset to\b/gi, 'poised to'],
  [/\blikely to\b/gi, 'expected to'],
  [/\bstrikes down\b/gi, 'invalidates'],
  [/\bgreenlights\b/gi, 'approves'],
  [/\bdisguised as\b/gi, 'passed off as'],
  [/\broars back to life\b/gi, 'stages sharp comeback'],
  [/\brefuse to give up\b/gi, 'hold firm in standoff'],
  [/\bannounce plans for\b/gi, 'outline proposal for'],
  [/\bsuspends sentence\b/gi, 'stays sentence'],
  [/\bgrants bail to\b/gi, 'approves bail for'],
  [/\bremains nil\b/gi, 'stays zero'],
  [/\bremains unfulfilled\b/gi, 'stays unmet'],
  [/\btake effect\b/gi, 'come into force'],
  [/\bfaced difficulty accessing\b/gi, 'encountered disruptions reaching'],
  [/\breporting difficulty accessing\b/gi, 'facing disruptions reaching'],
  [/\bput ([^,;]+?) at risk\b/gi, 'leave $1 exposed'],
  [/\bat risk\b/gi, 'under strain'],
  [/\bahead of\b/gi, 'before'],
  [/\bamid\b/gi, 'as'],
  [/\bfree from\b/gi, 'rid of'],
  [/\bfix accountability for\b/gi, 'establish accountability over'],
  [/\bfix accountability\b/gi, 'establish accountability'],
  [/\billegal construction\b/gi, 'unauthorised construction'],
  [/\binaction on\b/gi, 'failure to act on'],
];

const HEADLINE_WORD_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\brises\b/gi, 'advances'],
  [/\bfalls\b/gi, 'eases'],
  [/\bdrops\b/gi, 'slips'],
  [/\bsurges\b/gi, 'climbs'],
  [/\bhiked\b/gi, 'raised'],
  [/\bhikes\b/gi, 'raises'],
  [/\bslashed\b/gi, 'reduced'],
  [/\bwarns\b/gi, 'cautions'],
  [/\bhails\b/gi, 'welcomes'],
  [/\bslams\b/gi, 'criticises'],
  [/\bvows\b/gi, 'pledges'],
  [/\bprobes\b/gi, 'investigates'],
  [/\bseeks\b/gi, 'pursues'],
  [/\boffers\b/gi, 'extends'],
  [/\barrest\b/gi, 'detain'],
  [/\barrested\b/gi, 'detained'],
  [/\bseized\b/gi, 'confiscated'],
  [/\bshifted\b/gi, 'relocated'],
  [/\bobliges\b/gi, 'triumphs'],
  [/\bawait\b/gi, 'prepare for'],
  [/\bholds\b/gi, 'convenes'],
  [/\bplans\b/gi, 'proposals'],
  [/\btalks\b/gi, 'discussions'],
  [/\bmeeting\b/gi, 'session'],
  [/\bworkers\b/gi, 'members'],
  [/\bstates\b/gi, 'nations'],
  [/\blargest\b/gi, 'major'],
  [/\bsmall businesses\b/gi, 'small enterprises'],
  [/\burban services\b/gi, 'civic services'],
  [/\blocal bodies\b/gi, 'local councils'],
  [/\bkey\b/gi, 'central'],
  [/\bissue\b/gi, 'matter'],
  [/\bcurbs\b/gi, 'restrictions'],
  [/\bunprecedented\b/gi, 'major'],
  [/\battack\b/gi, 'strike'],
  [/\bexport duty\b/gi, 'export levy'],
  [/\bdirects\b/gi, 'orders'],
  [/\burges\b/gi, 'presses'],
  [/\bannounces\b/gi, 'unveils'],
  [/\bannounced\b/gi, 'unveiled'],
  [/\blaunches\b/gi, 'rolls out'],
  [/\blaunched\b/gi, 'rolled out'],
  [/\bapproves\b/gi, 'clears'],
  [/\bapproved\b/gi, 'cleared'],
  [/\brejects\b/gi, 'turns down'],
  [/\brejected\b/gi, 'turned down'],
  [/\bbacks\b/gi, 'endorses'],
  [/\bbacked\b/gi, 'endorsed'],
  [/\bfaces\b/gi, 'confronts'],
  [/\bfaced\b/gi, 'confronted'],
  [/\bboosts\b/gi, 'strengthens'],
  [/\bcuts\b/gi, 'trims'],
  [/\bhalts\b/gi, 'suspends'],
  [/\bhalted\b/gi, 'paused'],
  [/\bsigns\b/gi, 'inks'],
  [/\bsigned\b/gi, 'inked'],
  [/\bflags\b/gi, 'highlights'],
  [/\bcites\b/gi, 'points to'],
  [/\breveals\b/gi, 'discloses'],
  [/\bconfirms\b/gi, 'verifies'],
  [/\bdenies\b/gi, 'disputes'],
  [/\btargets\b/gi, 'focuses on'],
  [/\bopens\b/gi, 'gets under way'],
  [/\bmarks\b/gi, 'signals'],
  [/\bshows\b/gi, 'indicates'],
  [/\btensions\b/gi, 'friction'],
  [/\bconcerns\b/gi, 'pressures'],
  [/\bdedicates\b/gi, 'tributes'],
  [/\badjourns\b/gi, 'defers'],
  [/\bjoins\b/gi, 'meets with'],
  [/\brace\b/gi, 'contest'],
  [/\bgets\b/gi, 'receives'],
  [/\bwants\b/gi, 'seeks'],
  [/\bwins\b/gi, 'secures'],
  [/\bloses\b/gi, 'yields'],
  [/\bneeds\b/gi, 'requires'],
  [/\bkeeps\b/gi, 'maintains'],
  [/\btells\b/gi, 'informs'],
  [/\basks\b/gi, 'requests'],
  [/\bbrings\b/gi, 'introduces'],
  [/\bstarts\b/gi, 'begins'],
  [/\bends\b/gi, 'concludes'],
  [/\bhits\b/gi, 'strikes'],
  [/\btops\b/gi, 'exceeds'],
];

const PROSE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bin early trade\b/gi, 'during opening market hours'],
  [/\bacross opening market session\b/gi, 'during opening market hours'],
  [/\baccording to\b/gi, 'as noted by'],
  [/\bamid growing\b/gi, 'against a backdrop of rising'],
  [/\bin a bid to\b/gi, 'in an effort to'],
  [/\bfound guilty\b/gi, 'convicted'],
  [/\bset to\b/gi, 'positioned to'],
  [/\blikely to\b/gi, 'expected to'],
  [/\bsays\b/gi, 'noted'],
  [/\bsaid\b/gi, 'stated'],
  [/\btold\b/gi, 'informed'],
  [/\bshowed\b/gi, 'demonstrated'],
  [/\bshows\b/gi, 'indicates'],
  [/\bbecame\b/gi, 'emerged as'],
  [/\bnearly\b/gi, 'close to'],
  [/\bseveral\b/gi, 'a number of'],
  [/\bnew\b(?=\s+[a-z])/g, 'fresh'],
  [/\burgent appeal\b/gi, 'pressing request'],
  [/\burgent\b/gi, 'pressing'],
  [/\burges\b/gi, 'calls on'],
  [/\burged\b/gi, 'pressed'],
  [/\bcontinue to\b/gi, 'keep'],
  [/\bcontinues to\b/gi, 'keeps'],
  [/\blittle has improved\b/gi, 'conditions have barely changed'],
  [/\bwarned\b/gi, 'cautioned'],
  [/\bwarns\b/gi, 'cautions'],
  [/\bvowed\b/gi, 'pledged'],
  [/\bvows\b/gi, 'pledges'],
  [/\bhails\b/gi, 'welcomes'],
  [/\bhailed\b/gi, 'welcomed'],
  [/\bslammed\b/gi, 'criticised'],
  [/\bfor the use of\b/gi, 'to deploy'],
  [/\bcomplement human judgement\b/gi, 'work alongside human oversight'],
  [/\bbillions of\b/gi, 'substantial volumes of'],
  [/\bannounced plans\b/gi, 'outlined proposals'],
  [/\bexpected to face\b/gi, 'projected to encounter'],
  [/\bresearchers say\b/gi, 'analysts observe'],
  [/\bofficials say\b/gi, 'authorities report'],
  [/\bthreaten\b/gi, 'pose risks to'],
  [/\bcreate challenges for\b/gi, 'complicate operations for'],
  [/\brecognised\b/gi, 'affirmed'],
  [/\blaid down obligations\b/gi, 'established duties'],
  [/\bthe real challenge now is\b/gi, 'the central test ahead lies in'],
  [/\bfunction reliably\b/gi, 'operate consistently'],
  [/\bhighlights\b/gi, 'underscores'],
  [/\bgovernment\b/gi, 'administration'],
  [/\bofficials\b/gi, 'authorities'],
  [/\bmedia report\b/gi, 'media account'],
  [/\bofficial report\b/gi, 'official account'],
  [/\breported\b/gi, 'indicated'],
  [/\bmajor\b/gi, 'significant'],
];

function computeWordDifferenceRatio(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++;
  }
  return 1 - shared / Math.max(wordsA.size, wordsB.size);
}

/**
 * Partially rewrites wire headlines so headings are never copied verbatim ("ditto")
 * while keeping every fact, proper noun, figure, and core message identical.
 */
export function paraphraseHeadline(
  rawTitle: string,
  _categorySlug = '',
  options?: { skipGenericWrapper?: boolean }
): string {
  const cleaned = cleanWireTitlePrefixSuffix(stripHtmlTags(rawTitle))
    .replace(/^(?:Dispatch|Global Update|Tech & Science|Sport Update|Markets & Policy)\s*[—–-]\s*/i, '')
    .replace(/,\s*accounts indicate\s*$/i, '')
    .replace(/([?!])\s*,\s*accounts indicate\s*$/i, '$1')
    .replace(/\s+in\s+(?:Key|Central)\s+question\s*$/i, '')
    .replace(/\bacross opening market session\b/gi, 'in opening market session');
  if (!cleaned) return 'Developing News Update';

  let rewritten = applyLexicalRules(cleaned, HEADLINE_PHRASE_RULES);
  rewritten = applyLexicalRules(rewritten, HEADLINE_WORD_RULES);

  // Reframe "Context: Action" headlines cleanly when colon splits topic and event
  const colonIdx = rewritten.indexOf(': ');
  if (colonIdx > 4 && colonIdx < 52) {
    const left = rewritten.slice(0, colonIdx).trim();
    const right = rewritten.slice(colonIdx + 2).trim();
    const leftWords = left.split(/\s+/).length;
    const isMetaLabel = /^(?:key|central)\s+question|watch|explained|analysis|opinion|update$/i.test(left);
    if (!isMetaLabel && leftWords <= 6 && right.length >= 16 && !/^['"“]/.test(right) && !/[?!]$/.test(right)) {
      const rightCap = right[0].toUpperCase() + right.slice(1);
      rewritten = `${rightCap} in ${left.replace(/\bcase\b/gi, 'proceedings').trim()}`;
    }
  }

  // Ensure meaningful lexical/structural difference from source headline without robotic prefix/suffix labels
  const diffRatio = computeWordDifferenceRatio(cleaned, rewritten);
  if (!options?.skipGenericWrapper && (rewritten.toLowerCase() === cleaned.toLowerCase() || diffRatio < 0.08)) {
    const asMatch = /^(.{18,}?)\s+\bas\b\s+(.{14,})$/i.exec(rewritten);
    if (asMatch) {
      const second = asMatch[2].trim();
      const first = asMatch[1].trim();
      rewritten = `${second[0].toUpperCase() + second.slice(1)} while ${smartLowerFirst(first)}`;
    } else if (/\bafter\b/i.test(rewritten)) {
      rewritten = rewritten.replace(/\bafter\b/i, 'following');
    } else if (/\bover\b/i.test(rewritten)) {
      rewritten = rewritten.replace(/\bover\b/i, 'concerning');
    } else if (/\bfor (?![a-z]+ing\b)/i.test(rewritten)) {
      rewritten = rewritten.replace(/\bfor\b/i, 'over');
    } else if (/\bsays\b/i.test(rewritten)) {
      rewritten = rewritten.replace(/\bsays\b/i, 'notes');
    } else if (/\bsaid\b/i.test(rewritten)) {
      rewritten = rewritten.replace(/\bsaid\b/i, 'stated');
    } else if (/[?!]$/.test(rewritten)) {
      rewritten = `Key question: ${smartLowerFirst(rewritten)}`;
    } else {
      const colonParts = /^(.{12,}?),\s+(.{18,})$/.exec(rewritten);
      if (colonParts) {
        rewritten = `${colonParts[2][0].toUpperCase() + colonParts[2].slice(1)} — ${smartLowerFirst(colonParts[1])}`;
      }
    }
  }

  return polishPunctuation(rewritten).slice(0, 210);
}

/**
 * Partially rewrites wire/source prose paragraphs while keeping factual message,
 * attribution, figures, and entities intact.
 */
export function paraphraseProseText(
  rawText: string,
  options?: { skipGenericWrapper?: boolean }
): string {
  const cleaned = cleanSourceDescription(rawText)
    .replace(/^(?:Current reporting indicates that|Available accounts note that)\s+/i, '');
  if (!cleaned) return '';

  let rewritten = applyLexicalRules(cleaned, HEADLINE_PHRASE_RULES);
  rewritten = applyLexicalRules(rewritten, PROSE_RULES);

  if (!options?.skipGenericWrapper && rewritten.toLowerCase() === cleaned.toLowerCase() && rewritten.length > 25) {
    rewritten = rewritten
      .replace(/\bwhile\b/i, 'even as')
      .replace(/\bafter\b/i, 'following')
      .replace(/\bbefore\b/i, 'ahead of')
      .replace(/\bamid\b/i, 'against the backdrop of');
  }

  const polished = polishPunctuation(rewritten);
  return /[.!?]["”']?$/.test(polished) ? polished : `${polished}.`;
}

/**
 * Strips disallowed editorial boilerplate phrases from HTML or plain text.
 */
export function stripDisallowedEditorialBoilerplate(htmlOrText: string): string {
  if (!htmlOrText) return '';
  return htmlOrText
    .replace(/<h[1-6][^>]*>\s*Editorial Verification(?:\s*(?:&amp;|&)\s*Ongoing Monitoring)?\s*<\/h[1-6]>/gi, '')
    .replace(/<p[^>]*>[^<]*THE CONTINENTAL synthesises verified factual threads across independent public sources[^<]*<\/p>/gi, '')
    .replace(/Editorial Verification(?:\s*(?:&amp;|&)\s*Ongoing Monitoring)?/gi, '')
    .replace(/THE CONTINENTAL synthesises verified factual threads across independent public sources and updates published dispatches automatically whenever material new information or official statements emerge\.?/gi, '')
    .replace(/Verified and filed in THE CONTINENTAL'?s [a-z\s-]+ desk\.?/gi, '')
    .replace(/Initial wire dispatches credited to [^.<]+ underscore ongoing administrative and public interest surrounding this issue, prompting follow-up verification across relevant agencies\.?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseRssFeedXml(
  xml: string,
  feedSource: FeedSource,
  defaultCategorySlug: string
): ParsedRssItem[] {
  if (!xml || (!xml.includes('<item') && !xml.includes('<entry'))) return [];

  const results: ParsedRssItem[] = [];
  const itemRegex = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const rawTitle = extractTag(block, 'title');
    const rawLink = extractAtomLink(block);
    const rawGuid = stripHtmlTags(extractTag(block, 'guid') || extractTag(block, 'id')) || rawLink;
    const rawPubDate = stripHtmlTags(
      extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated')
    );
    const rawDesc = extractTag(block, 'content:encoded') || extractTag(block, 'description') || extractTag(block, 'summary');
    const rawCategory = stripHtmlTags(extractTag(block, 'category'));
    const rawSource = stripHtmlTags(extractTag(block, 'source'));

    const { title, sourceName } = cleanHeadlineAndSource(rawTitle, rawSource, feedSource);
    if (!title || title.length < 22 || GENERIC_STUB_TITLES.has(title.toLowerCase())) continue;
    if (!isPredominantlyEnglish(title)) continue;

    const parsedMs = Date.parse(rawPubDate);
    const pubDateIso = Number.isNaN(parsedMs)
      ? new Date().toISOString()
      : new Date(Math.min(parsedMs, Date.now())).toISOString();

    const clusterHeadlines =
      feedSource === 'google-news' || feedSource === 'gnews' ? parseGoogleClusterHeadlines(rawDesc) : [];
    const descriptionText =
      feedSource === 'google-news' && clusterHeadlines.length > 0
        ? clusterHeadlines
            .slice(0, 3)
            .map((c) => `${cleanWireTitlePrefixSuffix(c.title)} (${c.source})`)
            .join('. ')
        : cleanSourceDescription(rawDesc);

    const imageUrl = extractImageFromItem(block, rawDesc);

    results.push({
      guid: `${feedSource}:${rawGuid || generateSlug(title)}`.slice(0, 240),
      title,
      sourceName,
      link: rawLink,
      pubDateIso,
      descriptionText,
      clusterHeadlines,
      imageUrl,
      feedCategory: rawCategory,
      feedSource,
      defaultCategorySlug,
    });
  }

  return results;
}

export function parseGNewsApiArticles(
  articles: GNewsArticlePayload[],
  defaultCategorySlug = 'world'
): ParsedRssItem[] {
  if (!Array.isArray(articles)) return [];
  const results: ParsedRssItem[] = [];
  for (const raw of articles) {
    const rawTitle = stripHtmlTags(raw.title || '');
    if (!rawTitle || rawTitle.length < 22 || GENERIC_STUB_TITLES.has(rawTitle.toLowerCase())) continue;
    const cleanTitle = cleanWireTitlePrefixSuffix(rawTitle);
    if (!isPredominantlyEnglish(cleanTitle)) continue;
    const sourceName = stripHtmlTags(raw.source?.name || '') || 'GNews Global Wire';
    const description = cleanSourceDescription(raw.description || raw.content || '');
    const parsedMs = raw.publishedAt ? Date.parse(raw.publishedAt) : Number.NaN;
    const pubDateIso = Number.isNaN(parsedMs)
      ? new Date().toISOString()
      : new Date(Math.min(parsedMs, Date.now())).toISOString();
    const imageUrl =
      typeof raw.image === 'string' && /^https:\/\/[a-z0-9.-]+/i.test(raw.image.trim())
        ? raw.image.trim()
        : null;

    results.push({
      guid: `gnews:${raw.url || generateSlug(cleanTitle)}`.slice(0, 240),
      title: cleanTitle,
      sourceName,
      link: raw.url || '',
      pubDateIso,
      descriptionText: description,
      clusterHeadlines: [],
      imageUrl,
      feedCategory: '',
      feedSource: 'gnews',
      defaultCategorySlug,
    });
  }
  return results;
}

export function classifyArticleCategory(
  title: string,
  summary: string,
  feedCategory: string,
  defaultCategorySlug: string
): string {
  const hay = `${title} ${summary} ${feedCategory}`.toLowerCase();

  if (/\b(cricket|ipl|test match|odi|t20|badminton|tennis|football|fifa|olympic|bcci|wicket|tournament|grand slam|chess|athlete|coach)\b/.test(hay)) {
    return 'sports';
  }
  if (/\b(cyclone|storm|aqi|pollution|smog|climate|flood|monsoon|emission|glacier|rainfall|imd|wildlife|forest|heatwave|earthquake)\b/.test(hay)) {
    return 'environment';
  }
  if (/\b(isro|nasa|spacecraft|satellite|semiconductor|chip|nvidia|ai\b|artificial intelligence|cyber|quantum|robotics|biotech|deep-space|voyager|pslv)\b/.test(hay)) {
    return 'science-technology';
  }
  if (/\b(rbi|inflation|gdp|rupee|fiscal|bond|tariff|export|import|trade deficit|gst|macroeconom|central bank|monetary)\b/.test(hay)) {
    return 'economy';
  }
  if (/\b(sensex|nifty|stocks|shares|market|ipo|merger|startup|tata|reliance|infosys|bank of|lender|earnings|corporate|aviation|airlines|cag)\b/.test(hay)) {
    return 'business';
  }
  if (/\b(university|universities|school|exam|ugc|neet|jee|campus|student|college|scholarship|education|faculty)\b/.test(hay)) {
    return 'education';
  }
  if (/\b(election|bjp|congress|parliament|lok sabha|rajya sabha|assembly|minister|cabinet|manifesto|opposition|coalition|bill)\b/.test(hay)) {
    return 'politics';
  }
  if (/\b(ukraine|russia|crimea|gaza|israel|iran|lebanon|china|trump|xi|eu|europe|france|rwanda|asean|manila|united nations|nato|pentagon|beijing|washington|kyiv)\b/.test(hay)) {
    return 'world';
  }
  if (/\b(delhi|mumbai|chennai|bengaluru|kerala|tamil nadu|andhra|odisha|karnataka|maharashtra|gujarat|supreme court|high court|modi|railway)\b/.test(hay)) {
    return 'india';
  }

  return defaultCategorySlug || 'india';
}

export function computeTopicTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(tokens);
}

export function computeTopicSignature(title: string): string {
  return [...computeTopicTokens(title)].sort().slice(0, 10).join('|');
}

export function computeTitleSimilarity(a: string, b: string): number {
  const setA = computeTopicTokens(a);
  const setB = computeTopicTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isBreakingCandidate(title: string, summary: string): boolean {
  const hay = `${title} ${summary}`.toLowerCase();
  return /\b(cyclone|landfall|evacuat|sanctions|ceasefire|collapse|summit|supreme court|rbi|breaking|alert|emergency|quake|strike|verdict|record|tariff)\b/.test(
    hay
  );
}

export function pickVerifiedFallbackImage(categorySlug: string, title: string, summary: string): string | null {
  const hay = `${title} ${summary}`.toLowerCase();
  if (/\b(cyclone|storm|flood|odisha|andhra|coastal)\b/.test(hay)) return '/assets/news/bay-of-bengal-cyclone.jpg';
  if (/\b(aqi|smog|air quality|pollution|winter fog)\b/.test(hay)) return '/assets/news/delhi-winter-smog.jpg';
  if (/\b(cricket|test|wicket|bcci|kohli|rohit|bumrah)\b/.test(hay)) return '/assets/news/india-nz-cricket.jpg';
  if (/\b(badminton|shuttle|lakshya|sindhu)\b/.test(hay)) return '/assets/news/lakshya-sen-badminton.jpg';
  if (/\b(asean|modi|manila|east asia|indo-pacific)\b/.test(hay)) return '/assets/news/pm-modi-asean.jpg';
  if (/\b(ukraine|zelensky|kyiv|russia|crimea|eu sanctions|brussels)\b/.test(hay)) return '/assets/news/ukraine-eu-diplomacy.jpg';
  if (/\b(gaza|israel|knesset|jerusalem|lebanon|west asia)\b/.test(hay)) return '/assets/news/knesset-jerusalem.jpg';
  if (/\b(carrier|navy|hormuz|red sea|maritime)\b/.test(hay)) return '/assets/news/uss-theodore-roosevelt.jpg';
  if (/\b(supreme court|bench|chief justice|constitutional)\b/.test(hay)) return '/assets/news/supreme-court-india.jpg';
  if (/\b(parliament|lok sabha|rajya sabha|sansad|bill)\b/.test(hay)) return '/assets/news/sansad-bhavan-india.jpg';
  if (/\b(isro|pslv|satellite|rocket|space)\b/.test(hay)) return '/assets/news/isro-pslv-launch.jpg';
  if (/\b(semiconductor|chip|wafer|nvidia|ai processor)\b/.test(hay)) return '/assets/news/semiconductor-wafer.jpg';
  if (/\b(railway|train|express|vande bharat|track)\b/.test(hay)) return '/assets/news/indian-railways-express.jpg';
  if (/\b(sensex|nifty|bse|stock|equity|market|rupee)\b/.test(hay)) return '/assets/news/bse-mumbai.jpg';
  if (/\b(tata|corporate|boardroom)\b/.test(hay)) return '/assets/news/bombay-house-tata.jpg';
  if (/\b(university|campus|student|ugc|academic|school|protest)\b/.test(hay)) return '/assets/news/indian-university-campus.jpg';
  if (/\b(united nations|un\b|diplomacy|treaty|eu|rwanda|france)\b/.test(hay)) return '/assets/news/un-diplomacy-hall.jpg';
  if (categorySlug === 'business' || categorySlug === 'economy') return '/assets/news/mumbai-skyline.jpg';
  return null;
}

function chooseAuthorSlug(categorySlug: string): string {
  switch (categorySlug) {
    case 'world':
      return 'meera-raghavan';
    case 'business':
    case 'economy':
      return 'vikramaditya-sen';
    case 'science-technology':
    case 'environment':
      return 'kavita-subramanian';
    default:
      return 'arjun-deshmukh';
  }
}

function datelineForCategory(categorySlug: string, title: string): string {
  const lower = title.toLowerCase();
  if (/delhi|supreme court|parliament|rbi|modi/.test(lower)) return 'NEW DELHI';
  if (/mumbai|sensex|nifty|maharashtra/.test(lower)) return 'MUMBAI';
  if (/chennai|tamil nadu/.test(lower)) return 'CHENNAI';
  if (/bengaluru|karnataka/.test(lower)) return 'BENGALURU';
  if (/kerala|thiruvananthapuram/.test(lower)) return 'THIRUVANANTHAPURAM';
  if (/manila|asean/.test(lower)) return 'MANILA';
  if (/ukraine|kyiv|brussels|crimea|paris|france|eu\b/.test(lower)) return 'EUROPEAN DESK';
  if (/gaza|israel|lebanon|iran/.test(lower)) return 'WEST ASIA DESK';
  if (/washington|trump|us\b|nvidia/.test(lower)) return 'WASHINGTON';
  if (categorySlug === 'world') return 'INTERNATIONAL DESK';
  return 'NATIONAL DESK';
}

/**
 * Rewrites multi-source wire headlines and summaries into original broadsheet prose
 * in THE CONTINENTAL's voice — never copying headlines or copy verbatim and never
 * injecting static monitoring/verification boilerplate.
 */
export function synthesizeEditorialDispatch(item: ParsedRssItem): SynthesizedDispatch {
  const categorySlug = classifyArticleCategory(
    item.title,
    item.descriptionText,
    item.feedCategory,
    item.defaultCategorySlug
  );
  const title = paraphraseHeadline(item.title, categorySlug);
  const dateline = datelineForCategory(categorySlug, title);
  const formattedIst = formatHistoricalArticleDate(item.pubDateIso);

  const distinctOutlets = Array.from(
    new Set(
      [item.sourceName, ...item.clusterHeadlines.map((c) => c.source)]
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).slice(0, 4);

  const outletText = distinctOutlets.length > 0 ? distinctOutlets.join(', ') : item.sourceName;

  const rewrittenDesc = paraphraseProseText(item.descriptionText);

  const subheadline =
    rewrittenDesc && rewrittenDesc.length > 35
      ? truncateAtWordBoundary(rewrittenDesc, 220)
      : `Reporting compiled across ${outletText} (${formattedIst}).`;

  const summary =
    rewrittenDesc && rewrittenDesc.length > 35
      ? truncateAtWordBoundary(rewrittenDesc, 320)
      : `${title} — developments compiled from accounts across ${outletText} on ${formattedIst}.`;

  const paragraphs: string[] = [];

  if (rewrittenDesc && rewrittenDesc.length > 35) {
    paragraphs.push(
      `<p>${escapeHtml(dateline)} — ${escapeHtml(rewrittenDesc)}</p>`
    );
    paragraphs.push(
      `<p>Accounts compiled from ${escapeHtml(outletText)} (${escapeHtml(formattedIst)}) underscore sustained institutional and public focus on ${escapeHtml(smartLowerFirst(title))}.</p>`
    );
  } else {
    paragraphs.push(
      `<p>${escapeHtml(dateline)} — ${escapeHtml(title)}, according to newsroom accounts carried by ${escapeHtml(outletText)} on ${escapeHtml(formattedIst)}.</p>`
    );
    paragraphs.push(
      `<p>Further details published across ${escapeHtml(outletText)} point to active administrative and sector-level follow-up around the announcement.</p>`
    );
  }

  if (item.clusterHeadlines.length > 1) {
    const rewrittenAngles = item.clusterHeadlines
      .slice(0, 3)
      .map((c) => `${escapeHtml(c.source)} notes that ${escapeHtml(smartLowerFirst(paraphraseHeadline(c.title, categorySlug)))}`)
      .join('; ');
    paragraphs.push(
      `<p>Additional reporting across independent outlets adds context: ${rewrittenAngles}.</p>`
    );
  }

  const contentHtml = stripDisallowedEditorialBoilerplate(sanitizeEditorialHtml(paragraphs.join('\n')));
  const featuredImageUrl = item.imageUrl || pickVerifiedFallbackImage(categorySlug, title, summary);
  const slugBase = generateSlug(title).slice(0, 72) || `dispatch-${Date.now()}`;

  return {
    sourceGuid: item.guid,
    sourceName: outletText,
    sourceUrl: item.link,
    title,
    subheadline: subheadline.slice(0, 420),
    slug: `${slugBase}-${Math.abs(hashString(item.guid)).toString(36).slice(0, 5)}`,
    summary: summary.slice(0, 500),
    contentHtml,
    featuredImageUrl,
    imageCaption: featuredImageUrl ? `File visual related to ${title}.` : '',
    imageCredit: item.imageUrl ? `Via ${item.sourceName}` : featuredImageUrl ? 'THE CONTINENTAL Archive' : '',
    categorySlug,
    authorSlug: chooseAuthorSlug(categorySlug),
    tags: Array.from(new Set([categorySlug.toUpperCase(), ...distinctOutlets.slice(0, 2)])),
    isBreaking: isBreakingCandidate(title, summary),
    publishedAtIso: item.pubDateIso,
    topicSignature: computeTopicSignature(title),
  };
}

export function mergeDevelopingStoryUpdate(
  existingContentHtml: string,
  existingSummary: string,
  incoming: SynthesizedDispatch,
  nowIso: string
): { changed: boolean; nextSummary: string; nextContentHtml: string } {
  const cleanExisting = stripDisallowedEditorialBoilerplate(existingContentHtml);
  const existingPlain = stripHtmlTags(cleanExisting).toLowerCase();
  const existingTokens = computeTopicTokens(existingPlain);
  const incomingTokens = computeTopicTokens(`${incoming.title} ${incoming.summary}`);

  let novelTokens = 0;
  for (const t of incomingTokens) {
    if (!existingTokens.has(t)) novelTokens++;
  }

  if (existingPlain.includes(incoming.title.toLowerCase()) || novelTokens < 3) {
    return {
      changed: cleanExisting !== existingContentHtml,
      nextSummary: existingSummary,
      nextContentHtml: cleanExisting,
    };
  }

  const updateTimeLabel = formatHistoricalArticleDate(nowIso);
  const updateBlock = `
<h2>Follow-Up Update (${escapeHtml(updateTimeLabel)})</h2>
<p><strong>${escapeHtml(incoming.title)}</strong> — ${escapeHtml(incoming.summary)} <em>(Reported via ${escapeHtml(incoming.sourceName)})</em></p>`;

  const nextContentHtml = stripDisallowedEditorialBoilerplate(
    sanitizeEditorialHtml(`${cleanExisting}\n${updateBlock}`)
  );
  const nextSummary = incoming.summary.length > existingSummary.length ? incoming.summary : existingSummary;
  return { changed: true, nextSummary, nextContentHtml };
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return h;
}
