import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useSite } from '../context/SiteContext';
import type { Article } from '../types/publication';
import { formatNewsUpdatedLabel, resolveArticleTimestamp } from '../lib/dateIst';
import { calculateReadingTimeMinutes } from '../lib/editorialRules';
import { countEditorialWords } from '../lib/readerPreferences';
import { EditorialImage } from '../components/EditorialImage';
import { ArticleBookmarkButton } from '../components/ArticleBookmarkButton';

type SectionSort = 'latest' | 'longest';

export function CategoryPage({ slug, title }: { slug: string; title: string }) {
  const { categories, istDate, setEditionUpdatedAt } = useSite();
  const [articles, setArticles] = useState<Article[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SectionSort>('latest');

  const categoryMeta = categories.find((c) => c.slug === slug);

  useEffect(() => {
    setPage(1);
  }, [slug]);

  const fetchArticles = useCallback(() => {
    setLoading(true);
    api
      .getArticles({ category: slug, page, limit: 12 })
      .then((res) => {
        setArticles(res.articles);
        setTotalPages(res.pagination.totalPages);
        if (res.editionUpdatedAt) {
          setEditionUpdatedAt(res.editionUpdatedAt);
        }
      })
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [slug, page, setEditionUpdatedAt]);

  useEffect(() => {
    document.title = `${categoryMeta?.name || title} | THE CONTINENTAL`;
    fetchArticles();

    const onUpdate = () => fetchArticles();
    window.addEventListener('tc:news-updated', onUpdate);
    window.addEventListener('focus', onUpdate);
    return () => {
      window.removeEventListener('tc:news-updated', onUpdate);
      window.removeEventListener('focus', onUpdate);
    };
  }, [fetchArticles, categoryMeta?.name, title]);

  const sortedArticles = useMemo(() => {
    if (sortBy === 'longest') {
      return [...articles].sort(
        (a, b) =>
          countEditorialWords(b.content_html || b.summary || '') -
          countEditorialWords(a.content_html || a.summary || '')
      );
    }
    return articles;
  }, [articles, sortBy]);

  const lead = sortedArticles[0];
  const rest = sortedArticles.slice(1);

  return (
    <main className="max-w-[1320px] mx-auto px-4 sm:px-6 py-8">
      <div className="border-b-2 border-neutral-950 dark:border-neutral-200 pb-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8C1D24] dark:text-[#eb7a80]">Section Dispatch</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-neutral-950 dark:text-neutral-50 mt-1">
            {categoryMeta?.name || title}
          </h1>
          {categoryMeta?.description && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-2 max-w-2xl">{categoryMeta.description}</p>
          )}
        </div>

        {!loading && articles.length > 1 && (
          <div role="group" aria-label="Sort dispatches" className="inline-flex border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#181818] text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setSortBy('latest')}
              aria-pressed={sortBy === 'latest'}
              className={`px-3 py-1.5 transition-colors whitespace-nowrap shrink-0 ${
                sortBy === 'latest'
                  ? 'bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950'
                  : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white'
              }`}
            >
              Latest First
            </button>
            <button
              type="button"
              onClick={() => setSortBy('longest')}
              aria-pressed={sortBy === 'longest'}
              className={`px-3 py-1.5 border-l border-neutral-300 dark:border-neutral-700 transition-colors whitespace-nowrap shrink-0 ${
                sortBy === 'longest'
                  ? 'bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950'
                  : 'text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white'
              }`}
            >
              In-Depth Reads
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-8 animate-pulse" aria-busy="true" aria-label="Loading section articles">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-8 border-b border-neutral-200 dark:border-neutral-800">
            <div className="lg:col-span-7 aspect-[16/9] bg-neutral-200 dark:bg-neutral-800" />
            <div className="lg:col-span-5 space-y-3 py-4">
              <div className="h-3 w-28 bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-8 w-full bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-4 w-5/6 bg-neutral-200 dark:bg-neutral-800" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map((n) => (
              <div key={n} className="space-y-3">
                <div className="aspect-[4/3] bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-5 w-full bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-4 w-4/5 bg-neutral-200 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        </div>
      ) : articles.length === 0 ? (
        <div className="border border-neutral-200 dark:border-neutral-800 bg-[#FAF9F6] dark:bg-[#181818] p-10 text-center">
          <p className="font-serif text-xl text-neutral-800 dark:text-neutral-200">No published dispatches in this section yet.</p>
          <Link
            to="/publish-your-writing"
            className="inline-block mt-4 px-5 py-2.5 bg-[#111111] dark:bg-neutral-100 text-white dark:text-neutral-950 text-xs font-semibold uppercase tracking-wider hover:bg-[#8C1D24] dark:hover:bg-[#8C1D24] dark:hover:text-white"
          >
            Submit an Article to {categoryMeta?.name || title}
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          {lead && (
            <article className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-8 border-b border-neutral-300 dark:border-neutral-800 group">
              {lead.featured_image_url && (
                <Link to={`/article/${lead.slug}`} className="lg:col-span-7 block">
                  <EditorialImage src={lead.featured_image_url} alt={lead.title} aspectClass="aspect-[16/9]" />
                </Link>
              )}
              <div className={lead.featured_image_url ? 'lg:col-span-5 flex flex-col justify-center' : 'lg:col-span-12'}>
                <p className="text-xs font-bold uppercase tracking-widest text-[#8C1D24] dark:text-[#eb7a80] mb-2">Featured in {lead.category_name}</p>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-neutral-50 group-hover:text-[#8C1D24] dark:group-hover:text-[#eb7a80] leading-tight">
                  <Link to={`/article/${lead.slug}`}>{lead.title}</Link>
                </h2>
                {lead.subheadline && <p className="text-base text-neutral-700 dark:text-neutral-300 mt-3">{lead.subheadline}</p>}
                <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-3 leading-relaxed">{lead.summary}</p>
                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                  <p>
                    By <span className="font-semibold text-neutral-800 dark:text-neutral-200">{lead.author_name}</span> ·{' '}
                    {(() => {
                      const ts = resolveArticleTimestamp(lead);
                      const lbl = formatNewsUpdatedLabel(ts.iso, new Date(istDate.nowMs));
                      return `${ts.label}: ${lbl.combined}`;
                    })()}{' '}
                    · {calculateReadingTimeMinutes(lead.content_html || lead.summary || '')} min read
                  </p>
                  <ArticleBookmarkButton article={lead} variant="pillless" />
                </div>
              </div>
            </article>
          )}

          {rest.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {rest.map((art) => {
                const ts = resolveArticleTimestamp(art);
                const lbl = formatNewsUpdatedLabel(ts.iso, new Date(istDate.nowMs));
                const readMins = calculateReadingTimeMinutes(art.content_html || art.summary || '');
                return (
                  <article key={art.id} className="group border-b border-neutral-200 dark:border-neutral-800 pb-6 flex flex-col justify-between">
                    <div>
                      {art.featured_image_url && (
                        <Link to={`/article/${art.slug}`} className="block mb-3">
                          <EditorialImage src={art.featured_image_url} alt={art.title} aspectClass="aspect-[4/3]" />
                        </Link>
                      )}
                      <h3 className="font-serif text-xl font-bold text-neutral-950 dark:text-neutral-50 group-hover:text-[#8C1D24] dark:group-hover:text-[#eb7a80] leading-snug">
                        <Link to={`/article/${art.slug}`}>{art.title}</Link>
                      </h3>
                      <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-2 line-clamp-3">{art.summary}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                      <p className="min-w-0">
                        {art.author_name} ·{' '}
                        {ts.isUpdated ? `Updated · ${lbl.formatted}` : lbl.formatted} · {readMins} min read
                      </p>
                      <ArticleBookmarkButton article={art} className="-mr-1.5 shrink-0" />
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-neutral-100 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-900 dark:text-neutral-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
