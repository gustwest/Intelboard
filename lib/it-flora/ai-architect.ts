import { System, Asset, SystemType } from '@/store/it-flora/useStore';
import { v4 as uuidv4 } from 'uuid';

export interface ArchitectureRequirements {
    businessContext: string;
    industry: string;
    projectDescription: string;
    functionalRequirements: string[];
    nonFunctionalRequirements: string[];
    acceptanceCriteria: string[];
    technicalPreferences?: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
}

export interface BestPractice {
    id: string;
    category: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    references?: string[];
}

export interface GeneratedArchitecture {
    systems: System[];
    integrations: Array<{
        sourceSystemName: string;
        targetSystemName: string;
        technology?: string;
        description?: string;
    }>;
    layers: {
        name: string;
        systems: string[]; // System names
        description: string;
    }[];
    techStack: {
        category: string;
        technologies: string[];
    }[];
    bestPractices: BestPractice[];
    summary: string;
}

const SYSTEM_PROMPT = `You are an expert software architect with deep knowledge of system design, architectural patterns, and best practices across various industries. Your role is to:

1. Ask insightful clarifying questions to understand the user's needs
2. Suggest appropriate architectural patterns and system components
3. Provide industry-specific best practices
4. Generate detailed, production-ready architecture recommendations
5. Consider scalability, security, maintainability, and cost

When generating architecture:
- Be specific about system components and their responsibilities
- Suggest appropriate technologies and integration patterns
- Include data layer considerations
- Address non-functional requirements (security, performance, etc.)
- Provide actionable best practices

Always output architecture in a structured, parseable format.`;

export async function analyzeRequirements(
    requirements: ArchitectureRequirements
): Promise<{ questions: string[]; initialAnalysis: string }> {
    const prompt = `Analyze these requirements and generate 3-5 clarifying questions to better understand the architecture needs:

Business Context: ${requirements.businessContext}
Industry: ${requirements.industry}
Project: ${requirements.projectDescription}
Functional Requirements: ${requirements.functionalRequirements.join(', ')}
Non-Functional Requirements: ${requirements.nonFunctionalRequirements.join(', ')}
Acceptance Criteria: ${requirements.acceptanceCriteria.join(', ')}
Technical Preferences: ${requirements.technicalPreferences || 'None specified'}

Provide:
1. Initial analysis of the requirements
2. 3-5 specific questions to clarify ambiguities or missing information

Format as JSON:
{
  "analysis": "Your analysis here",
  "questions": ["Question 1", "Question 2", ...]
}`;

    const response = await callOpenAI([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
    ]);

    try {
        const parsed = JSON.parse(response);
        return {
            initialAnalysis: parsed.analysis,
            questions: parsed.questions
        };
    } catch (error) {
        // Fallback if JSON parsing fails
        return {
            initialAnalysis: response,
            questions: extractQuestionsFromText(response)
        };
    }
}

export async function generateArchitecture(
    requirements: ArchitectureRequirements,
    conversationHistory: Message[]
): Promise<GeneratedArchitecture> {
    const prompt = `Based on all the information gathered, generate a complete system architecture.

REQUIREMENTS:
${JSON.stringify(requirements, null, 2)}

CONVERSATION HISTORY:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Generate a complete architecture with:
1. System components (specific services, databases, APIs)
2. Integration patterns between systems
3. Architectural layers (frontend, backend, data, etc.)
4. Technology stack recommendations
5. Best practices specific to this use case

Output as JSON with this exact structure:
{
  "summary": "Brief overview of the architecture",
  "layers": [
    {
      "name": "Layer name (e.g., Frontend, API Gateway, Services, Data)",
      "description": "Purpose of this layer",
      "systems": ["System1", "System2"]
    }
  ],
  "systems": [
    {
      "name": "System name",
      "type": "Source System|Data Warehouse|Data Lake|Other",
      "description": "What this system does",
      "schema": "Schema name if applicable",
      "assets": [
        {
          "name": "Asset name (e.g., users_table, api_endpoint)",
          "type": "Table|API|File|Topic|Queue",
          "description": "Asset purpose"
        }
      ]
    }
  ],
  "integrations": [
    {
      "sourceSystemName": "Source system name",
      "targetSystemName": "Target system name",
      "technology": "REST API|GraphQL|Kafka|etc",
      "description": "Integration purpose"
    }
  ],
  "techStack": [
    {
      "category": "Frontend|Backend|Database|Infrastructure|etc",
      "technologies": ["Tech1", "Tech2"]
    }
  ],
  "bestPractices": [
    {
      "category": "Security|Scalability|Performance|Maintainability|etc",
      "title": "Practice title",
      "description": "Why and how to implement",
      "priority": "high|medium|low",
      "references": ["Optional reference links"]
    }
  ]
}`;

    const response = await callOpenAI([
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt }
    ]);

    return parseArchitectureResponse(response);
}

export async function askFollowUpQuestion(
    currentContext: string,
    conversationHistory: Message[]
): Promise<string> {
    const prompt = `${currentContext}

Based on the conversation so far, what's the most important question to ask next to finalize the architecture? Be specific and focused.`;

    return await callOpenAI([
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt }
    ]);
}

// Helper: Call OpenAI API
async function callOpenAI(messages: Array<{ role: string; content: string }>): Promise<string> {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error('OpenAI API key not configured. Please add OPENAI_API_KEY to your .env.local file.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages,
            temperature: 0.7,
            max_tokens: 4000
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

// Helper: Parse architecture from AI response
function parseArchitectureResponse(response: string): GeneratedArchitecture {
    try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : response;

        const parsed = JSON.parse(jsonStr);

        // Convert parsed architecture to our format with proper IDs and positions
        const systems: System[] = parsed.systems.map((sys: any, index: number) => ({
            id: uuidv4(),
            name: sys.name,
            type: (sys.type || 'Other') as SystemType,
            description: sys.description,
            position: {
                x: 100 + (index % 3) * 300,
                y: 100 + Math.floor(index / 3) * 200
            },
            assets: (sys.assets || []).map((asset: any) => ({
                id: uuidv4(),
                name: asset.name,
                type: asset.type || 'Table',
                description: asset.description,
                systemId: '', // Will be set when imported
                status: 'Planned' as const,
                verificationStatus: 'Unverified' as const,
                schema: sys.schema,
                columns: []
            })),
            documents: []
        }));

        const bestPractices: BestPractice[] = (parsed.bestPractices || []).map((bp: any) => ({
            id: uuidv4(),
            category: bp.category,
            title: bp.title,
            description: bp.description,
            priority: bp.priority || 'medium',
            references: bp.references || []
        }));

        return {
            systems,
            integrations: parsed.integrations || [],
            layers: parsed.layers || [],
            techStack: parsed.techStack || [],
            bestPractices,
            summary: parsed.summary || 'Generated architecture'
        };
    } catch (error) {
        console.error('Failed to parse architecture response:', error);
        console.log('Raw response:', response);

        // Fallback: Create a basic structure
        return {
            systems: [],
            integrations: [],
            layers: [],
            techStack: [],
            bestPractices: [],
            summary: 'Failed to parse architecture. Please try again with more specific requirements.'
        };
    }
}

// Helper: Extract questions from unstructured text
function extractQuestionsFromText(text: string): string[] {
    const questions: string[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        // Look for lines that are questions (end with ?) or numbered items
        if (trimmed.endsWith('?') || /^\d+\./.test(trimmed)) {
            const cleaned = trimmed.replace(/^\d+\.\s*/, '').trim();
            if (cleaned) questions.push(cleaned);
        }
    }

    return questions.length > 0 ? questions : ['What are your main scalability concerns?'];
}
