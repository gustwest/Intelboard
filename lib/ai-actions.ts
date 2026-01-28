'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from 'mammoth';

async function processTextWithAI(text: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Gemini API Key is missing");
        return { success: false, error: "Server Error: Gemini API Key is not configured." };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    if (!text || text.length < 50) {
        return { error: "Not enough text to analyze. Please provide more detail." };
    }

    const prompt = `
    You are an expert HR assistant. Extract structured candidate profile data from the provided text.
    Return ONLY VALID JSON with this structure:
    {
        "bio": "Professional summary...",
        "jobTitle": "Most relevant job title",
        "skills": [{ "name": "Skill", "category": "Category" }],
        "workExperience": [{ "company": "", "title": "", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" | null, "description": "" }],
        "education": [{ "school": "", "degree": "", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }]
    }
    For dates, use YYYY-MM-DD format. Use null for 'Present' end dates.
    Infer categories for skills (e.g. 'Technical', 'Soft Skills', 'Tools').

    TEXT TO ANALYZE:
    ${text.slice(0, 30000)}
    `;

    try {
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();

        // Clean up markdown code blocks if present
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const data = JSON.parse(responseText);
        return { success: true, data };
    } catch (error: any) {
        console.error("Gemini Extraction Error:", error);
        return { success: false, error: "Failed to parse AI response." };
    }
}

export async function extractProfileFromText(text: string) {
    try {
        return await processTextWithAI(text);
    } catch (error: any) {
        console.error("AI Text Extraction Error:", error);
        return { success: false, error: error.message || "Failed to analyze text." };
    }
}

export async function extractProfileFromFile(formData: FormData) {
    try {
        const file = formData.get("file") as File;
        if (!file) return { error: "No file uploaded." };

        let text = "";

        if (file.name.endsWith(".docx")) {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const result = await mammoth.extractRawText({ buffer });
            text = result.value;
        } else if (file.name.endsWith(".pdf")) {
            return { error: "PDF support coming soon. Please use DOCX or paste text." };
        } else {
            return { error: "Unsupported file type." };
        }

        return await processTextWithAI(text);

    } catch (error: any) {
        console.error("AI File Extraction Error:", error);
        return { success: false, error: error.message || "Failed to analyze file." };
    }
}
