import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from 'fs';
import * as path from 'path';

async function testModel() {
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const apiKeyMatch = envContent.match(/GEMINI_API_KEY=(.*)/);

    if (!apiKeyMatch) return;
    const apiKey = apiKeyMatch[1].trim();

    const genAI = new GoogleGenerativeAI(apiKey);

    const modelsToTest = [
        "models/gemini-2.5-flash-preview-09-2025",
        "models/gemini-2.5-pro",
        "models/gemini-pro-latest"
    ];

    for (const modelName of modelsToTest) {
        console.log(`\nTesting model: ${modelName}...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello!");
            const response = await result.response;
            console.log(`✅ SUCCESS: ${modelName} works!`);
            break;
        } catch (error: any) {
            console.error(`❌ FAILED: ${modelName}`);
            console.error("Error:", error.message);
        }
    }
}

testModel();
