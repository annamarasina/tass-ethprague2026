import { CheerioCrawler, Dataset } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ $, request, log }) {
        log.info(`Agent scanning: ${request.url}`);

        
        let foundCount = 0;

        $('a').each((index, element) => {
            const title = $(element).text().replace(/\s+/g, ' ').trim(); 
            const link = $(element).attr('href');

            if (title.length > 20 && link) { // Lowered character count slightly for EBA
                 const baseUrl = request.url.includes('esma') ? 'https://www.esma.europa.eu' : 'https://www.eba.europa.eu';
                 const fullUrl = link.startsWith('http') ? link : new URL(link, baseUrl).href;

                 let isRelevant = false;

                 // ESMA is a general news feed, so we MUST strictly filter for crypto words
                 if (request.url.includes('esma')) {
                     const esmaKeywords = ['MiCA', 'Crypto', 'Token', 'Asset'];
                     isRelevant = esmaKeywords.some(k => title.toLowerCase().includes(k.toLowerCase()));
                 } 
                 // EBA is a dedicated MiCA page. EVERYTHING here is about MiCA!
                 // We just need to make sure we are grabbing documents, not menu buttons.
                 else if (request.url.includes('eba')) {
                     const ebaKeywords = ['Report', 'Guideline', 'Opinion', 'Consultation', 'Standard'];
                     isRelevant = ebaKeywords.some(k => title.toLowerCase().includes(k.toLowerCase()));
                 }

                 if (isRelevant) {
                     Dataset.pushData({
                        source: request.url.includes('esma') ? 'ESMA_WATCHDOG' : 'EBA_WATCHDOG',
                        type: 'Regulatory_Update',
                        title: title,
                        url: fullUrl,
                        scrapedAt: new Date().toISOString()
                    });
                    foundCount++;
                 }
            }
        });
        
        log.info(`✅ Successfully extracted ${foundCount} regulatory updates from this page!`);
    },
});

await crawler.run([
    'https://www.esma.europa.eu/press-news/esma-news?f%5B0%5D=topics%3A1184', 
]);