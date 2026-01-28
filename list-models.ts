import * as fs from 'fs';
import * as path from 'path';

async function listModels() {
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);

    if (!apiKeyMatch) { return; }
    const apiKey = apiKeyMatch[1].trim();

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log("--- Gemini 1.5 Models ---");
            const models = data.models.filter((m: any) =>
                m.name.includes("1.5") &&
                m.supportedGenerationMethods.includes("generateContent")
            );

            models.forEach((m: any) => {
                console.log(`Name: ${m.name}`);
            });

            console.log("--- Gemini Pro Models ---");
            const proModels = data.models.filter((m: any) =>
                m.name.includes("pro") &&
                !m.name.includes("1.5") &&
                m.supportedGenerationMethods.includes("generateContent")
            );
            proModels.forEach((m: any) => {
                console.log(`Name: ${m.name}`);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

listModels();
