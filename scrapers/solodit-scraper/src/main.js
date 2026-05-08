import { PuppeteerCrawler } from 'crawlee';

const soloditCrawler = new PuppeteerCrawler({
    async requestHandler({ page, request, log }) {
        log.info(`Scraping vulnerabilities from ${request.url}`);
        
        // Wait for the vulnerability cards to appear in the DOM
        await page.waitForSelector('.vulnerability-card-selector'); 

        const results = await page.$$eval('.vulnerability-card-selector', (cards) => {
            return cards.slice(0, 10).map(card => ({
                title: card.querySelector('h3').innerText,
                severity: card.querySelector('.severity-tag').innerText,
                description: card.querySelector('.summary').innerText,
            }));
        });

        await Dataset.pushData(results);
    },
});