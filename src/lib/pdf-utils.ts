import * as pdfjsLib from 'pdfjs-dist';

// Set worker source to a CDN to avoid webpack issues in Next.js
// Note: Version must match the installed version. 
// We'll dynamically get the version if possible, or hardcode a recent stable one matching the install.
// pdfjs-dist v4.x usually requires a specific worker setup.
// For simplicity, we will try to use the build included in the package if possible, 
// but CDN is safer for client-side only usage without complex webpack config.

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromPDF(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');

            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }

        return fullText;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error('Failed to extract text from PDF');
    }
}
