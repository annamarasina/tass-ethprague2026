import { CheerioCrawler, Dataset } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ $, request, log }) {
        // Look for links containing "Technical Standard", "RTS", or "Guideline"
        $('a[href*="pdf"], a[href*="technical-standard"]').each((i, el) => {
            const link = $(el).attr('href');
            const description = $(el).text().trim();
            
            // We only want the newest updates from 2025-2026
            if (description.includes('2025') || description.includes('2026')) {
                Dataset.pushData({
                    source: 'ESMA_OFFICIAL',
                    type: 'Regulatory_Update',
                    title: description,
                    url: new URL(link, request.url).href,
                    scrapedAt: new Date().toISOString(),
                });
            }
        });
    },
});

await crawler.run(['https://www.esma.europa.eu/sections/mica']);