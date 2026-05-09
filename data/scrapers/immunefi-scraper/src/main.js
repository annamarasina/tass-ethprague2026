import { PuppeteerCrawler, Dataset } from 'crawlee';

const immunefiCrawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 3, 
    
    async requestHandler({ page, request, log }) {
        log.info(`Agent landed on: ${request.url}`);

        // 1. Wait for the page to load
        await page.waitForSelector('a');

        // 2. Find links that point to specific bug-fix review articles
        const articleLinks = await page.$$eval('a', (links) => {
            return links
                .map(a => a.href)
                // Filter: Must be a bug-fix-review link, but NOT the main category page itself
                .filter(href => href.includes('/blog/bug-fix-reviews/') && href.length > 45);
        });

        // Remove duplicates and grab the top 3
        const uniqueLinks = [...new Set(articleLinks)].slice(0, 3);
        log.info(`Found ${uniqueLinks.length} technical post-mortems. Scraping...`);

        // 3. Loop through the links, visit them, and extract the text
        for (const link of uniqueLinks) {
            await page.goto(link);
            
            // Wait for the article title to appear (fallback to 'main' or 'article' if h1 is missing)
            await page.waitForSelector('h1, article, main'); 

            const details = await page.evaluate(() => {
                const title = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : 'No Title Found';
                
                // Blogs have a lot of text. We target the main content areas.
                const contentNode = document.querySelector('article') || document.querySelector('main') || document.body;
                let contentText = contentNode.innerText.trim();
                
                // Hackathon trick: Cap the length at 3000 characters so we don't blow up our LLM token limit later
                if (contentText.length > 3000) {
                    contentText = contentText.substring(0, 3000) + '... [TRUNCATED]';
                }

                return {
                    source: 'IMMUNEFI_POST_MORTEM',
                    title: title,
                    description: contentText,
                    url: window.location.href,
                    scrapedAt: new Date().toISOString()
                };
            });

            log.info(`Scraped: ${details.title}`);
            await Dataset.pushData(details);
        }
    },
});

// Run it directly on the Bug Fix Reviews category page!
await immunefiCrawler.run(['https://immunefi.com/blog/bug-fix-reviews/']);