import sys
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from robotexclusionrulesparser import RobotExclusionRulesParser
import logging
import asyncio
import aiohttp

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def fetch_robots_txt(base_url):
    """Fetch and parse robots.txt using cache to improve efficiency."""
    robots_url = urljoin(base_url, '/robots.txt')
    parser = RobotExclusionRulesParser()
    try:
        parser.fetch(robots_url)
        return parser
    except Exception as e:
        logging.error(f"Failed to fetch robots.txt from {robots_url}: {e}")
        return None

def is_valid_url(url, base_domain):
    """Check if the URL is within the domain to be crawled."""
    parsed_url = urlparse(url)
    return parsed_url.netloc == base_domain

async def fetch_page(session, url):
    """Fetch a single page asynchronously."""
    try:
        async with session.get(url) as response:
            content = await response.text()
            return response.status, content
    except Exception as e:
        logging.error(f"Error accessing {url}: {e}")
        return None, None

def parse_page(status_code, content, current_url):
    """Parse the HTML content of a page and extract useful information."""
    soup = BeautifulSoup(content, 'html.parser')
    title_tag = soup.find("title")
    title_text = title_tag.get_text(strip=True) if title_tag else "No title"
    canonical = soup.find('link', rel='canonical')
    canonical_url = canonical['href'] if canonical else ''
    description = soup.find('meta', attrs={'name': 'description'})
    description_content = description['content'] if description else ''
    internal_links = [urljoin(current_url, link['href']) for link in soup.find_all('a', href=True)]
    return {
        'url': current_url,
        'title': title_text,
        'status_code': status_code,
        'canonical': canonical_url,
        'description': description_content,
        'internal_links': internal_links
    }

async def crawl(url):
    base_domain = urlparse(url).netloc
    robots_parser = fetch_robots_txt(url)
    if not robots_parser:
        return []

    visited = set()
    queue = [url]
    results = []

    async with aiohttp.ClientSession() as session:
        while queue:
            current_url = queue.pop(0)
            if current_url in visited or not robots_parser.is_allowed('*', current_url):
                continue
            visited.add(current_url)

            status, content = await fetch_page(session, current_url)
            if content:
                page_data = parse_page(status, content, current_url)
                results.append(page_data)
                for link in page_data['internal_links']:
                    if is_valid_url(link, base_domain) and link not in visited:
                        queue.append(link)

    return results

if __name__ == "__main__":
    url = sys.argv[1]
    results = asyncio.run(crawl(url))
    with open('crawl_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=4)
    with open('crawl_results.json', 'r', encoding='utf-8') as f:
        # 修正箇所：エンコーディングエラーを回避するために標準出力をUTF-8に設定
        sys.stdout.reconfigure(encoding='utf-8')
        print(f.read())
