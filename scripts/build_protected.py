"""Bundle the complete report, including images, and encrypt it for GitHub Pages.

Only the encrypted index.html is placed in dist. No raw chapters or assets are
deployed. The password must come from the STATICRYPT_PASSWORD environment variable.
"""
import base64
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'


def local_file(reference):
    if ':' in reference or reference.startswith(('/', '\\')) or '?' in reference or '#' in reference:
        raise ValueError('The protected report must use local relative assets.')
    path = (ROOT / reference).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise ValueError('A report asset is missing or outside the repository.')
    return path


def bundle():
    content = (ROOT / 'index.html').read_text(encoding='utf-8')
    def inline_css(match):
        css = local_file(match[1]).read_text(encoding='utf-8')
        if re.search(r'url\s*\(|@import|</style', css, flags=re.I):
            raise ValueError('CSS with external assets or closing tags needs explicit bundling support.')
        return '<style>\n' + css + '\n</style>'
    def inline_script(match):
        js = local_file(match[1]).read_text(encoding='utf-8')
        if '</script' in js.lower():
            raise ValueError('Script contains a closing HTML script tag.')
        return '<script>\n' + js + '\n</script>'
    def inline_image(match):
        path = local_file(match[2])
        mime = mimetypes.guess_type(path.name)[0]
        if mime not in {'image/png', 'image/jpeg', 'image/webp', 'image/gif'}:
            raise ValueError('Unsupported image format for the protected report.')
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        return match[1] + 'data:' + mime + ';base64,' + data + match[3]
    content = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>', inline_css, content)
    content = re.sub(r'<script\s+src="([^"]+)"\s*>\s*</script>', inline_script, content)
    content = re.sub(r'(<img\b[^>]*\bsrc=")([^"]+)(")', inline_image, content)
    if re.search(r'<(?:iframe|video|audio|source|object|embed)\b|\bsrcset\s*=|<link\b', content, re.I):
        raise ValueError('Report contains an asset that is not supported by the secure bundler.')
    for src in re.findall(r'\bsrc="([^"]+)"', content):
        if not src.startswith('data:image/'):
            raise ValueError('A report asset would remain outside the encrypted page.')
    return content


def main():
    # Never leave a previous successful result available after a failed build.
    if DIST.exists():
        shutil.rmtree(DIST)
    password = os.environ.get('STATICRYPT_PASSWORD', '')
    if len(password) < 16:
        sys.exit('Set STATICRYPT_PASSWORD to a unique password of at least 16 characters. No site was produced.')
    executable = ROOT / 'node_modules' / '.bin' / 'staticrypt'
    if not executable.is_file():
        sys.exit('Run npm ci --ignore-scripts before building.')
    with tempfile.TemporaryDirectory(prefix='protected-report-') as temporary:
        temp = Path(temporary)
        source = temp / 'index.html'
        source.write_text(bundle(), encoding='utf-8')
        output = temp / 'encrypted'
        result = subprocess.run([
            str(executable), str(source), '--directory', str(output),
            '--config', 'false', '--remember', 'false',
            '--template-title', 'CDE4301 · Report access',
            '--template-instructions', 'Enter the report password to view the chapters and figures.',
            '--template-button', 'Open report', '--template-color-primary', '#19558a',
            '--template-color-secondary', '#f7f9fc',
        ], cwd=temp, capture_output=True, text=True)
        if result.returncode:
            sys.exit('Encryption failed. No site was produced.')
        encrypted = output / 'index.html'
        if not encrypted.is_file():
            sys.exit('Encryption did not produce the expected page.')
        text = encrypted.read_text(encoding='utf-8')
        if '<article class="chapter"' in text or 'data:image/png;base64,' in text:
            sys.exit('Unencrypted report content was detected. No site was produced.')
        DIST.mkdir()
        shutil.copyfile(encrypted, DIST / 'index.html')
    print('Built encrypted dist/index.html with all report images embedded. No raw assets were copied.')


if __name__ == '__main__':
    main()
