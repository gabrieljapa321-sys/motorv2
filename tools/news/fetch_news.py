from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


RSS_ROOT = "https://news.google.com/rss/search"
USER_AGENT = "motor-news-bot/1.0 (+https://github.com/gabrieljapa321-sys/motorv2)"
MAX_ITEMS_PER_CATEGORY = 18
MAX_ITEMS_TOTAL = 64
BLOCKED_SOURCE_DOMAINS = {
    "instagram.com",
    "youtube.com",
    "tiktok.com",
    "facebook.com",
    "linkedin.com",
}
PREMIUM_SOURCE_PATTERNS = (
    "valor.globo.com",
    "valorinveste.globo.com",
)
QUERY_DEFINITIONS = [
    {
        "id": "latest",
        "label": "Ultima hora",
        "query": 'mercado financeiro OR ibovespa OR dolar OR juros when:1d',
        "tags": ["mercado", "bolsa", "macro"],
    },
    {
        "id": "funds",
        "label": "Fundos",
        "query": '"fundos de investimento" OR "fundo imobiliario" OR asset when:2d',
        "tags": ["fundos", "asset", "fiis"],
    },
    {
        "id": "companies",
        "label": "Empresas",
        "query": 'empresas brasileiras OR balanco OR guidance OR fusao when:2d',
        "tags": ["empresas", "resultados", "m&a"],
    },
    {
        "id": "macro",
        "label": "Macro",
        "query": 'inflacao OR fiscal OR selic OR fed OR pib when:2d',
        "tags": ["macro", "juros", "inflacao"],
    },
]


def build_feed_url(query: str) -> str:
    params = {
        "q": query,
        "hl": "pt-BR",
        "gl": "BR",
        "ceid": "BR:pt-419",
    }
    return f"{RSS_ROOT}?{urllib.parse.urlencode(params)}"


def collapse_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def strip_html(value: str) -> str:
    return collapse_spaces(html.unescape(re.sub(r"<[^>]+>", " ", value or "")))


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", collapse_spaces(value).lower()).strip("-")


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def remove_source_suffix(title: str, source: str) -> str:
    clean_title = collapse_spaces(title)
    clean_source = collapse_spaces(source)
    suffix = f" - {clean_source}"
    if clean_source and clean_title.endswith(suffix):
        return clean_title[: -len(suffix)].rstrip(" -")
    return clean_title


def build_summary(title: str, source: str, description: str, category_label: str) -> str:
    summary = strip_html(description)
    if title:
      summary = summary.replace(collapse_spaces(title), "", 1).strip(" -")
    if source:
      summary = summary.replace(collapse_spaces(source), "", 1).strip(" -")
    summary = collapse_spaces(summary)
    if summary:
        return summary[:280]
    return f"Atualizacao de {category_label.lower()} capturada em {source or 'fonte externa'}."


def is_blocked_source(source_url: str, source_name: str) -> bool:
    haystack = f"{source_url} {source_name}".lower()
    return any(domain in haystack for domain in BLOCKED_SOURCE_DOMAINS)


def is_premium_source(source_url: str, source_name: str) -> bool:
    haystack = f"{source_url} {source_name}".lower()
    return any(pattern in haystack for pattern in PREMIUM_SOURCE_PATTERNS)


def fetch_rss(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def extract_items(definition: dict[str, object]) -> list[dict[str, object]]:
    category_id = str(definition["id"])
    category_label = str(definition["label"])
    base_tags = list(definition.get("tags", []))
    xml_bytes = fetch_rss(build_feed_url(str(definition["query"])))
    root = ET.fromstring(xml_bytes)
    items: list[dict[str, object]] = []

    for item in root.findall("./channel/item"):
        title = collapse_spaces(item.findtext("title") or "")
        link = collapse_spaces(item.findtext("link") or "")
        source_element = item.find("source")
        source_name = collapse_spaces(source_element.text or "") if source_element is not None else ""
        source_url = collapse_spaces(source_element.attrib.get("url", "")) if source_element is not None else ""
        if is_blocked_source(source_url, source_name) or not title or not link:
            continue

        title = remove_source_suffix(title, source_name)
        published_at = parse_date(item.findtext("pubDate")) or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        digest = hashlib.sha1(f"{category_id}|{source_name}|{title}|{published_at}".encode("utf-8")).hexdigest()[:24]
        items.append(
            {
                "id": f"{category_id}-{digest}",
                "title": title,
                "summary": build_summary(title, source_name, item.findtext("description") or "", category_label),
                "url": link,
                "source": source_name or "Fonte",
                "category": category_id,
                "tags": base_tags[:4],
                "publishedAt": published_at,
                "updatedAt": published_at,
                "premium": is_premium_source(source_url, source_name),
                "sourceQuery": str(definition["query"]),
            }
        )

    items.sort(key=lambda entry: entry["publishedAt"], reverse=True)
    return items[:MAX_ITEMS_PER_CATEGORY]


def dedupe_items(items: list[dict[str, object]]) -> list[dict[str, object]]:
    seen: set[str] = set()
    output: list[dict[str, object]] = []
    for item in sorted(items, key=lambda entry: entry["publishedAt"], reverse=True):
        signature = normalize_key(f"{item['title']}|{item['source']}")
        if not signature or signature in seen:
            continue
        seen.add(signature)
        output.append(item)
        if len(output) >= MAX_ITEMS_TOTAL:
            break
    return output


def build_payload() -> dict[str, object]:
    items: list[dict[str, object]] = []
    warnings: list[str] = []
    for definition in QUERY_DEFINITIONS:
        try:
            items.extend(extract_items(definition))
        except Exception as error:  # pragma: no cover - network dependent
            warnings.append(f"[news] falha ao consultar {definition['id']}: {error}")

    if warnings:
        print("\n".join(warnings), file=sys.stderr)

    items = dedupe_items(items)
    if not items:
        raise SystemExit("Nenhuma noticia foi coletada.")

    now_iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sources = sorted({str(item["source"]) for item in items}, key=str.lower)
    return {
        "updatedAt": now_iso,
        "generatedAt": now_iso,
        "categories": [{"id": "all", "label": "Tudo"}]
        + [{"id": definition["id"], "label": definition["label"]} for definition in QUERY_DEFINITIONS],
        "sources": [{"id": normalize_key(source), "label": source} for source in sources],
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza o feed de noticias do Motor.")
    parser.add_argument("--output", default="assets/data/news.json", help="Caminho do arquivo de saida.")
    args = parser.parse_args()

    payload = build_payload()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[news] feed atualizado em {output_path} com {len(payload['items'])} itens.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
