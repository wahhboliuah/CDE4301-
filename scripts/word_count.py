"""Count the words in the report body for the CDE4301 limit (3,000 words for individual projects).

Counts headings, paragraphs, lists, tables and figure captions in each chapter.
Excludes navigation, the 3D viewer controls, the print-only duplicate figure,
the References list, and anything marked class="appendix".
Run: python3 scripts/word_count.py
"""
import re
from html.parser import HTMLParser
from pathlib import Path

LIMIT = 3000
SKIP_TAGS = {'script', 'style', 'nav', 'aside', 'noscript', 'button'}
SKIP_CLASSES = {'sv-stage', 'sv-print', 'references', 'appendix', 'page-nav', 'report-cover'}
WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’.\-/%°±×–]*")


class Counter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []  # (tag, skipped)
        self.chapter = None
        self.counts = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set((attrs.get('class') or '').split())
        skipped = tag in SKIP_TAGS or bool(classes & SKIP_CLASSES) or attrs.get('id') == 'references'
        if tag == 'article':
            self.chapter = attrs.get('data-chapter')
        if tag in {'img', 'br', 'meta', 'link', 'input', 'source'}:
            return
        self.stack.append((tag, skipped))

    def handle_endtag(self, tag):
        while self.stack:
            open_tag, _ = self.stack.pop()
            if open_tag == tag:
                break

    def handle_data(self, data):
        if not self.chapter or any(skipped for _, skipped in self.stack):
            return
        # Legend cards in the 3D viewer section are report text, so count their descriptions.
        self.counts[self.chapter] = self.counts.get(self.chapter, 0) + len(WORD.findall(data))


def main():
    html = Path(__file__).resolve().parent.parent.joinpath('index.html').read_text(encoding='utf-8')
    # Subsystem cards are buttons but contain report text: count them as paragraphs.
    html = re.sub(r'<button type="button" data-sv-subsystem="[^"]+">', '<span>', html).replace('</span></button>', '</span></span>')
    counter = Counter()
    counter.feed(html)
    total = 0
    for chapter, words in counter.counts.items():
        total += words
        print(f'{chapter:16} {words:5d}')
    print(f'{"Total":16} {total:5d}  (limit {LIMIT}, {LIMIT - total} remaining)')


if __name__ == '__main__':
    main()
