'use server';

import OpenAI from 'openai';
import mammoth from 'mammoth';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function processTextWithAI(text: string) {
    if (!text || text.length < 50) {
        return { error: "Not enough text to analyze. Please provide more detail." };
    }

    // AI Extraction
    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `You are an expert HR assistant. Extract structured candidate profile data from the provided text.
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
                `
            },
            {
                role: "user",
                content: text.slice(0, 20000) // Extended limit for large copy-pastes
            }
        ],
        response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return { success: true, data: result };
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
