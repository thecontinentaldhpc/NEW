import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyArticleCategory,
  computeTitleSimilarity,
  decodeXmlEntities,
  mergeDevelopingStoryUpdate,
  paraphraseHeadline,
  paraphraseProseText,
  parseGNewsApiArticles,
  parseRssFeedXml,
  stripDisallowedEditorialBoilerplate,
  synthesizeEditorialDispatch,
} from './liveNewsParser';

test('decodeXmlEntities decodes CDATA and XML/HTML entities accurately', () => {
  const decoded = decodeXmlEntities('<![CDATA[India &amp; ASEAN&#39;s &#x201C;Act East&#x201D; summit]]>');
  assert.equal(decoded, 'India & ASEAN\'s “Act East” summit');
});

test('parseRssFeedXml parses Google News clusters and strips source suffix cleanly', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <item>
      <title>Chip tensions loom over summit, as nations push AI safety steps - Reuters</title>
      <link>https://news.google.com/rss/articles/sample123</link>
      <guid isPermaLink="false">gnews-123</guid>
      <pubDate>Mon, 16 Nov 2026 12:15:34 GMT</pubDate>
      <description>&lt;ol&gt;&lt;li&gt;&lt;a href="#"&gt;Chip tensions loom over summit, as nations push AI safety steps&lt;/a&gt;&lt;font&gt;Reuters&lt;/font&gt;&lt;/li&gt;&lt;li&gt;&lt;a href="#"&gt;Semiconductor export rules reviewed ahead of ministerial talks&lt;/a&gt;&lt;font&gt;The Hindu&lt;/font&gt;&lt;/li&gt;&lt;/ol&gt;</description>
      <source url="https://www.reuters.com">Reuters</source>
    </item>
  </channel></rss>`;

  const items = parseRssFeedXml(sampleXml, 'google-news', 'world');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Chip tensions loom over summit, as nations push AI safety steps');
  assert.equal(items[0].sourceName, 'Reuters');
  assert.equal(items[0].clusterHeadlines.length, 2);
  assert.equal(items[0].clusterHeadlines[1].source, 'The Hindu');
});

test('synthesizeEditorialDispatch paraphrases headline and prose without Editorial Verification boilerplate', () => {
  const hinduXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
    <item>
      <title><![CDATA[Cyclone Akvan likely to make landfall along Andhra coast ahead of storm alert]]></title>
      <description><![CDATA[Fishermen urged to remain ashore as IMD warns of heavy coastal winds.]]></description>
      <link><![CDATA[https://www.thehindu.com/news/national/cyclone-akvan/article71706785.ece]]></link>
      <guid isPermaLink="false">article-71706785</guid>
      <category><![CDATA[Andhra Pradesh]]></category>
      <pubDate><![CDATA[Mon, 16 Nov 2026 22:34:51 +0530]]></pubDate>
      <media:content height="675" medium="image" url="https://th-i.thgim.com/public/news/sample.jpg" width="1200"/>
    </item>
  </channel></rss>`;

  const items = parseRssFeedXml(hinduXml, 'the-hindu', 'india');
  assert.equal(items.length, 1);
  assert.equal(items[0].imageUrl, 'https://th-i.thgim.com/public/news/sample.jpg');

  const dispatch = synthesizeEditorialDispatch(items[0]);
  assert.equal(dispatch.categorySlug, 'environment');
  assert.equal(dispatch.isBreaking, true);
  assert.equal(dispatch.featuredImageUrl, 'https://th-i.thgim.com/public/news/sample.jpg');
  // Headline and body must be rephrased rather than copied ditto
  assert.notEqual(dispatch.title.toLowerCase(), items[0].title.toLowerCase());
  assert.ok(dispatch.title.includes('Cyclone Akvan'));
  assert.ok(dispatch.title.includes('Andhra'));
  assert.notEqual(dispatch.summary.toLowerCase(), items[0].descriptionText.toLowerCase());
  // Never emit disallowed boilerplate text
  assert.ok(!dispatch.contentHtml.includes('Editorial Verification'));
  assert.ok(!dispatch.contentHtml.includes('Ongoing Monitoring'));
  assert.ok(!dispatch.contentHtml.includes('synthesises verified factual threads'));
  assert.ok(!dispatch.summary.includes('Verified and filed in THE CONTINENTAL'));
});

test('paraphraseHeadline and paraphraseProseText alter wording while preserving key facts and acronyms', () => {
  const rawHead = 'Keralam RSS activist Ranjith murder case: 11 CPI(M) workers found guilty';
  const reHead = paraphraseHeadline(rawHead, 'india');
  assert.notEqual(reHead, rawHead);
  assert.ok(reHead.includes('11 CPI(M)'));
  assert.ok(reHead.includes('Ranjith'));
  assert.ok(reHead.toLowerCase().includes('convicted'));
  assert.ok(!reHead.startsWith('Dispatch —'));

  const acronymHead = 'US-China tech tensions put Nvidia, Apple at risk';
  const reAcronym = paraphraseHeadline(acronymHead, 'science-technology');
  assert.notEqual(reAcronym, acronymHead);
  assert.ok(reAcronym.includes('US-China'));
  assert.ok(!reAcronym.includes('uS-China'));

  const rawBody = 'Rupee rises 31 paise to 93.63 against U.S. dollar in early trade, according to currency dealers. (The New York Times). Status Report on new policy.';
  const reBody = paraphraseProseText(rawBody);
  assert.notEqual(reBody, rawBody);
  assert.ok(reBody.includes('31 paise'));
  assert.ok(reBody.includes('93.63'));
  assert.ok(reBody.includes('The New York Times'));
  assert.ok(!reBody.includes('Fresh York'));
  assert.ok(reBody.includes('Status Report'));
  assert.ok(reBody.includes('fresh policy'));
  assert.ok(!reBody.includes(' .'));

  const qHead = paraphraseHeadline('Key question: Why do governments switch off the internet?', 'world');
  assert.ok(!qHead.includes('in Central question'));
});

test('parseRssFeedXml parses BBC, Al Jazeera, and Hindustan Times items cleanly and skips stubs or non-English titles', () => {
  const mixedXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
    <item>
      <title><![CDATA[News Analysis]]></title>
      <description><![CDATA[Short stub.]]></description>
      <link>https://example.com/stub</link>
      <guid>stub-1</guid>
      <pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title><![CDATA[東京の経済ニュースと最新動向について - 朝日新聞]]></title>
      <description><![CDATA[Japanese headline sample.]]></description>
      <link>https://example.com/jp-1</link>
      <guid>jp-1</guid>
      <pubDate>Tue, 17 Nov 2026 11:00:00 GMT</pubDate>
    </item>
    <item>
      <title><![CDATA[Five EU states announce plans for immigration return hubs in Rwanda]]></title>
      <description><![CDATA[European governments say the offshore centres are expected to face legal challenges.]]></description>
      <link>https://www.bbc.co.uk/news/world-1</link>
      <guid>bbc-1</guid>
      <pubDate>Tue, 17 Nov 2026 12:00:00 GMT</pubDate>
      <media:thumbnail url="https://ichef.bbci.co.uk/news/sample.jpg" />
    </item>
  </channel></rss>`;

  const items = parseRssFeedXml(mixedXml, 'bbc', 'world');
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceName, 'BBC News');
  assert.equal(items[0].imageUrl, 'https://ichef.bbci.co.uk/news/sample.jpg');
});

test('parseGNewsApiArticles converts GNews JSON payloads into normalized items', () => {
  const items = parseGNewsApiArticles([
    {
      title: 'Central banks review liquidity buffers amid market volatility',
      description: 'Monetary officials say capital rules remain robust ahead of year-end.',
      url: 'https://example.org/gnews-1',
      image: 'https://cdn.example.org/bank.jpg',
      publishedAt: '2026-11-17T09:00:00Z',
      source: { name: 'Financial Times' },
    },
  ], 'economy');
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceName, 'Financial Times');
  const dispatch = synthesizeEditorialDispatch(items[0]);
  assert.equal(dispatch.categorySlug, 'economy');
  assert.ok(!dispatch.contentHtml.includes('Editorial Verification'));
});

test('stripDisallowedEditorialBoilerplate removes legacy verification sections cleanly', () => {
  const legacyHtml = `<p>First paragraph of news.</p>
<h2>Editorial Verification &amp; Ongoing Monitoring</h2>
<p>THE CONTINENTAL synthesises verified factual threads across independent public sources and updates published dispatches automatically whenever material new information or official statements emerge.</p>`;
  const cleaned = stripDisallowedEditorialBoilerplate(legacyHtml);
  assert.equal(cleaned, '<p>First paragraph of news.</p>');
});

test('classifyArticleCategory routes sports, economy, and science stories accurately', () => {
  assert.equal(classifyArticleCategory('India wins Test match with five-wicket haul', '', '', 'india'), 'sports');
  assert.equal(classifyArticleCategory('RBI holds repo rate steady amid core inflation watch', '', '', 'india'), 'economy');
  assert.equal(classifyArticleCategory('ISRO schedules polar satellite launch for Earth imaging', '', '', 'india'), 'science-technology');
});

test('computeTitleSimilarity and mergeDevelopingStoryUpdate detect and enrich developing issues without duplication', () => {
  const sim = computeTitleSimilarity(
    'Cyclone Akvan to make landfall along Andhra coast',
    'Cyclone Akvan: Odisha deploys 74 rescue teams ahead of Andhra landfall'
  );
  assert.ok(sim >= 0.35);

  const parsed = parseRssFeedXml(
    `<rss version="2.0"><channel><item>
      <title>Cyclone Akvan intensifies as Odisha deploys 74 disaster rescue teams</title>
      <description>Coastal districts evacuate vulnerable residents ahead of storm surge.</description>
      <link>https://www.thehindu.com/news/cyclone-update</link>
      <guid>article-cyclone-2</guid>
      <pubDate>Tue, 17 Nov 2026 07:00:00 +0530</pubDate>
    </item></channel></rss>`,
    'the-hindu',
    'india'
  )[0];

  const synthesized = synthesizeEditorialDispatch(parsed);
  const merged = mergeDevelopingStoryUpdate(
    '<p>IMD issued initial storm warning for Nellore.</p>',
    'Initial storm warning issued.',
    synthesized,
    '2026-11-17T01:45:00.000Z'
  );
  assert.equal(merged.changed, true);
  assert.match(merged.nextContentHtml, /Follow-Up Update/);
  assert.ok(!merged.nextContentHtml.includes('Editorial Verification'));

  const repeat = mergeDevelopingStoryUpdate(
    merged.nextContentHtml,
    merged.nextSummary,
    synthesized,
    '2026-11-17T01:50:00.000Z'
  );
  assert.equal(repeat.changed, false);
});
