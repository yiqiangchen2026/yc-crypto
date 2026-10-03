"""Validate static page links, fragments and image assets before deployment."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1] / 'site'

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.ids, self.links = set(), []
        self.feed(path.read_text(encoding='utf-8'))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        key = 'href' if tag in ('a', 'link') else 'src' if tag in ('img', 'script') else None
        if key and attrs.get(key):
            self.links.append(attrs[key])
        if tag == 'img' and not attrs.get('alt'):
            raise ValueError('Image requires alternative text')

pages = {path: Page(path) for path in ROOT.rglob('*.html')}
errors = []
for path, page in pages.items():
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = ROOT / unquote(url.path).lstrip('/') if url.path.startswith('/') else path.parent / unquote(url.path) if url.path else path
        if target.is_dir():
            target /= 'index.html'
        target = target.resolve()
        if not target.is_relative_to(ROOT.resolve()) or not target.exists():
            errors.append(f'{path.relative_to(ROOT)}: missing {link}')
        elif url.fragment and target.suffix == '.html' and unquote(url.fragment) not in pages[target].ids:
            errors.append(f'{path.relative_to(ROOT)}: missing fragment {link}')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Checked {len(pages)} pages: links, fragments and image assets passed.')
