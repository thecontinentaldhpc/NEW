import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSite } from '../context/SiteContext';
import type { Article, Category } from '../types/publication';
import {
  buildCalendarMonthGrid,
  formatYearMonthHeading,
  formatYearMonthKey,
  shiftYearMonth,
  toIstIsoDateKey,
} from '../lib/allInOne';
import { calculateReadingTimeMinutes } from '../lib/editorialRules';
import { formatHistoricalArticleDate } from '../lib/dateIst';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AllInOnePage() {
  const { istDate, categories: siteCategories } = useSite();

  const [calYear, setCalYear] = useState<number>(() => istDate.year || 2026);
  const [calMonth, setCalMonth] = useState<number>(() => istDate.month || 11);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [articles, setArticles] = useState<Article[]>([]);
  const [countsByDate, setCountsByDate] = useState<Record<string, number>>({});
  const [totalAllPublished, setTotalAllPublished] = useState<number>(0);
  const [apiCategories, setApiCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'All in One — Calendar & Word/PDF News Archive | THE CONTINENTAL';
  }, []);

  const loadArchive = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.getAllInOne({
        date: selectedDate || undefined,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
      });
      setArticles(res.articles);
      setCountsByDate(res.countsByDate);
      setTotalAllPublished(res.totalAllPublished);
      if (res.categories?.length) {
        setApiCategories(res.categories);
      }
      // If initial load has no articles in the current IST month, keep calendar usable and jump to latest article month when appropriate
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load news archive.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedCategory]);

  useEffect(() => {
    void loadArchive();
    const onNewsUpdate = () => {
      void loadArchive();
    };
    window.addEventListener('tc:news-updated', onNewsUpdate);
    return () => window.removeEventListener('tc:news-updated', onNewsUpdate);
  }, [loadArchive]);

  // Keep initial calendar view anchored on a month that has dispatches if current month has zero
  useEffect(() => {
    const activeMonthKey = formatYearMonthKey(calYear, calMonth);
    const hasInActiveMonth = Object.keys(countsByDate).some((k) => k.startsWith(activeMonthKey));
    if (!hasInActiveMonth && !selectedDate) {
      const latestDateKey = Object.keys(countsByDate).sort().reverse()[0];
      if (latestDateKey) {
        const [y, m] = latestDateKey.split('-').map((n) => Number.parseInt(n, 10));
        if (y && m) {
          setCalYear(y);
          setCalMonth(m);
        }
      }
    }
    // Run only when countsByDate changes from initial fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAllPublished]);

  const categories = apiCategories.length > 0 ? apiCategories : siteCategories;

  const calendarCells = useMemo(
    () => buildCalendarMonthGrid(calYear, calMonth, countsByDate, istDate.isoDate),
    [calYear, calMonth, countsByDate, istDate.isoDate]
  );

  const monthDispatchTotal = useMemo(() => {
    const prefix = formatYearMonthKey(calYear, calMonth);
    return Object.entries(countsByDate).reduce(
      (sum, [dateKey, count]) => (dateKey.startsWith(prefix) ? sum + count : sum),
      0
    );
  }, [calYear, calMonth, countsByDate]);

  const handleShiftMonth = (delta: number) => {
    const next = shiftYearMonth(calYear, calMonth, delta);
    setCalYear(next.year);
    setCalMonth(next.month);
  };

  const hasActiveFilter = Boolean(selectedDate || selectedCategory !== 'all');

  const filteredDocxUrl = api.buildAllInOneExportUrl('docx', {
    date: selectedDate || undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
  });
  const filteredPdfUrl = api.buildAllInOneExportUrl('pdf', {
    date: selectedDate || undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
  });

  const allNewsDocxUrl = api.buildAllInOneExportUrl('docx');
  const allNewsPdfUrl = api.buildAllInOneExportUrl('pdf');

  return (
    <main className="max-w-[1320px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Page Header & Public Access Word/PDF Download Actions */}
      <div className="border-b-2 border-neutral-950 dark:border-neutral-700 pb-6 mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8C1D24] dark:text-[#eb7a80]">
            Public Edition Desk &amp; Calendar
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-neutral-50 mt-1">
            ALL IN ONE
          </h1>
          <p className="font-prose text-base sm:text-lg text-neutral-700 dark:text-neutral-300 mt-2.5 leading-relaxed">
            Browse every published dispatch on the interactive edition calendar and save complete news editions in Microsoft Word (.docx) or PDF (.pdf) — open to everyone.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={allNewsDocxUrl}
            download
            data-testid="allinone-download-all-docx"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold uppercase tracking-wider hover:bg-[#8C1D24] dark:hover:bg-[#8C1D24] dark:hover:text-white transition-colors"
          >
            <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Save All News (Word .docx)</span>
          </a>

          <a
            href={allNewsPdfUrl}
            download
            data-testid="allinone-download-all-pdf"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#8C1D24] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#6e151a] transition-colors"
          >
            <FileDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Save All News (PDF .pdf)</span>
          </a>
        </div>
      </div>

      {/* Main 2-Column Layout: Calendar Sidebar + Filtered Dispatches */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Interactive Calendar + Filter & Selection Export Controls */}
        <aside className="lg:col-span-5 xl:col-span-4 space-y-5">
          <section
            aria-label="Edition Calendar"
            data-testid="allinone-calendar"
            className="border-2 border-neutral-950 dark:border-neutral-700 bg-[#FAF9F6] dark:bg-[#181818] p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-neutral-300 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#8C1D24] dark:text-[#eb7a80]" aria-hidden="true" />
                <h2 className="font-serif text-lg sm:text-xl font-bold text-neutral-950 dark:text-neutral-50">
                  {formatYearMonthHeading(calYear, calMonth)}
                </h2>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="cal-prev-month"
                  onClick={() => handleShiftMonth(-1)}
                  aria-label="Previous month"
                  className="p-1.5 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1e1e1e] text-neutral-800 dark:text-neutral-200 hover:border-neutral-900 dark:hover:border-neutral-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="cal-next-month"
                  onClick={() => handleShiftMonth(1)}
                  aria-label="Next month"
                  className="p-1.5 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1e1e1e] text-neutral-800 dark:text-neutral-200 hover:border-neutral-900 dark:hover:border-neutral-400"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 pb-2">
              {WEEKDAYS.map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 tabular-nums">
              {calendarCells.map((cell) => {
                const isSelected = selectedDate === cell.isoDate;
                const hasStories = cell.count > 0;

                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    data-testid={`cal-day-${cell.isoDate}`}
                    aria-label={`${cell.isoDate}${hasStories ? `, ${cell.count} articles` : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedDate((prev) => (prev === cell.isoDate ? '' : cell.isoDate));
                      if (!cell.inCurrentMonth) {
                        const [y, m] = cell.isoDate.split('-').map((n) => Number.parseInt(n, 10));
                        if (y && m) {
                          setCalYear(y);
                          setCalMonth(m);
                        }
                      }
                    }}
                    className={`relative h-12 flex flex-col items-center justify-center border text-xs transition-colors ${
                      isSelected
                        ? 'border-[#8C1D24] bg-[#8C1D24] text-white font-bold'
                        : cell.inCurrentMonth
                          ? hasStories
                            ? 'border-neutral-300 dark:border-neutral-600 bg-white dark:bg-[#222222] text-neutral-950 dark:text-neutral-50 font-semibold hover:border-[#8C1D24] dark:hover:border-[#eb7a80]'
                            : 'border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-[#161616] text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                          : 'border-transparent bg-transparent text-neutral-400 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-[#1e1e1e]'
                    }`}
                  >
                    <span>{cell.day}</span>
                    {hasStories ? (
                      <span
                        className={`text-[9px] leading-none mt-0.5 font-mono ${
                          isSelected ? 'text-white/95' : 'text-[#8C1D24] dark:text-[#eb7a80] font-bold'
                        }`}
                      >
                        {cell.count}
                      </span>
                    ) : cell.isToday ? (
                      <span
                        className={`w-1 h-1 rounded-full mt-1 ${
                          isSelected ? 'bg-white' : 'bg-neutral-500 dark:bg-neutral-400'
                        }`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-300 dark:border-neutral-700 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 dark:text-neutral-400 tabular-nums">
              <span>
                This month: <strong className="text-neutral-950 dark:text-neutral-100">{monthDispatchTotal}</strong>{' '}
                {monthDispatchTotal === 1 ? 'dispatch' : 'dispatches'}
              </span>
              {selectedDate && (
                <button
                  type="button"
                  data-testid="cal-clear-date"
                  onClick={() => setSelectedDate('')}
                  className="inline-flex items-center gap-1 font-semibold text-[#8C1D24] dark:text-[#eb7a80] hover:underline"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Show All Dates</span>
                </button>
              )}
            </div>
          </section>

          {/* Section Filter & Export Selection Box */}
          <section className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#181818] p-4 sm:p-5 space-y-4">
            <div>
              <label
                htmlFor="allinone-category-filter"
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-1.5"
              >
                <Filter className="w-3.5 h-3.5 text-[#8C1D24] dark:text-[#eb7a80]" aria-hidden="true" />
                <span>Filter by Section</span>
              </label>
              <select
                id="allinone-category-filter"
                data-testid="allinone-category-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#1e1e1e] text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
              >
                <option value="all">All Sections ({totalAllPublished})</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilter && (
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  Save Filtered Selection ({articles.length})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={filteredDocxUrl}
                    download
                    data-testid="allinone-download-filtered-docx"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-900 dark:border-neutral-400 text-xs font-semibold text-neutral-900 dark:text-neutral-100 hover:bg-neutral-900 hover:text-white dark:hover:bg-neutral-100 dark:hover:text-neutral-950 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Word (.docx)</span>
                  </a>
                  <a
                    href={filteredPdfUrl}
                    download
                    data-testid="allinone-download-filtered-pdf"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-[#8C1D24] text-xs font-semibold text-[#8C1D24] dark:text-[#eb7a80] hover:bg-[#8C1D24] hover:text-white transition-colors"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>PDF (.pdf)</span>
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate('');
                    setSelectedCategory('all');
                  }}
                  className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white underline"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </section>
        </aside>

        {/* Right: Dispatches List */}
        <section className="lg:col-span-7 xl:col-span-8" aria-label="Published Dispatches">
          <div className="border-t-2 border-neutral-950 dark:border-neutral-200 border-b border-neutral-300 dark:border-neutral-800 py-2.5 mb-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-neutral-950 dark:text-neutral-50">
              {selectedDate
                ? `Dispatches for ${selectedDate}`
                : selectedCategory !== 'all'
                  ? `${categories.find((c) => c.slug === selectedCategory)?.name || selectedCategory} Archive`
                  : 'Complete News Feed'}
            </h2>
            <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400 tabular-nums">
              Showing {articles.length} of {totalAllPublished} stories
            </span>
          </div>

          {error && (
            <div role="alert" className="border border-[#8C1D24] bg-red-50 dark:bg-red-950/30 p-4 text-sm text-[#8C1D24] dark:text-[#eb7a80] mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-5 animate-pulse" aria-busy="true">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="border-b border-neutral-200 dark:border-neutral-800 pb-5 space-y-2">
                  <div className="h-3 w-32 bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-6 w-4/5 bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-4 w-full bg-neutral-200 dark:bg-neutral-800" />
                </div>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="border border-neutral-300 dark:border-neutral-700 bg-[#FAF9F6] dark:bg-[#181818] p-8 text-center">
              <p className="font-serif text-xl font-bold text-neutral-900 dark:text-neutral-100">
                No dispatches published on this date.
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                Select another highlighted date on the calendar or reset filters to view all {totalAllPublished} published stories.
              </p>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate('');
                    setSelectedCategory('all');
                  }}
                  className="mt-4 px-5 py-2 bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold uppercase tracking-wider hover:bg-[#8C1D24] dark:hover:bg-[#8C1D24] dark:hover:text-white transition-colors"
                >
                  Show All Dispatches
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800" data-testid="allinone-article-list">
              {articles.map((art, index) => {
                const dateKey = toIstIsoDateKey(art.published_at || art.created_at);
                const readMin = calculateReadingTimeMinutes(art.content_html);
                return (
                  <article key={art.id} className={index === 0 ? 'pb-6' : 'py-6'}>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-bold uppercase tracking-wider text-[#8C1D24] dark:text-[#eb7a80]">
                        {art.category_name || 'News'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={art.published_at || art.created_at} className="tabular-nums">
                        {formatHistoricalArticleDate(art.published_at || art.created_at)}
                      </time>
                      {dateKey && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[11px] tabular-nums">{dateKey}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{readMin} min read</span>
                    </div>

                    <h3 className="font-serif text-xl sm:text-2xl font-bold text-neutral-950 dark:text-neutral-50 mt-1.5 leading-snug">
                      <Link
                        to={`/article/${art.slug}`}
                        className="hover:text-[#8C1D24] dark:hover:text-[#eb7a80] transition-colors"
                      >
                        {art.title}
                      </Link>
                    </h3>

                    {art.summary && (
                      <p className="font-prose text-sm sm:text-base text-neutral-700 dark:text-neutral-300 mt-2 leading-relaxed">
                        {art.summary}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        By <strong className="text-neutral-900 dark:text-neutral-100">{art.author_name}</strong>
                      </span>
                      <Link
                        to={`/article/${art.slug}`}
                        className="inline-flex items-center gap-1 font-semibold text-[#8C1D24] dark:text-[#eb7a80] hover:underline"
                      >
                        <span>Read Full Story</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
