import { useEffect } from "react";

interface Seo {
  title: string;
  description: string;
  path: string;
  image?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

const BASE = "https://gndec-compass.koushikjain2007.workers.dev";

function setMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

export function useSeo({ title, description, path, image, jsonLd, noindex }: Seo) {
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', { name: "description", content: description });
    setMeta('meta[name="robots"]', { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large" });
    setMeta('meta[property="og:title"]', { property: "og:title", content: title });
    setMeta('meta[property="og:description"]', { property: "og:description", content: description });
    setMeta('meta[property="og:url"]', { property: "og:url", content: `${BASE}${path}` });
    setMeta('meta[property="og:image"]', { property: "og:image", content: image ? `${BASE}${image}` : `${BASE}/assets/img/og.jpg` });
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    setMeta('meta[name="twitter:image"]', { name: "twitter:image", content: image ? `${BASE}${image}` : `${BASE}/assets/img/og.jpg` });
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${BASE}${path}`;
    document.querySelectorAll('script[data-compass-jsonld="true"]').forEach((n) => n.remove());
    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.compassJsonld = "true";
      script.textContent = JSON.stringify(Array.isArray(jsonLd) ? { "@context": "https://schema.org", "@graph": jsonLd } : { "@context": "https://schema.org", ...jsonLd });
      document.head.appendChild(script);
    }
  }, [title, description, path, image, jsonLd, noindex]);
}

export { BASE };
