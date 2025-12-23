import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, Loader2, Mail, Text, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/language-provider";

interface SmartImportProps {
    onImport: (data: {
        title: string;
        description: string;
        urgency: "Low" | "Medium" | "High" | "Critical";
        attributes: Record<string, string>;
        acceptanceCriteria: string[];
    }) => void;
}

export function SmartImport({ onImport }: SmartImportProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [textInput, setTextInput] = useState("");
    const [mode, setMode] = useState<"drop" | "text">("text");
    const { t } = useLanguage();

    const processContent = async (content: string, filename?: string) => {
        setIsProcessing(true);

        // Simulate AI processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Mock AI extraction logic
        const lowerContent = content.toLowerCase();
        // Generate a descriptive title based on content keywords
        let extractedTitle = filename ? filename.split(".")[0] : "New Request";

        if (lowerContent.includes("analytics") || lowerContent.includes("dwh")) {
            extractedTitle = "Modernisering av Analytics / DWH";
        } else if (lowerContent.includes("erp") || lowerContent.includes("crm")) {
            extractedTitle = "Strategisk översyn: ERP & CRM Integration";
        } else if (lowerContent.includes("ai") || lowerContent.includes("data science")) {
            extractedTitle = "AI & Data Science Förstudie";
        } else if (lowerContent.includes("arkitektur") || lowerContent.includes("arkitekt")) {
            extractedTitle = "Arkitekturell rådgivning: Framtidssäkring";
        } else {
            // If no specific keyword, try to take the first few words and capitalize
            const words = content.trim().split(/\s+/).slice(0, 5);
            if (words.length > 0) {
                const firstWords = words.join(" ");
                extractedTitle = firstWords.charAt(0).toUpperCase() + firstWords.slice(1);
            } else {
                // Fallback to first line if no words found
                const lines = content.split('\n');
                if (lines.length > 0 && lines[0].length < 100) {
                    extractedTitle = lines[0].trim();
                }
            }
        }
        let title = extractedTitle;
        let urgency: "Low" | "Medium" | "High" | "Critical" = "Medium";
        const attributes: Record<string, string> = {};

        // Extract Urgency
        if (lowerContent.includes("urgent") || lowerContent.includes("crash") || lowerContent.includes("critical") || lowerContent.includes("immediately")) {
            urgency = "Critical";
        } else if (lowerContent.includes("asap") || lowerContent.includes("high priority") || lowerContent.includes("important")) {
            urgency = "High";
        }

        // Mock Attribute Extraction
        if (lowerContent.includes("budget")) {
            const budgetMatch = content.match(/budget[:\s]+([$€£]?\d+[\d,.]*k?)/i);
            if (budgetMatch) attributes["Budget"] = budgetMatch[1];
        }

        if (lowerContent.includes("timeline") || lowerContent.includes("deadline")) {
            const timelineMatch = content.match(/(?:timeline|deadline)[:\s]+([^.\n]+)/i);
            if (timelineMatch) attributes["Timeline"] = timelineMatch[1].trim();
        }

        if (lowerContent.includes("tech stack") || lowerContent.includes("technologies")) {
            const techMatch = content.match(/(?:tech stack|technologies)[:\s]+([^.\n]+)/i);
            if (techMatch) attributes["Tech Stack"] = techMatch[1].trim();
        }

        if (lowerContent.includes("compliance")) {
            attributes["Compliance"] = "Required";
        }

        // Strictly transform input into the requested one-sentence "User Story" format.
        // We do NOT include the original content or any metadata.

        let extractedRole = "[Person/Roll]";
        if (lowerContent.includes("verksamhetschef")) extractedRole = "Verksamhetschef";
        else if (lowerContent.includes("it-chef") || lowerContent.includes("bi manager")) extractedRole = "IT-ledare";
        else if (lowerContent.includes("arkitekt")) extractedRole = "IT-arkitekt";
        else if (lowerContent.includes("specialist")) extractedRole = "Specialist";

        let extractedNeed = title.toLowerCase();
        if (lowerContent.includes("analytics") || lowerContent.includes("dwh")) extractedNeed = "modernisering av analytics-plattform";
        if (lowerContent.includes("förstudie")) extractedNeed = "en förstudie kring tekniska vägval";
        if (lowerContent.includes("erp") || lowerContent.includes("crm")) extractedNeed = "kartläggning av systemberoenden";

        let extractedBenefit = "[Nytta]";
        if (lowerContent.includes("datadriven")) extractedBenefit = "bli mer datadrivna";
        if (lowerContent.includes("ai") || lowerContent.includes("analys")) extractedBenefit = "möjliggöra avancerad analys";
        if (lowerContent.includes("effektiv")) extractedBenefit = "öka effektiviteten";
        if (lowerContent.includes("skalbar")) extractedBenefit = "få en skalbar lösning";

        // Generate a brief context summary (simulated AI summary)
        let contextSummary = "";
        if (lowerContent.includes("analytics") || lowerContent.includes("dwh")) {
            contextSummary = "Bakgrunden är ett behov av att modernisera nuvarande on-prem DWH-lösning för att möta krav på AI och bättre prestanda.";
        } else if (lowerContent.includes("erp") || lowerContent.includes("crm")) {
            contextSummary = "Behovet rör kartläggning av beroenden mellan pågående ERP- och CRM-projekt.";
        } else {
            contextSummary = content.split('\n')[0].slice(0, 100) + "..."; // Fallback to first line
        }

        // Extract "Nuläge" and "Önskat läge" (simulated AI extraction)
        let nulage = "Information saknas";
        let onskatLage = "Information saknas";

        if (lowerContent.includes("analytics") || lowerContent.includes("dwh")) {
            nulage = "Nuvarande miljö är on-prem (SQL Server) med tunga ETL-flöden som blivit en flaskhals för verksamheten.";
            onskatLage = "En modern, molnbaserad dataplattform som stödjer AI, skalbarhet och snabbare leveranser till verksamheten.";
        } else if (lowerContent.includes("erp") || lowerContent.includes("crm")) {
            nulage = "Pågående parallella uppgraderingar av ERP och CRM skapar osäkerhet kring dataflöden.";
            onskatLage = "En tydligt kartlagd bild av alla systemberoenden och en synkad roadmap för integrationer.";
        }

        const description = `**User Story:** Jag/vi är en ${extractedRole} som behöver ${extractedNeed} för att uppnå ${extractedBenefit}.\n\n**Kontext:** ${contextSummary}\n\n**Nuläge:** ${nulage}\n\n**Önskat läge:** ${onskatLage}`;

        // Suggest Acceptance Criteria (AC) - FOCUS: Insights and Next Steps
        const suggestedAC: string[] = [
            "Genomföra en 1-4h workshop/diskussion med expert för att bryta ner problematiken",
            "Identifiera och prioritera kritiska insikter för nästa steg",
            "Utforska 2-3 olika tillvägagångssätt och deras förutsättningar"
        ];

        if (lowerContent.includes("beslut") || lowerContent.includes("vägval")) {
            suggestedAC.push("Skapa ett beslutsunderlag med rekommenderade vägval framåt");
        }

        if (lowerContent.includes("analys") || lowerContent.includes("nuläge")) {
            suggestedAC.push("Sammanställa lärdomar från nulägesanalysen för att sänka risken i projektet");
        }

        onImport({
            title: extractedTitle,
            description,
            urgency,
            attributes,
            acceptanceCriteria: suggestedAC
        });
        setIsProcessing(false);
        setTextInput("");
        setMode("drop");
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        // In a real app, we'd read the file content here
        // For mock, we just use filename
        processContent(`Imported content from ${acceptedFiles[0].name}`, acceptedFiles[0].name);
    }, []);

    const handleTextSubmit = () => {
        if (!textInput.trim()) return;
        processContent(textInput);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/plain': ['.txt', '.md'],
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'message/rfc822': ['.eml', '.msg']
        },
        maxFiles: 1
    });

    if (isProcessing) {
        return (
            <Card className="border-dashed h-[200px] flex items-center justify-center">
                <div className="flex flex-col items-center space-y-4 text-center">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <div className="space-y-1">
                        <p className="font-medium flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-yellow-500" />
                            AI is analyzing content...
                        </p>
                        <p className="text-xs text-muted-foreground">Extracting requirements, categories, and user stories</p>
                    </div>
                </div>
            </Card>
        )
    }

    return (
        <Card className="overflow-hidden">
            <div className="flex border-b">
                <button
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors hover:bg-slate-50",
                        mode === "text" ? "bg-slate-50 border-b-2 border-primary text-primary" : "text-muted-foreground"
                    )}
                    onClick={() => setMode("text")}
                >
                    <div className="flex items-center justify-center gap-2">
                        <Text className="h-4 w-4" />
                        Free text / Notes regarding the need
                    </div>
                </button>
                <button
                    className={cn(
                        "flex-1 py-3 text-sm font-medium transition-colors hover:bg-slate-50",
                        mode === "drop" ? "bg-slate-50 border-b-2 border-primary text-primary" : "text-muted-foreground"
                    )}
                    onClick={() => setMode("drop")}
                >
                    <div className="flex items-center justify-center gap-2">
                        <Upload className="h-4 w-4" />
                        File upload
                    </div>
                </button>
            </div>

            <CardContent className="p-6">
                {mode === "drop" ? (
                    <div
                        {...getRootProps()}
                        className={cn(
                            "border-2 border-dashed rounded-lg h-[150px] flex flex-col items-center justify-center cursor-pointer transition-colors",
                            isDragActive ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="p-3 rounded-full bg-primary/10 mb-3">
                            <Upload className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-sm font-medium">Drag & drop files here</p>
                        <p className="text-xs text-muted-foreground mt-1">Emails (.eml), Docs (.pdf, .docx), Text</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="smart-text" className="sr-only">Paste content</Label>
                            <Textarea
                                id="smart-text"
                                placeholder="Paste email thread, project brief, or rough notes here..."
                                className="min-h-[120px]"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={handleTextSubmit}
                            disabled={!textInput.trim()}
                            className="w-full gap-2"
                        >
                            <Sparkles className="h-4 w-4" />
                            Smart Extract
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
