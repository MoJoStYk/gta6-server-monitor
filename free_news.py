"""THE WIRE: noticias gratuitas mediante RSS públicos; sin credenciales."""
import threading
import time
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote, urlsplit
import requests
from flask import jsonify

_LOCK = threading.Lock()
_CACHE = {'until': 0, 'value': None}
_QUERIES = [
    ('GTA VI', '"GTA 6" OR "GTA VI" when:14d'),
    ('Rockstar', '"Rockstar Games" OR "GTA Online" when:14d'),
]

def _timestamp(s):
    try:
        dt = parsedate_to_datetime(s)
        return dt.astimezone(timezone.utc).isoformat() if dt.tzinfo else dt.replace(tzinfo=timezone.utc).isoformat()
    except (TypeError, ValueError, IndexError):
        return ''

def _is_official_url(url):
    """Only direct HTTPS links to an allowlisted Rockstar domain count as verified."""
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or '').lower().rstrip('.')
        return parsed.scheme == 'https' and (host == 'rockstargames.com' or host.endswith('.rockstargames.com'))
    except ValueError:
        return False

def _fetch(label, query):
    url = 'https://news.google.com/rss/search?q=' + quote(query) + '&hl=es&gl=ES&ceid=ES:es'
    resp = requests.get(url, timeout=10, headers={'User-Agent': 'ViceCityNewsMonitor/3.7 (+RSS reader)', 'Accept': 'application/rss+xml, application/xml, text/xml'})
    resp.raise_for_status()
    if len(resp.content) > 2_000_000:
        raise ValueError('Feed demasiado grande')
    root = ET.fromstring(resp.content)
    out = []
    for item in root.findall('./channel/item')[:35]:
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        source = item.find('source')
        publisher = ((source.text or '').strip() if source is not None else '') or 'Fuente externa'
        when = _timestamp(item.findtext('pubDate'))
        if not title or not link.startswith('https://'):
            continue
        # Los enlaces remiten al agregador o al editor; no se extraen artículos completos.
        out.append({'id': link, 'text': title[:300], 'title': title[:300],
                    'username': publisher, 'publisher': publisher, 'category': label,
                    'created_at': when, 'url': link, 'metrics': {}, 'engagement': 0,
                    'official': _is_official_url(link), 'attributed_official': publisher.casefold().strip() in {'rockstar games', 'rockstar games newsroom'}})
    return out

def register_free_news(app):
    @app.route('/api/news')
    def api_news_free():
        now = time.monotonic()
        with _LOCK:
            if _CACHE['value'] is not None and now < _CACHE['until']:
                return jsonify(_CACHE['value'])
        items, errors = [], []
        for label, query in _QUERIES:
            try:
                items.extend(_fetch(label, query))
            except (requests.RequestException, ET.ParseError, ValueError) as exc:
                app.logger.warning('RSS THE WIRE (%s): %s', label, str(exc)[:140])
                errors.append(label)
        unique = {}
        for p in items:
            key = re.sub(r'\W+', '', p['title'].casefold())[:110]
            if key and key not in unique:
                unique[key] = p
        items = sorted(unique.values(), key=lambda x: x['created_at'], reverse=True)[:50]
        # La pestaña "En tendencia" usa relevancia editorial, NO métricas sociales.
        for p in items:
            t = p['title'].lower()
            p['relevance'] = (3 if ('gta vi' in t or 'gta 6' in t or 'grand theft auto vi' in t) else 0) + (1 if 'rockstar' in t else 0) + (1 if p['official'] else 0)
        payload = {'state': 'ok' if items else 'unavailable', 'items': items,
                   'source': 'RSS público · Google News', 'ranking': 'relevancia editorial (no popularidad medida)',
                   'fetched_at': datetime.now(timezone.utc).isoformat(),
                   'partial': bool(errors), 'failed_feeds': errors}
        with _LOCK:
            _CACHE.update(value=payload, until=time.monotonic() + (900 if items else 180))
        return jsonify(payload)
